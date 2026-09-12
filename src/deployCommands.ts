import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REST, Routes } from 'discord.js';

import { discoverCommandFiles } from './helper/commandDiscovery.js';
import type { Command } from './types/index.js';

process.env.ENV_FILE = '.env.production';
await import('./env/loadEnv.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.TOKEN;
if (!token) {
  console.error('[DEPLOY] Missing TOKEN in environment variables.');
  throw new Error('Missing TOKEN in environment variables');
}
const TOKEN = token;

const rest = new REST({ version: '10' }).setToken(TOKEN);

function applicationIdFromBotToken(token: string): string | null {
  const part = token.split('.')[0];
  if (!part) return null;
  const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
  const id = Buffer.from(padded, 'base64').toString('utf8');
  return /^\d{17,20}$/.test(id) ? id : null;
}

(async function deployCommands(): Promise<void> {
  try {
    const commands = await loadCommands();
    await deployNewCommands(commands);
  } catch (error) {
    console.error('[DEPLOY] Failed to deploy commands:', error);
    process.exitCode = 1;
  }
})();

async function loadCommands(): Promise<unknown[]> {
  const commands: unknown[] = [];
  const root = path.join(__dirname, 'commands');
  const files = await discoverCommandFiles(root, '.ts');
  for (const filePath of files) {
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const command = mod.default ?? mod;
      if (command?.data && command?.execute) {
        commands.push((command as Command).data.toJSON());
      } else {
        console.warn(`[DEPLOY] Skipping invalid command: ${filePath}`);
      }
    } catch (err) {
      console.error(`[DEPLOY] Failed to load command: ${filePath}`, err);
    }
  }

  console.log(`[DEPLOY] Loaded ${commands.length} commands.`);
  return commands;
}

async function deployNewCommands(commands: unknown[]): Promise<void> {
  console.log(`[DEPLOY] About to deploy ${commands.length} commands.`);
  console.log(`[DEPLOY] Commands: ${commands.map((c) => (c as { name: string }).name).join(', ')}`);

  const clientId = process.env.CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing CLIENT_ID in environment variables');
  }

  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    throw new Error('Missing GUILD_ID in environment variables');
  }

  const tokenAppId = applicationIdFromBotToken(TOKEN);
  if (tokenAppId && tokenAppId !== clientId) {
    throw new Error(
      `TOKEN belongs to application ${tokenAppId}, but CLIENT_ID is ${clientId}. They must be the same Discord app.`,
    );
  }

  console.log(`[DEPLOY] Target: global deployment via .env.production.`);
  console.log(`[DEPLOY] Guild commands will be cleared (${guildId}).`);
  console.log('[DEPLOY] Starting in 3 seconds... (Ctrl+C to cancel)');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const globalData = (await rest.put(Routes.applicationCommands(clientId), {
    body: commands,
  })) as unknown[];
  console.log(`[DEPLOY] Successfully deployed ${globalData.length} global commands.`);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [],
  });
  console.log(`[DEPLOY] Cleared guild commands (${guildId}).`);
}
