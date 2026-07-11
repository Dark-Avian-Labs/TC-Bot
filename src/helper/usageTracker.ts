import fs from 'node:fs';
import path from 'node:path';

import Database, { type Statement } from 'better-sqlite3';

import type {
  CommandUsage,
  MetricsTotals,
  MetricsTopCommand,
  MopupStatus,
} from '../types/index.js';

const DB_PATH = process.env.SQLITE_DB_PATH || './data/metrics.db';
const CHECKPOINT_INTERVAL_MS = Number(process.env.CHECKPOINT_INTERVAL_MS || 300000);
const FLUSH_INTERVAL_MS = Number(process.env.METRICS_FLUSH_INTERVAL_MS || 1000);
const FLUSH_BATCH_SIZE = Number(process.env.METRICS_FLUSH_BATCH_SIZE || 50);
const MAX_QUEUE_LENGTH = Number(process.env.METRICS_MAX_QUEUE_LENGTH || 5000);
const MAX_RETRIES = Number(process.env.METRICS_MAX_RETRIES || 3);

function parseMetricsRetentionDays(): number {
  const raw = process.env.METRICS_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') {
    return 90;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 90;
  }
  if (n === 0) {
    return 0;
  }
  if (n < 0) {
    return 90;
  }
  return Math.max(1, Math.floor(n));
}

const RETENTION_DAYS = parseMetricsRetentionDays();
const ALLOWED_CHECKPOINT_MODES = new Set(['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE']);

let db: Database.Database | null = null;
let checkpointTimer: NodeJS.Timeout | null = null;
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;

let insertStmt: Statement | null = null;
let totalsStmt: Statement | null = null;
let topCommandsStmt: Statement | null = null;
let cleanupStmt: Statement | null = null;
let upsertMopupStateStmt: Statement | null = null;
let getMopupStateStmt: Statement | null = null;
let upsertMopupKvStmt: Statement | null = null;
let getMopupKvStmt: Statement | null = null;
let acquireEventLockStmt: Statement | null = null;
let cleanupExpiredEventLocksStmt: Statement | null = null;
let droppedUsageEvents = 0;

type UsageQueueItem = {
  command_name: string;
  user_id: string | null;
  guild_id: string | null;
  success: number;
  error_message: string | null;
  retryCount: number;
};

const usageQueue: UsageQueueItem[] = [];

function recordDroppedUsageEvents(count: number, reason: string): void {
  if (count <= 0) return;
  droppedUsageEvents += count;
  console.warn(
    `[USAGE:SQLite] Dropped ${count} usage event(s) (${reason}). Total dropped: ${droppedUsageEvents}`,
  );
}

function enqueueUsageEvent(item: UsageQueueItem): void {
  usageQueue.push(item);
  while (usageQueue.length > MAX_QUEUE_LENGTH) {
    usageQueue.shift();
    recordDroppedUsageEvents(1, 'queue length cap reached');
  }
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function initDb(): void {
  if (db) return;

  ensureDir(DB_PATH);
  db = new Database(DB_PATH, { fileMustExist: false });

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('wal_autocheckpoint = 10');

  db.exec(`
    CREATE TABLE IF NOT EXISTS command_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_name TEXT NOT NULL,
      user_id TEXT,
      guild_id TEXT,
      success INTEGER NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mopup_update_state (
      key TEXT PRIMARY KEY,
      updated_at_ms INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mopup_kv_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS event_dedupe_lock (
      key TEXT PRIMARY KEY,
      expires_at_ms INTEGER NOT NULL
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_created_at ON command_usage(created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_usage_cmd ON command_usage(command_name);');

  insertStmt = db.prepare(`
    INSERT INTO command_usage
      (command_name, user_id, guild_id, success, error_message)
    VALUES
      (@command_name, @user_id, @guild_id, @success, @error_message)
  `);

  totalsStmt = db.prepare(`
    SELECT
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failure_count,
      COUNT(*) AS total_count
    FROM command_usage
    WHERE created_at >= ?
  `);

  topCommandsStmt = db.prepare(`
    SELECT command_name, COUNT(*) AS cnt
    FROM command_usage
    WHERE created_at >= ?
    GROUP BY command_name
    ORDER BY cnt DESC, command_name ASC
    LIMIT ?
  `);

  cleanupStmt = db.prepare(`
    DELETE FROM command_usage
    WHERE created_at < datetime('now', ?)
  `);

  upsertMopupStateStmt = db.prepare(`
    INSERT INTO mopup_update_state (key, updated_at_ms)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET updated_at_ms = excluded.updated_at_ms
  `);

  getMopupStateStmt = db.prepare(`
    SELECT updated_at_ms
    FROM mopup_update_state
    WHERE key = ?
  `);

  upsertMopupKvStmt = db.prepare(`
    INSERT INTO mopup_kv_state (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  getMopupKvStmt = db.prepare(`
    SELECT value
    FROM mopup_kv_state
    WHERE key = ?
  `);

  acquireEventLockStmt = db.prepare(`
    INSERT INTO event_dedupe_lock (key, expires_at_ms)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET
      expires_at_ms = excluded.expires_at_ms
    WHERE event_dedupe_lock.expires_at_ms <= ?
  `);

  cleanupExpiredEventLocksStmt = db.prepare(`
    DELETE FROM event_dedupe_lock
    WHERE expires_at_ms <= ?
  `);

  purgeOldRecords();

  console.log('[USAGE:SQLite] Initialized at', DB_PATH);
  if (RETENTION_DAYS === 0) {
    console.log('[USAGE:SQLite] METRICS_RETENTION_DAYS=0: automatic retention purge disabled');
  }
}

function purgeOldRecords(): void {
  if (!cleanupStmt) return;
  if (RETENTION_DAYS === 0) {
    return;
  }

  const keepWindow = `-${RETENTION_DAYS} days`;
  cleanupStmt.run(keepWindow);
}

export function logCommandUsage({
  commandName,
  userId,
  guildId,
  success,
  errorMessage,
}: CommandUsage): void {
  enqueueUsageEvent({
    command_name: String(commandName || 'unknown'),
    user_id: userId ? String(userId) : null,
    guild_id: guildId ? String(guildId) : null,
    success: success ? 1 : 0,
    error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null,
    retryCount: 0,
  });

  if (usageQueue.length >= FLUSH_BATCH_SIZE) {
    flushUsageQueue();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushUsageQueue();
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  }
}

function flushUsageQueue(): void {
  if (isFlushing || usageQueue.length === 0) return;

  isFlushing = true;
  const batch = usageQueue.splice(0, usageQueue.length);

  try {
    initDb();
    if (!insertStmt || batch.length === 0) return;

    const tx = db?.transaction((rows: UsageQueueItem[]) => {
      for (const row of rows) {
        insertStmt?.run({
          command_name: row.command_name,
          user_id: row.user_id,
          guild_id: row.guild_id,
          success: row.success,
          error_message: row.error_message,
        });
      }
    });
    tx?.(batch);
  } catch (err) {
    console.error('[USAGE:SQLite] Failed to flush command usage batch:', err);

    const retryable = batch
      .map((item) => ({
        ...item,
        retryCount: item.retryCount + 1,
      }))
      .filter((item) => item.retryCount < MAX_RETRIES);

    const droppedForRetries = batch.length - retryable.length;
    if (droppedForRetries > 0) {
      recordDroppedUsageEvents(droppedForRetries, 'retry limit reached');
    }

    const availableCapacity = Math.max(0, MAX_QUEUE_LENGTH - usageQueue.length);
    if (availableCapacity <= 0) {
      recordDroppedUsageEvents(retryable.length, 'queue full while requeueing failed batch');
    } else {
      const toRequeue = retryable.slice(0, availableCapacity);
      const droppedForCapacity = retryable.length - toRequeue.length;
      if (droppedForCapacity > 0) {
        recordDroppedUsageEvents(droppedForCapacity, 'queue capacity exceeded during requeue');
      }

      if (toRequeue.length > 0) {
        usageQueue.unshift(...toRequeue);
      }
    }
  } finally {
    isFlushing = false;
    if (usageQueue.length > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushUsageQueue();
      }, FLUSH_INTERVAL_MS);
      flushTimer.unref?.();
    }
  }
}

export function getMetricsTotals(sinceUTC: string): MetricsTotals {
  try {
    initDb();
    if (!totalsStmt) {
      return { total_count: 0, success_count: 0, failure_count: 0 };
    }

    const result = totalsStmt.get(sinceUTC) as Partial<MetricsTotals> | undefined;
    return {
      total_count: Number(result?.total_count ?? 0),
      success_count: Number(result?.success_count ?? 0),
      failure_count: Number(result?.failure_count ?? 0),
    };
  } catch (err) {
    console.error('[USAGE:SQLite] Failed to get metrics totals:', err);
    return { total_count: 0, success_count: 0, failure_count: 0 };
  }
}

export function getTopCommands(sinceUTC: string, limit: number): MetricsTopCommand[] {
  try {
    initDb();
    if (!topCommandsStmt) return [];

    return topCommandsStmt.all(sinceUTC, limit) as MetricsTopCommand[];
  } catch (err) {
    console.error('[USAGE:SQLite] Failed to get top commands:', err);
    return [];
  }
}

export function checkpoint(mode = 'TRUNCATE'): void {
  try {
    initDb();
    if (!db) return;
    const normalizedMode = String(mode).toUpperCase();
    const checkpointMode = ALLOWED_CHECKPOINT_MODES.has(normalizedMode)
      ? normalizedMode
      : 'TRUNCATE';

    if (checkpointMode !== normalizedMode) {
      console.warn(`[USAGE:SQLite] Invalid checkpoint mode "${mode}", defaulting to TRUNCATE`);
    }

    db.pragma(`wal_checkpoint(${checkpointMode})`);
  } catch (e) {
    console.error('[USAGE:SQLite] WAL checkpoint failed:', e);
  }
}

export function setMopupUpdateTimestamp(key: string, timestampMs = Date.now()): void {
  try {
    initDb();
    if (!upsertMopupStateStmt) return;
    upsertMopupStateStmt.run(String(key), Math.floor(timestampMs));
  } catch (e) {
    console.error('[USAGE:SQLite] Failed to set mopup update timestamp:', e);
  }
}

const MOPUP_LAST_STATUS_KEY = 'last-status';

function isMopupStatus(value: string): value is MopupStatus {
  return value === 'ACTIVE' || value === 'INACTIVE';
}

export type MopupLastKnownStatusResult = { ok: true; status: MopupStatus | null } | { ok: false };

export function getMopupLastKnownStatus(): MopupLastKnownStatusResult {
  try {
    initDb();
    if (!getMopupKvStmt) return { ok: false };
    const row = getMopupKvStmt.get(MOPUP_LAST_STATUS_KEY) as { value?: string } | undefined;
    const value = row?.value;
    return {
      ok: true,
      status: value && isMopupStatus(value) ? value : null,
    };
  } catch (e) {
    console.error('[USAGE:SQLite] Failed to get mopup last known status:', e);
    return { ok: false };
  }
}

export function setMopupLastKnownStatus(status: MopupStatus): boolean {
  try {
    initDb();
    if (!upsertMopupKvStmt) return false;
    upsertMopupKvStmt.run(MOPUP_LAST_STATUS_KEY, status);
    return true;
  } catch (e) {
    console.error('[USAGE:SQLite] Failed to set mopup last known status:', e);
    return false;
  }
}

export function getMopupUpdateWaitMs(
  key: string,
  minIntervalMs: number,
  nowMs = Date.now(),
): number {
  try {
    initDb();
    if (!getMopupStateStmt) return 0;
    const row = getMopupStateStmt.get(String(key)) as { updated_at_ms?: number } | undefined;
    const lastUpdateMs = Number(row?.updated_at_ms ?? 0);
    if (!Number.isFinite(lastUpdateMs) || lastUpdateMs <= 0) return 0;
    return Math.max(0, Math.floor(lastUpdateMs + minIntervalMs - nowMs));
  } catch (e) {
    console.error('[USAGE:SQLite] Failed to get mopup wait time:', e);
    return 0;
  }
}

export function tryAcquireEventLock(key: string, ttlMs: number, nowMs = Date.now()): boolean {
  const normalizedTtlMs = Math.max(1, Math.floor(ttlMs));
  const expiresAtMs = nowMs + normalizedTtlMs;

  try {
    initDb();
    if (!acquireEventLockStmt) return true;
    const result = acquireEventLockStmt.run(String(key), expiresAtMs, nowMs);

    if (cleanupExpiredEventLocksStmt && Math.random() < 0.01) {
      cleanupExpiredEventLocksStmt.run(nowMs);
    }

    return Number(result.changes ?? 0) > 0;
  } catch (e) {
    console.error('[USAGE:SQLite] Failed to acquire event lock:', e);
    return true;
  }
}

export function startWALCheckpoint(intervalMs?: number | null): void {
  initDb();
  purgeOldRecords();
  if (checkpointTimer) return;
  const effectiveIntervalMs = intervalMs ?? CHECKPOINT_INTERVAL_MS;
  checkpointTimer = setInterval(() => {
    checkpoint('TRUNCATE');
    purgeOldRecords();
  }, effectiveIntervalMs);
  checkpointTimer.unref?.();
  console.log('[USAGE:SQLite] WAL checkpoint timer started:', effectiveIntervalMs, 'ms');
}

export function stopWALCheckpoint(): void {
  if (checkpointTimer) {
    clearInterval(checkpointTimer);
    checkpointTimer = null;
    console.log('[USAGE:SQLite] WAL checkpoint timer stopped');
  }
}

export function closeDb(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushUsageQueue();
  if (db) {
    try {
      insertStmt = null;
      totalsStmt = null;
      topCommandsStmt = null;
      cleanupStmt = null;
      upsertMopupStateStmt = null;
      getMopupStateStmt = null;
      acquireEventLockStmt = null;
      cleanupExpiredEventLocksStmt = null;
      db.close();
      db = null;
      console.log('[USAGE:SQLite] Database closed');
    } catch (e) {
      console.error('[USAGE:SQLite] Error closing database:', e);
    }
  }
}
