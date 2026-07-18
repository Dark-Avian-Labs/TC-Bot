---
type: Architecture Overview
title: Bot Runtime
description: Boot sequence, Discord client setup, command/event discovery, and graceful shutdown.
tags: [architecture, boot, discord]
timestamp: 2026-07-18T21:30:00Z
---

# Overview

The process entrypoint is `src/tc-bot.ts` (compiled to `dist/tc-bot.js`). It loads env first (`./env/loadEnv.js`), validates required variables, initializes Google Sheets, registers commands and events from the filesystem, starts SQLite WAL checkpointing, logs into Discord, then starts the [mopup scheduler](/openwiki/workflows/mopup-scheduler.md).

The Discord client is extended with `commands: Collection` and `GoogleSheets` (see `src/types/index.ts`). Intents always include `Guilds`; message intents are added only when legacy commands are enabled via [command pipeline](/openwiki/workflows/command-pipeline.md) constants.

# Where to start

1. `src/tc-bot.ts` — `initializeBot()`, `gracefulShutdown()`, Sheets + mopup helpers
2. `src/helper/commandDiscovery.ts` — recursive command file walk
3. `src/events/*.ts` — `ClientReady`, `InteractionCreate`, optional `MessageCreate`
4. `src/deployCommands.ts` — separate process to PUT slash command definitions

# Boot sequence

Order inside `initializeBot()`:

1. `initializeGoogleSheets()` — JWT from `client_secret.json`, Sheets API client, warm cache ([Google Sheets](/openwiki/integrations/google-sheets.md))
2. `loadCommands()` — discover `dist/commands/**/*.js`, require `data` + `execute`
3. `loadEvents()` — register `dist/events/*.js`; skip `MessageCreate` if legacy disabled
4. `usageTracker.startWALCheckpoint(...)`
5. `client.login(TOKEN)` → wait for `ClientReady` (30s timeout)
6. Start mopup timer + sync last-known mopup status without announcing → run due mopup update

Required env at validate time: `TOKEN`, `CLIENT_ID`, `GUILD_ID`, `GOOGLE_SHEET_ID`, and spreadsheet id (`GOOGLE_SPREADSHEET_ID`). Configuration loading is covered in [runtime and deploy](/openwiki/operations/runtime-and-deploy.md).

# Commands and events

Commands live under `src/commands/` in subfolders (`aow/`, `utility/`). Each module exports a `Command` with SlashCommandBuilder `data` and `execute` (optional `handleSelect` for healtroop menus). Discovery sorts paths lexicographically and ignores invalid modules with a warning.

Events are flat files in `src/events/`. Handlers are wrapped so rejected promises log via `debugLogger` instead of crashing the process. `clientReady` starts Discord latency sampling into PM2 metrics.

Command registration with Discord is **not** part of bot boot—run `pnpm run deploy` (or CI deploy step). Guild vs global: if `GUILD_ID` is set, guild commands; otherwise global.

# Shutdown

`SIGTERM` / `SIGINT` / uncaught exception trigger `gracefulShutdown()`: clear mopup timer, stop latency + idempotency cleanup, WAL checkpoint + close DB, `client.destroy()`. Unhandled rejections are logged without forcing exit.

# Watch out for

- Bot loads **`.js`** from `dist/`; deploy loads **`.ts`** from `src/`—keep both paths working after adding commands.
- Missing Sheets credentials fail boot entirely (healing/ITS need Sheets; gearcheck/mopup do not use Sheets but boot still requires Sheets config today).
- `@pm2/io` is initialized at import time (`io.init()`).

# Key sources

- `src/tc-bot.ts`
- `src/helper/commandDiscovery.ts`
- `src/types/index.ts`
- `src/deployCommands.ts`
- `ecosystem.config.cjs`
