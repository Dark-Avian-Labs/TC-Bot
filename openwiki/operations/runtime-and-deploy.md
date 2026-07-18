---
type: Operations Guide
title: Runtime and Deploy
description: dotenvx env loading, SQLite metrics/locks, PM2 process model, and GitHub Actions CI/CD.
tags: [operations, env, ci, deploy]
timestamp: 2026-07-18T22:57:00Z
---

# Overview

Day-to-day operations cover encrypted env files, local/prod process management, SQLite-backed metrics and mopup locks, and the main/PR GitHub Actions pipelines. This supports the [bot runtime](/openwiki/architecture/bot-runtime.md) and is exercised by [quality checks](/openwiki/testing/quality.md).

# Where to start

- `src/env/loadEnv.ts` — which env file loads
- `.env.example` — variable catalog (placeholders only)
- `src/helper/usageTracker.ts` — SQLite schema and flush/checkpoint
- `ecosystem.config.cjs` — PM2 app `TC-Bot`
- `.github/workflows/pr.yml` — PR validate
- `.github/workflows/ci.yml` — release, validate, rsync deploy, Discord status

# Environment loading

`loadEnv` picks `.env.production` when `NODE_ENV=production`, otherwise `.env.development`. Optional relative `ENV_FILE` must stay inside cwd (no absolute paths, no `..`, symlink escape checked). Missing file → debug skip (process may still fail later on required vars).

dotenvx can encrypt env for commit; private keys live in `.env.keys` (never commit) and CI secrets such as `DOTENV_PRIVATE_KEY_PRODUCTION`. See README for encrypt/decrypt workflow.

Notable variables (full table in README / `.env.example`): Discord `TOKEN`/`CLIENT_ID`/`GUILD_ID`; channel IDs; Sheets IDs; `SQLITE_DB_PATH` and metrics flush/retention knobs; `DEBUG`; legacy message flags.

# SQLite metrics and locks

Default DB `./data/metrics.db` (WAL). Tables include `command_usage`, mopup update/kv state, and event locks. Usage events queue in memory and flush in batches; overflow drops oldest with warnings. Retention defaults to 90 days (`METRICS_RETENTION_DAYS=0` keeps forever). Same DB stores mopup scheduler timestamps, last status, and cross-process locks used by the [command pipeline](/openwiki/workflows/command-pipeline.md) and [mopup scheduler](/openwiki/workflows/mopup-scheduler.md).

The Discord `/metrics` command reads this SQLite data (Manage Guild). That is separate from PM2.io process metrics below.

Deploy rsync **excludes** `data/` and `logs/` so production metrics survive releases.

# PM2 process and @pm2/io metrics

`ecosystem.config.cjs`: one fork instance, `dist/tc-bot.js`, `NODE_ENV=production`, 500M memory restart, logs under `./logs/`. Prefer `pm2 start ecosystem.config.cjs` for production-like local runs.

`io.init()` runs at bot import. Custom metrics in `src/helper/metrics.ts` feed the PM2 dashboard (`pm2 monit` / linked Keymetrics)—not Discord embeds:

| Metric                           | Kind     | Updated from                                     |
| -------------------------------- | -------- | ------------------------------------------------ |
| Total Commands                   | counter  | successful slash executes (`interactionsCreate`) |
| Commands/Second                  | meter    | same                                             |
| Command Errors                   | counter  | failed slash executes                            |
| Discord API Latency (ms)         | gauge    | `clientReady` interval (`client.ws.ping`)        |
| Google Sheet Cache Size          | gauge    | `sheetsCache` after hit/miss paths               |
| Google Sheet Cache Hits / Misses | counters | `sheetsCache`                                    |

Usage is light but live whenever the process runs under PM2 with `@pm2/io`. Local `pnpm start` still initializes io; values matter most on the deployed PM2 app.

# Release automation (semantic-release)

On main, when `deployment-check` says deploy, the `version` job runs `pnpm exec semantic-release` (`.releaserc.json`):

- Angular commits drive the bump; `chore` and `ci` types also release as **patch**
- Notes generated; `package.json` version updated (`npmPublish: false`)
- `scripts/append-changelog.mjs` appends `CHANGELOG.md`
- Git plugin commits `build(release): <version> [skip ci]` with `package.json`, lockfile, changelog

CI skips re-entry on those release commits. Prefer conventional subjects (`feat:`, `fix:`, …) so bumps stay predictable.

# Utility command permissions

| Command    | Gate                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `/metrics` | `ManageGuild` (`setDefaultMemberPermissions`)                                                             |
| `/reboot`  | `Administrator` + must run in `GUILD_ID` + `confirm:true`; emits `SIGTERM` for PM2 restart                |
| `/help`    | Filters listed commands by the caller's member permissions vs each command's `default_member_permissions` |

# CI/CD

**PR (`pr.yml`):** format, lint, typecheck, build, test on Blacksmith runners (Node 26, fresh pnpm install action).

**Main (`ci.yml`):**

1. `deployment-check` — skip deploy for release commits or pure devDependency/lockfile-only changes
2. `version` — semantic-release when deploying
3. `validate` — format/lint/types/tests under dotenvx production env
4. `build-and-deploy` — rebuild natives, materialize `client_secret.json` from secret, build, optional slash deploy, rsync to server, `pm2-restart-safe TC-Bot`
5. `discord-status` — webhook summary

Do not invent secret values; only know they exist as named GitHub secrets in the workflow files.

# Watch out for

- Production needs both decrypted/encrypted `.env.production` **and** `.env.keys` on the server after deploy.
- `pnpm start` does not set `NODE_ENV=production`; PM2 does—env file choice differs.
- Changing slash command definitions requires `pnpm run deploy` (done in CI when Discord secrets present).

# Key sources

- `src/env/loadEnv.ts`
- `src/helper/usageTracker.ts`
- `src/helper/metrics.ts`
- `src/commands/utility/metrics.ts`, `reboot.ts`, `help.ts`
- `ecosystem.config.cjs`
- `.releaserc.json`
- `scripts/append-changelog.mjs`
- `.github/workflows/ci.yml`
- `.github/workflows/pr.yml`
- `.env.example`
- `README.md`
