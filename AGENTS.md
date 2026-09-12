# TC-Bot

## Org standards

CI/README/validate conventions live in AppBase [`docs/org-standards/`](../AppBase/docs/org-standards/). This repo is **semantic-release Track A**. GitHub is `ishark5060/tc-bot` (personal), not Dark-Avian-Labs. It is a Discord bot, not a DAL web app, and does **not** follow the AppBase design system.

See `README.md` for scripts, env, and Google credential shape.

## Runtime

`loadEnv` picks `.env.production` only when `NODE_ENV=production`, else `.env.development`. `pnpm start` does **not** set `NODE_ENV=production`; PM2 does. Slash register (`pnpm run deploy prod|dev`) is not part of bot boot: `prod` loads `.env.production`, `dev` loads `.env.development`, missing arg errors. Guild commands if `GUILD_ID` is set, else global. Runtime loads `dist/commands/**/*.js`; deploy discovers `src/**/*.ts`. Keep both paths working.

Prefer `safe*` reply helpers. Raw `interaction.reply` bypasses public-message fingerprint dedupe. Interaction exec lock TTL is 15 minutes (SQLite, same DB as metrics). `/reboot` needs Administrator in `GUILD_ID` plus `confirm:true`, then `SIGTERM` for PM2.

Legacy `!tcmu` only when `ENABLE_LEGACY_MESSAGE_COMMANDS` is on and `MESSAGE_COMMAND_CHANNEL_ID` matches.

## Sheets and mopup

Boot **hard-requires** Sheets credentials + `GOOGLE_SPREADSHEET_ID` / `GOOGLE_SHEET_ID` even though `/gearcheck` and `/mopup` do not read the sheet. Tab identity is numeric `GOOGLE_SHEET_ID`, not the display name. Deploy rsync excludes `data/` and `logs/` so metrics and locks survive.

Mopup timing uses the **host timezone**. Even day: 26h–34h offsets; odd day: 8h–24h. Boot syncs last status without announcing. Discord `/metrics` is SQLite usage; `@pm2/io` is the process dashboard.

## Toolchain

Node **26+**, pnpm **12.x**, exact `packageManager`. `pnpm run validate` is the quality gate. Angular commits; `chore` and `ci` also release as patch.

On Windows, Cursor agent shells may prepend bundled Node 22. After changing Node versions, run `pnpm rebuild better-sqlite3`.

## Tests

`pnpm run validate` is the quality gate: preflight, oxfmt, oxlint, typecheck, Vitest. In CI that Vitest step is instrumented (`pnpm run test:coverage`); locally `pnpm test` stays uninstrumented. Use `pnpm run test:watch` while iterating.

Coverage reports `src/helper/**` and `src/commands/**` (no percentage gate — the old 70% thresholds never held once `@vitest/coverage-v8` actually ran). There is no HTTP app, so there is no Playwright. Do not boot the Discord client in CI — Sheets credentials are required at process start.
