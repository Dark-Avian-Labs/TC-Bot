import './env/loadEnv.js';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { sheets } from '@googleapis/sheets';
import io from '@pm2/io';
import {
  Client,
  Collection,
  GatewayIntentBits,
  ChannelType,
  Events,
  type VoiceChannel,
  type StageChannel,
} from 'discord.js';
import { JWT } from 'google-auth-library';

import { stopLatencyMonitoring } from './events/clientReady.js';
import { discoverCommandFiles } from './helper/commandDiscovery.js';
import { ENABLE_LEGACY_MESSAGE_COMMANDS, TIMERS } from './helper/constants.js';
import { debugLogger } from './helper/debugLogger.js';
import { stopIdempotencyCleanup } from './helper/idempotencyGuard.js';
import { isTransientNetworkError } from './helper/logError.js';
import { calculateMopupTiming } from './helper/mopup.js';
import { getSheetRowsCached, registerSheetTitle } from './helper/sheetsCache.js';
import * as usageTracker from './helper/usageTracker.js';
import type { Command, ExtendedClient, GoogleSheetsClient } from './types/index.js';

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
    GoogleSheets: GoogleSheetsClient | null;
  }
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

io.init();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const intents = [GatewayIntentBits.Guilds];
if (ENABLE_LEGACY_MESSAGE_COMMANDS) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client: ExtendedClient = new Client({ intents }) as ExtendedClient;

client.commands = new Collection<string, Command>();
client.GoogleSheets = null;

function getSpreadsheetId(): string {
  return process.env.GOOGLE_SPREADSHEET_ID || '';
}

function validateEnvironment(): void {
  debugLogger.boot('Validating environment variables');
  const required = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'GOOGLE_SHEET_ID'];

  const missing = required.filter((key) => !process.env[key]);
  if (!getSpreadsheetId()) {
    missing.push('GOOGLE_SPREADSHEET_ID');
  }

  if (missing.length > 0) {
    debugLogger.error('BOOT', 'Missing required environment variables', {
      missing,
    });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  debugLogger.boot('Environment validation passed', {
    checked: required.length,
  });
}

validateEnvironment();

process.on('SIGTERM', () => {
  void gracefulShutdown();
});
process.on('SIGINT', () => {
  void gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  debugLogger.error('PROCESS', 'Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason : String(reason),
    promise: String(promise),
  });
  console.error('[PROCESS] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  debugLogger.error('PROCESS', 'Uncaught Exception', {
    error,
  });
  console.error('[PROCESS] Uncaught exception:', error);
  const forceExitTimeout = setTimeout(() => {
    console.error('[PROCESS] Forced exit after uncaught exception');
    // eslint-disable-next-line n/no-process-exit -- Required for undefined state recovery
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();
  void gracefulShutdown();
});

let isShuttingDown = false;
let mopupTimer: NodeJS.Timeout | null = null;
let mopupUpdateInProgress = false;
let mopupUpdateStartedAtMs = 0;
let mopupLastLockWarnAtMs = 0;
const MOPUP_SCHEDULER_STATE_KEY = 'mopup:scheduler';
const MOPUP_CHANNEL_STATE_PREFIX = 'mopup:channel:';
const MOPUP_LOCK_WARN_AFTER_MS = 30 * 1000;
const MOPUP_LOCK_WARN_EVERY_MS = 60 * 1000;

(async function initializeBot(): Promise<void> {
  debugLogger.boot('Starting bot initialization');
  try {
    debugLogger.step('BOOT', 'Step 1: Initializing Google Sheets');
    await initializeGoogleSheets();

    debugLogger.step('BOOT', 'Step 2: Loading commands');
    await loadCommands();

    debugLogger.step('BOOT', 'Step 3: Loading events');
    await loadEvents();

    debugLogger.step('BOOT', 'Step 4: Starting WAL checkpoint');
    usageTracker.startWALCheckpoint(TIMERS.WAL_CHECKPOINT_INTERVAL_MS);

    debugLogger.step('BOOT', 'Step 5: Logging in to Discord');
    await client.login(process.env.TOKEN);

    debugLogger.step('BOOT', 'Step 6: Waiting for ready event');
    await waitForClientReady();

    debugLogger.step('BOOT', 'Step 7: Starting mopup timer');
    startMopupTimer();

    debugLogger.step('BOOT', 'Step 8: Running initial mopup schedule check');
    await runMopupUpdateIfDue('startup');
    debugLogger.boot('Bot initialization completed successfully');
  } catch (error) {
    debugLogger.error('BOOT', 'Failed to initialize bot', {
      error: error as Error,
    });
    console.error('[BOOT] Failed to initialize bot:', error);
    process.exitCode = 1;
    await gracefulShutdown();
  }
})();

async function gracefulShutdown(): Promise<void> {
  if (isShuttingDown) {
    debugLogger.warn('SHUTDOWN', 'Shutdown already in progress, ignoring duplicate signal');
    return;
  }
  isShuttingDown = true;

  debugLogger.step('SHUTDOWN', 'Starting graceful shutdown');
  console.log('[SHUTDOWN] Shutting down gracefully...');

  try {
    if (mopupTimer) {
      debugLogger.step('SHUTDOWN', 'Clearing mopup timer');
      clearInterval(mopupTimer);
      mopupTimer = null;
    }

    debugLogger.step('SHUTDOWN', 'Stopping latency monitoring');
    stopLatencyMonitoring();

    debugLogger.step('SHUTDOWN', 'Stopping idempotency cleanup timer');
    stopIdempotencyCleanup();

    try {
      debugLogger.step('SHUTDOWN', 'Stopping WAL checkpoint');
      usageTracker.stopWALCheckpoint();
      debugLogger.step('SHUTDOWN', 'Running final WAL checkpoint');
      usageTracker.checkpoint('TRUNCATE');
      debugLogger.step('SHUTDOWN', 'Closing database connection');
      usageTracker.closeDb();
    } catch (e) {
      debugLogger.error('SHUTDOWN', 'WAL checkpoint error during shutdown', {
        error: e,
      });
      console.error('[SHUTDOWN] WAL checkpoint error:', e);
    }
    debugLogger.step('SHUTDOWN', 'Destroying Discord client');
    client.destroy();
    debugLogger.step('SHUTDOWN', 'Bot shut down successfully');
    console.log('[SHUTDOWN] Bot shut down successfully');
    if (process.exitCode === undefined) {
      process.exitCode = 0;
    }
  } catch (error) {
    debugLogger.error('SHUTDOWN', 'Error during shutdown', {
      error: error as Error,
    });
    console.error('[SHUTDOWN] Error during shutdown:', error);
    process.exitCode = 1;
  }
}

async function initializeGoogleSheets(): Promise<void> {
  debugLogger.step('GOOGLE_SHEETS', 'Initializing Google Sheets connection');
  const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
  const credentials = await loadGoogleCredentials();

  debugLogger.debug('GOOGLE_SHEETS', 'Creating JWT service account authentication', {
    email: credentials.client_email,
    scopes: SCOPES,
  });
  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });

  debugLogger.debug('GOOGLE_SHEETS', 'Creating Google Sheets API client', {
    spreadsheetId: getSpreadsheetId(),
  });

  const sheetsApi = sheets({ version: 'v4', auth });

  client.GoogleSheets = {
    sheetsApi,
    spreadsheetId: getSpreadsheetId(),
  };

  debugLogger.step('GOOGLE_SHEETS', 'Fetching spreadsheet metadata');
  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId: getSpreadsheetId(),
    includeGridData: false,
  });

  const title = response.data.properties?.title || 'Unknown';
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();

  if (sheetId) {
    const targetSheet = (response.data.sheets || []).find(
      (s) => String(s.properties?.sheetId) === sheetId,
    );
    if (targetSheet?.properties?.title) {
      registerSheetTitle(client.GoogleSheets, sheetId, targetSheet.properties.title);
    } else {
      debugLogger.warn('GOOGLE_SHEETS', 'Configured sheet ID not found in spreadsheet', {
        configuredSheetId: sheetId,
        availableSheetIds: (response.data.sheets || []).map((s) => s.properties?.sheetId),
      });
    }
  }

  debugLogger.step('GOOGLE_SHEETS', 'Prefetching sheet rows to warm cache', {
    sheetId,
  });
  if (sheetId) {
    await getSheetRowsCached(client.GoogleSheets, sheetId);
  }
  console.log('[BOOT] Prefetched Google Sheet rows to warm cache.');
  console.log('[BOOT] Loaded Google Sheet:', title);

  debugLogger.info('GOOGLE_SHEETS', 'Google Sheets initialized successfully', {
    title,
    spreadsheetId: getSpreadsheetId(),
  });
}

async function loadGoogleCredentials(): Promise<ServiceAccountCredentials> {
  const credentialsPath = path.resolve(process.cwd(), 'client_secret.json');
  let parsed: unknown;

  try {
    const raw = await fs.readFile(credentialsPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to load Google credentials from ${credentialsPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const clientEmail = (parsed as { client_email?: unknown })?.client_email;
  const privateKey = (parsed as { private_key?: unknown })?.private_key;
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error(
      `Invalid Google credentials file at ${credentialsPath}: missing client_email/private_key`,
    );
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

async function loadCommands(): Promise<void> {
  debugLogger.step('COMMANDS', 'Loading commands from filesystem');
  const commandsPath = path.join(__dirname, 'commands');
  debugLogger.debug('COMMANDS', 'Commands directory', { path: commandsPath });

  const files = await discoverCommandFiles(commandsPath, '.js');
  debugLogger.debug('COMMANDS', 'Discovered command files recursively', {
    count: files.length,
  });

  for (const filePath of files) {
    await registerCommand(filePath, path.basename(filePath));
  }
  debugLogger.info('COMMANDS', 'Commands loading completed', {
    totalCommands: client.commands.size,
  });
}

async function registerCommand(filePath: string, fileName: string): Promise<void> {
  debugLogger.debug('COMMANDS', 'Registering command', {
    file: fileName,
    path: filePath,
  });
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const command = mod.default ?? mod;
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command as Command);
      debugLogger.step('COMMANDS', 'Command registered successfully', {
        name: command.data.name,
        description: command.data.description,
        file: fileName,
      });
    } else {
      debugLogger.warn('COMMANDS', 'Invalid command file structure', {
        file: fileName,
        hasData: !!command?.data,
        hasExecute: !!command?.execute,
      });
      console.warn(`[BOOT] Invalid command file: ${fileName}`);
    }
  } catch (err) {
    debugLogger.error('COMMANDS', 'Failed to load command', {
      file: fileName,
      error: err as Error,
    });
    console.error(`[BOOT] Failed to load command: ${fileName}`, err);
  }
}

async function loadEvents(): Promise<void> {
  debugLogger.step('EVENTS', 'Loading events from filesystem');
  const eventsPath = path.join(__dirname, 'events');
  debugLogger.debug('EVENTS', 'Events directory', { path: eventsPath });
  const allFiles = await fs.readdir(eventsPath);
  const eventFiles = allFiles.filter((f) => f.endsWith('.js'));
  debugLogger.debug('EVENTS', 'Found event files', {
    count: eventFiles.length,
  });

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    debugLogger.debug('EVENTS', 'Loading event file', { file });
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const event = mod.default ?? mod;
      if (!ENABLE_LEGACY_MESSAGE_COMMANDS && event.name === Events.MessageCreate) {
        debugLogger.info('EVENTS', 'Skipping MessageCreate event: legacy commands disabled', {
          file,
        });
        continue;
      }

      const executeSafely = (...args: unknown[]): void => {
        debugLogger.event(event.name, 'Event triggered', { file });
        void Promise.resolve(event.execute(...args)).catch((error: unknown) => {
          debugLogger.error('EVENTS', 'Event handler execution failed', {
            eventName: event.name,
            file,
            error: error as Error,
          });
        });
      };

      if (event.once) {
        client.once(event.name, (...args: unknown[]) => {
          executeSafely(...args);
        });
        debugLogger.step('EVENTS', 'Registered once event', {
          name: event.name,
          file,
        });
      } else {
        client.on(event.name, (...args: unknown[]) => {
          executeSafely(...args);
        });
        debugLogger.step('EVENTS', 'Registered event listener', {
          name: event.name,
          file,
        });
      }
    } catch (err) {
      debugLogger.error('EVENTS', 'Failed to load event', {
        file,
        error: err as Error,
      });
      console.error(`[BOOT] Failed to load event: ${file}`, err);
    }
  }
  debugLogger.info('EVENTS', 'Events loading completed', {
    totalEvents: eventFiles.length,
  });
}

function startMopupTimer(): void {
  if (!process.env.CHANNEL_ID1 || !process.env.CHANNEL_ID2) {
    debugLogger.warn('MOPUP', 'Mopup timer disabled: Channel IDs missing', {
      hasChannel1: !!process.env.CHANNEL_ID1,
      hasChannel2: !!process.env.CHANNEL_ID2,
    });
    console.warn('[BOOT] Mopup timer disabled: Channel IDs missing');
    return;
  }
  debugLogger.step('MOPUP', 'Starting mopup timer', {
    pollInterval: `${TIMERS.MOPUP_POLL_INTERVAL_MS / 1000}s`,
    minUpdateInterval: `${TIMERS.MOPUP_INTERVAL_MS / 1000 / 60} minutes`,
    channel1: process.env.CHANNEL_ID1,
    channel2: process.env.CHANNEL_ID2,
  });
  mopupTimer = setInterval(() => {
    void runMopupUpdateIfDue('timer');
  }, TIMERS.MOPUP_POLL_INTERVAL_MS);
  mopupTimer.unref?.();
}

function getMopupChannelStateKey(channelId: string): string {
  return `${MOPUP_CHANNEL_STATE_PREFIX}${channelId}`;
}

async function runMopupUpdateIfDue(trigger: 'startup' | 'timer'): Promise<void> {
  if (mopupUpdateInProgress) {
    if (trigger === 'timer') {
      const now = Date.now();
      const lockDurationMs = mopupUpdateStartedAtMs > 0 ? now - mopupUpdateStartedAtMs : 0;
      const shouldWarn =
        lockDurationMs >= MOPUP_LOCK_WARN_AFTER_MS &&
        now - mopupLastLockWarnAtMs >= MOPUP_LOCK_WARN_EVERY_MS;
      if (shouldWarn) {
        mopupLastLockWarnAtMs = now;
        debugLogger.warn('MOPUP', 'Skipping timer tick: previous update still running', {
          lockDurationSeconds: Math.ceil(lockDurationMs / 1000),
        });
      }
    }
    return;
  }

  const waitMs = usageTracker.getMopupUpdateWaitMs(
    MOPUP_SCHEDULER_STATE_KEY,
    TIMERS.MOPUP_INTERVAL_MS,
  );
  if (waitMs > 0) {
    if (trigger === 'startup') {
      debugLogger.info('MOPUP', 'Skipping startup mopup update: cooldown still active', {
        remainingSeconds: Math.ceil(waitMs / 1000),
      });
    }
    return;
  }

  mopupUpdateInProgress = true;
  mopupUpdateStartedAtMs = Date.now();
  mopupLastLockWarnAtMs = 0;
  debugLogger.step('MOPUP', 'Mopup update due, running channel refresh', {
    trigger,
  });
  try {
    const updatedChannelIds = await updateMopupChannels();
    usageTracker.setMopupUpdateTimestamp(MOPUP_SCHEDULER_STATE_KEY);
    debugLogger.info('MOPUP', 'Persisted mopup scheduler timestamp', {
      trigger,
      updatedChannelCount: updatedChannelIds.length,
      updatedChannelIds,
    });
  } catch (error) {
    if (isTransientNetworkError(error)) {
      debugLogger.warn(
        'MOPUP',
        'Mopup channel update skipped: Discord API unreachable (will retry)',
        {
          trigger,
          error: error as Error,
        },
      );
    } else {
      debugLogger.error('MOPUP', 'Mopup channel update failed', {
        trigger,
        error: error as Error,
      });
    }
  } finally {
    mopupUpdateInProgress = false;
    mopupUpdateStartedAtMs = 0;
    mopupLastLockWarnAtMs = 0;
  }
}

function waitForClientReady(timeoutMs = 30000): Promise<void> {
  if (client.isReady()) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onReady = (): void => {
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(() => {
      client.removeListener(Events.ClientReady, onReady);
      reject(
        new Error(
          `waitForClientReady timed out after ${timeoutMs}ms waiting for ${Events.ClientReady}`,
        ),
      );
    }, timeoutMs);
    timeout.unref?.();

    client.once(Events.ClientReady, onReady);
  });
}

async function updateMopupChannels(): Promise<string[]> {
  debugLogger.step('MOPUP', 'Updating mopup channels');
  const updatedChannelIds: string[] = [];
  debugLogger.debug('MOPUP', 'Calculating mopup timing');
  const mopupInfo = calculateMopupTiming();
  debugLogger.debug('MOPUP', 'Mopup timing calculated', {
    status: mopupInfo.status,
    time: mopupInfo.time,
  });

  const getChannel = async (
    channelId: string,
  ): Promise<ReturnType<typeof client.channels.cache.get> | null> => {
    const cached = client.channels.cache.get(channelId);
    if (cached) return cached;
    try {
      return await client.channels.fetch(channelId);
    } catch (error) {
      debugLogger.warn('MOPUP', 'Failed to fetch channel', {
        channelId,
        error: error as Error,
      });
      return null;
    }
  };

  const [channel1, channel2] = await Promise.all([
    getChannel(process.env.CHANNEL_ID1!),
    getChannel(process.env.CHANNEL_ID2!),
  ]);
  debugLogger.debug('MOPUP', 'Retrieved channels for mopup update', {
    channel1Found: !!channel1,
    channel2Found: !!channel2,
  });

  const isRenameable = (ch: typeof channel1): ch is VoiceChannel | StageChannel =>
    ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice;

  const tryRenameChannel = async (
    channel: typeof channel1,
    newName: string,
    updatedIds: string[],
    label: 'channel 1' | 'channel 2',
  ): Promise<void> => {
    if (!isRenameable(channel)) return;

    if (channel.name === newName) {
      debugLogger.debug('MOPUP', `Skipping ${label} rename (unchanged)`, {
        channelId: channel.id,
        currentName: channel.name,
      });
      return;
    }

    const waitMs = usageTracker.getMopupUpdateWaitMs(
      getMopupChannelStateKey(channel.id),
      TIMERS.MOPUP_INTERVAL_MS,
    );
    if (waitMs > 0) {
      debugLogger.warn('MOPUP', `Skipping ${label} rename: channel cooldown still active`, {
        channelId: channel.id,
        remainingSeconds: Math.ceil(waitMs / 1000),
      });
      return;
    }

    debugLogger.debug('MOPUP', `Updating ${label} name`, { newName });
    await channel.setName(newName);
    usageTracker.setMopupUpdateTimestamp(getMopupChannelStateKey(channel.id));
    updatedIds.push(channel.id);
    debugLogger.step(
      'MOPUP',
      `${label.charAt(0).toUpperCase()}${label.slice(1)} name updated successfully`,
    );
  };

  const statusEmoji = mopupInfo.status === 'ACTIVE' ? '🟢' : '🔴';
  await tryRenameChannel(
    channel1,
    `${statusEmoji} ${mopupInfo.status} Mopup`,
    updatedChannelIds,
    'channel 1',
  );
  await tryRenameChannel(
    channel2,
    `Time remaining: ${mopupInfo.time}`,
    updatedChannelIds,
    'channel 2',
  );
  debugLogger.info('MOPUP', 'Mopup channels updated successfully');
  return updatedChannelIds;
}
