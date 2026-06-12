import { CacheEntry, GoogleSheetsClient, TroopRow } from '../types/index.js';
import { cachedSheetRows, googleSheetCacheHits, googleSheetCacheMisses } from './metrics.js';

const FALLBACK_TTL_MS = 300000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REFRESH_LEAD_MS = 30_000;
const MAX_REFRESH_LEAD_MS = 120_000;
const MIN_REFRESH_DELAY_MS = 5_000;
const cache = new Map<string, CacheEntry>();
const sheetTitleByKey = new Map<string, string>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

function resolveTtlMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return FALLBACK_TTL_MS;
  return Math.min(Math.floor(parsed), MAX_TTL_MS);
}

const DEFAULT_TTL_MS = resolveTtlMs(process.env.GOOGLE_SHEET_CACHE);
if (
  process.env.GOOGLE_SHEET_CACHE !== undefined &&
  DEFAULT_TTL_MS === FALLBACK_TTL_MS &&
  Number(process.env.GOOGLE_SHEET_CACHE) !== FALLBACK_TTL_MS
) {
  console.warn(
    `[SHEETS:CACHE] Invalid GOOGLE_SHEET_CACHE="${process.env.GOOGLE_SHEET_CACHE}", using fallback ${FALLBACK_TTL_MS}ms`,
  );
}

function keyFor(client: GoogleSheetsClient, sheetId: string): string {
  return `${client.spreadsheetId}:${sheetId}`;
}

function computeProactiveRefreshDelayMs(ttl: number): number {
  const lead = Math.min(MAX_REFRESH_LEAD_MS, Math.max(MIN_REFRESH_LEAD_MS, Math.floor(ttl * 0.15)));
  return Math.max(MIN_REFRESH_DELAY_MS, ttl - lead);
}

function clearProactiveRefresh(key: string): void {
  const timer = refreshTimers.get(key);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  refreshTimers.delete(key);
}

function scheduleProactiveRefresh(client: GoogleSheetsClient, sheetId: string, ttl: number): void {
  const key = keyFor(client, sheetId);
  clearProactiveRefresh(key);

  const delayMs = computeProactiveRefreshDelayMs(ttl);
  const timer = setTimeout(() => {
    refreshTimers.delete(key);
    if (!cache.get(key)?.rows) {
      return;
    }
    scheduleBackgroundRefresh(client, sheetId, ttl);
  }, delayMs);

  refreshTimers.set(key, timer);
  timer.unref();
}

function registerSheetTitle(client: GoogleSheetsClient, sheetId: string, title: string): void {
  sheetTitleByKey.set(keyFor(client, sheetId), title);
}

async function resolveSheetTitle(client: GoogleSheetsClient, sheetId: string): Promise<string> {
  const key = keyFor(client, sheetId);
  const cachedTitle = sheetTitleByKey.get(key);
  if (cachedTitle) {
    return cachedTitle;
  }

  const envTitle = process.env.GOOGLE_SHEET_NAME?.trim();
  if (envTitle) {
    sheetTitleByKey.set(key, envTitle);
    return envTitle;
  }

  const response = await client.sheetsApi.spreadsheets.get({
    spreadsheetId: client.spreadsheetId,
    includeGridData: false,
  });

  const sheets = response.data.sheets || [];
  const sheet = sheets.find((s) => String(s.properties?.sheetId) === sheetId);

  if (!sheet?.properties?.title) {
    throw new Error(`Sheet not found: ${sheetId}`);
  }

  const title = sheet.properties.title;
  sheetTitleByKey.set(key, title);
  return title;
}

async function fetchSheetRows(client: GoogleSheetsClient, sheetId: string): Promise<TroopRow[]> {
  const sheetTitle = await resolveSheetTitle(client, sheetId);
  const escapedTitle = sheetTitle.replace(/'/g, "''");
  const range = `'${escapedTitle}'`;

  const valuesResponse = await client.sheetsApi.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const values = valuesResponse.data.values || [];

  if (values.length === 0) {
    return [];
  }

  const headers = values[0].map(String);
  const dataRows = values.slice(1);

  return dataRows.map((row) => new TroopRow(headers, row));
}

async function loadSheetRows(
  client: GoogleSheetsClient,
  sheetId: string,
  ttl: number,
): Promise<TroopRow[]> {
  const key = keyFor(client, sheetId);
  const loadingPromise = fetchSheetRows(client, sheetId);

  cache.set(key, { ...cache.get(key), loadingPromise });

  try {
    const rows = await loadingPromise;
    cache.set(key, { rows, expiresAt: Date.now() + ttl });
    cachedSheetRows.set(cache.size);
    scheduleProactiveRefresh(client, sheetId, ttl);
    return rows;
  } catch (err) {
    const entry = cache.get(key);
    if (entry?.rows) {
      cache.set(key, { rows: entry.rows, expiresAt: entry.expiresAt });
    } else {
      cache.delete(key);
    }
    throw err;
  }
}

function scheduleBackgroundRefresh(client: GoogleSheetsClient, sheetId: string, ttl: number): void {
  const key = keyFor(client, sheetId);
  const entry = cache.get(key);
  if (entry?.loadingPromise) {
    return;
  }

  void loadSheetRows(client, sheetId, ttl).catch((err) => {
    console.error('[SHEETS:CACHE] Background refresh failed:', err);
  });
}

async function getSheetRowsCached(
  client: GoogleSheetsClient,
  sheetId: string,
  ttlMs?: number,
): Promise<TroopRow[]> {
  const ttl = ttlMs === undefined ? DEFAULT_TTL_MS : resolveTtlMs(ttlMs);
  const key = keyFor(client, sheetId);
  const now = Date.now();

  const entry = cache.get(key);

  if (entry?.rows && entry.expiresAt && entry.expiresAt > now) {
    googleSheetCacheHits.inc();
    cachedSheetRows.set(cache.size);
    return entry.rows;
  }

  if (entry?.rows) {
    googleSheetCacheHits.inc();
    cachedSheetRows.set(cache.size);
    scheduleBackgroundRefresh(client, sheetId, ttl);
    return entry.rows;
  }

  googleSheetCacheMisses.inc();

  if (entry?.loadingPromise) {
    return entry.loadingPromise;
  }

  return loadSheetRows(client, sheetId, ttl);
}

function invalidateSheetCache(sheetId: string, client?: GoogleSheetsClient): void {
  if (client) {
    const key = keyFor(client, sheetId);
    clearProactiveRefresh(key);
    cache.delete(key);
    sheetTitleByKey.delete(key);
    return;
  }
  for (const k of cache.keys()) {
    if (k.endsWith(`:${sheetId}`)) {
      clearProactiveRefresh(k);
      cache.delete(k);
    }
  }
  for (const k of sheetTitleByKey.keys()) {
    if (k.endsWith(`:${sheetId}`)) {
      sheetTitleByKey.delete(k);
    }
  }
}

function clearAllSheetCache(): void {
  for (const key of refreshTimers.keys()) {
    clearProactiveRefresh(key);
  }
  cache.clear();
  sheetTitleByKey.clear();
}

function getCacheStats(): {
  size: number;
  keys: string[];
  expirations: Array<{ key: string; expiresAt: string; hasRows: boolean }>;
} {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
    expirations: Array.from(cache.entries()).map(([key, v]) => ({
      key,
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : '',
      hasRows: !!v.rows,
    })),
  };
}

export {
  computeProactiveRefreshDelayMs,
  getSheetRowsCached,
  registerSheetTitle,
  invalidateSheetCache,
  clearAllSheetCache,
  getCacheStats,
};
