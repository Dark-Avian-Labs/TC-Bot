---
type: Repository Overview
title: TC-Bot Quickstart
description: Entrypoint for agents and humans working on the Ark of War Discord theorycrafting bot.
tags: [quickstart, overview]
timestamp: 2026-07-18T22:57:00Z
---

# What this is

**TC-Bot** is a Discord.js bot for the Diplomacy of War / [Ark of War](https://www.7piratesgames.com/ark.html) community. It exposes slash commands (and an optional legacy `!tcmu` message command) that calculate in-game stats—healing costs, Ignore Tier Suppression kills, gear multipliers—and tracks mopup windows by renaming channels and posting announcements.

Audience: maintainers deploying or extending the bot for that Discord server. Outside Ark of War, the bot has little general purpose.

# Stack and layout

| Piece           | Choice                                                           |
| --------------- | ---------------------------------------------------------------- |
| Runtime         | Node.js ≥26, ESM (`"type": "module"`)                            |
| Language        | TypeScript (strict), compiled with `tsc` to `dist/`              |
| Discord         | discord.js v14                                                   |
| Sheets          | `@googleapis/sheets` + `google-auth-library` JWT service account |
| Persistence     | `better-sqlite3` WAL DB (usage metrics, mopup locks/state)       |
| Env             | `@dotenvx/dotenvx` — `.env.development` / `.env.production`      |
| Process         | PM2 via `ecosystem.config.cjs`                                   |
| Quality         | Oxlint, Oxfmt, Vitest, `pnpm run validate`                       |
| Package manager | pnpm ≥11                                                         |

Primary source tree:

- `src/tc-bot.ts` — boot, Sheets init, command/event load, mopup scheduler, shutdown
- `src/deployCommands.ts` — register slash commands with Discord REST
- `src/commands/aow/` — game commands; `src/commands/utility/` — help, ping, metrics, reboot
- `src/events/` — `clientReady`, `interactionsCreate`, `messageCreate`
- `src/helper/` — shared helpers (Sheets cache, SQLite usage, mopup math, safe replies)
- `src/env/loadEnv.ts` — dotenvx path resolution
- `tests/` — Vitest suites

# How to run

Requirements: Node 26+, pnpm 10+ (engines prefer pnpm ≥11).

```bash
pnpm install
cp .env.example .env.development   # or edit .env.development / .env.production
# place client_secret.json (Google service account) in repo root
pnpm run build
pnpm start                         # node dist/tc-bot.js
# or: pm2 start ecosystem.config.cjs
pnpm run deploy                    # register slash commands (guild if GUILD_ID set)
```

Local quality gate: `pnpm run validate` (format check → lint → typecheck → tests).

Deeper setup notes (dotenvx encryption, CI secrets, deploy) live in [Runtime and deploy](/openwiki/operations/runtime-and-deploy.md).

# Concept map

- [Bot runtime](/openwiki/architecture/bot-runtime.md) — boot sequence, command/event loading, shutdown
- [Command pipeline](/openwiki/workflows/command-pipeline.md) — interactions, legacy messages, idempotency, safe replies
- [Mopup scheduler](/openwiki/workflows/mopup-scheduler.md) — timing windows, channel renames, announcements
- [Theorycrafting commands](/openwiki/domain/theorycrafting.md) — heal / ITS / gearcheck domain
- [Google Sheets](/openwiki/integrations/google-sheets.md) — credentials, cache, troop rows
- [Runtime and deploy](/openwiki/operations/runtime-and-deploy.md) — env, SQLite metrics, PM2, CI/CD
- [Quality and tests](/openwiki/testing/quality.md) — Vitest, validate, coverage thresholds

# Agent gotchas

- **Compiled extension mismatch:** runtime loads `dist/**/*.js`; `deploy` discovers `src/**/*.ts`. Do not assume the same extension in both paths.
- **Env file selection:** `loadEnv` uses `.env.production` when `NODE_ENV=production`, else `.env.development`. Absolute/`..` `ENV_FILE` values are rejected.
- **Secrets on disk:** never commit `.env.keys`, real `client_secret.json`, or decrypted production env. Document placeholders only (see `.env.example`).
- **Sheets required at boot:** missing `TOKEN` / `CLIENT_ID` / `GUILD_ID` / spreadsheet + sheet IDs, or a bad `client_secret.json`, aborts initialization.
- **Legacy intents:** `GuildMessages` + `MessageContent` are only requested when `ENABLE_LEGACY_MESSAGE_COMMANDS` is truthy; `MessageCreate` is skipped when disabled.
- **Mopup state is SQLite-backed:** cooldowns, last status, and cross-process event locks live in the metrics DB—do not treat mopup as pure in-memory.
- **Single PM2 instance:** ecosystem runs `instances: 1`; duplicate-process locks still exist for safety during restarts/overlap.
- **Two “metrics” concepts:** Discord `/metrics` = SQLite usage history; `@pm2/io` = process dashboard counters (see [runtime and deploy](/openwiki/operations/runtime-and-deploy.md)).
