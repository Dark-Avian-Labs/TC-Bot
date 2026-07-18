---
type: Integration
title: Google Sheets
description: Service-account Sheets client, troop row fetch, and proactive TTL cache used by healing and ITS.
tags: [integrations, google, sheets]
timestamp: 2026-07-18T21:30:00Z
---

# Overview

TC-Bot reads a Theorycrafters Google Spreadsheet with a service account for [theorycrafting](/openwiki/domain/theorycrafting.md) commands. Initialization happens during [bot runtime](/openwiki/architecture/bot-runtime.md) boot; reads go through `getSheetRowsCached` in `src/helper/sheetsCache.ts`. Scope is spreadsheets **readonly**.

# Where to start

- Credentials file: `client_secret.json` in process cwd (service account JSON with `client_email` + `private_key`)
- Env: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_ID` (numeric tab id), optional `GOOGLE_SHEET_NAME`, `GOOGLE_SHEET_CACHE` (TTL ms)
- `src/tc-bot.ts` — `initializeGoogleSheets`, `loadGoogleCredentials`
- `src/helper/sheetsCache.ts` — cache, title resolution, background refresh
- Types: `GoogleSheetsClient`, `TroopRow`, `CacheEntry` in `src/types/index.ts`

# Boot wiring

1. Read and validate `client_secret.json`.
2. Build JWT + `sheets({ version: 'v4', auth })`.
3. Attach `{ sheetsApi, spreadsheetId }` on `client.GoogleSheets`.
4. Resolve configured sheet id → title via spreadsheet metadata (`registerSheetTitle`).
5. Prefetch rows to warm cache.

Without valid credentials or required IDs, the process exits during init.

# Cache behavior

- In-memory `Map` keyed by `spreadsheetId:sheetId`.
- TTL from `GOOGLE_SHEET_CACHE` (default/fallback 300000 ms; max 24h). Invalid values warn and fall back.
- Single-flight loads via `loadingPromise` on cache entries.
- Proactive refresh scheduled before expiry (lead ~15% of TTL, clamped).
- Title resolution order: registered title → `GOOGLE_SHEET_NAME` → metadata lookup by sheet id.
- Rows: first sheet row = headers; remaining rows become `TroopRow` maps. PM2 metrics track hits/misses/cached row counts.

# Watch out for

- Share the spreadsheet with the service account email or API calls fail at runtime.
- Tab identity is **sheet id**, not always the visible name—keep `GOOGLE_SHEET_ID` in sync if tabs are recreated.
- Setting `GOOGLE_SHEET_NAME` skips a metadata round-trip on refresh when the title is already known—wrong name yields empty/wrong data.
- Never document real private keys; CI injects base64 `GOOGLE_CLIENT_SECRET_BASE64` into `client_secret.json` at deploy time.

# Key sources

- `src/helper/sheetsCache.ts`
- `src/tc-bot.ts` (`initializeGoogleSheets`)
- `.env.example` (Sheets section)
- README “Google service account credentials”
