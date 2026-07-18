---
type: Workflow
title: Mopup Scheduler
description: Ark of War mopup window calculation, channel renames, status announcements, and SQLite cooldowns.
tags: [workflows, mopup]
timestamp: 2026-07-18T21:30:00Z
---

# Overview

Mopup is an alternating in-game activity window. TC-Bot computes ACTIVE/INACTIVE status and remaining time in `src/helper/mopup.ts`, exposes `/mopup` (and optional `!tcmu`), and optionally renames voice/stage channels and announces status changes. Scheduling logic lives in `src/tc-bot.ts` and persists cooldowns/status through [SQLite in runtime ops](/openwiki/operations/runtime-and-deploy.md). Slash/message delivery uses the [command pipeline](/openwiki/workflows/command-pipeline.md).

# Where to start

- `src/helper/mopup.ts` — `calculateMopupTiming`, embed builders
- `src/tc-bot.ts` — `startMopupTimer`, `runMopupUpdateIfDue`, `updateMopupChannels`, `tryAnnounceMopupStatusChange`
- `src/commands/aow/mopup.ts` — slash command
- Channel env: `CHANNEL_ID1` (status name), `CHANNEL_ID2` (time remaining), `CHANNEL_ID3` (announcement text channel)

# Timing model

`calculateMopupTiming()` derives a day index from local-offset epoch hours, then builds even/odd day windows (even: 26h–34h offsets; odd: 8h–24h offsets within the day scheme). Result: `MopupInfo` with `status` (`ACTIVE` | `INACTIVE`), display `time` (`HH:MM:SS`), Discord timestamp, and embed color.

# Background updates

Timers (`TIMERS.MOPUP_POLL_INTERVAL_MS` = 5s poll; `MOPUP_INTERVAL_MS` = 5 min min spacing):

- Disabled entirely if neither rename channels nor `CHANNEL_ID3` is configured.
- `runMopupUpdateIfDue` skips when an update is in progress or SQLite scheduler cooldown (`mopup:scheduler`) has wait time remaining.
- On run: announce on status change (if `CHANNEL_ID3`), then rename voice/stage channels when `CHANNEL_ID1`/`CHANNEL_ID2` set.
- Per-channel rename cooldowns use keys `mopup:channel:<id>`.
- Announcements use event locks + `safeChannelSend` fingerprinting to avoid duplicates; first-seen status is stored without announcing (including boot sync).

Channel names: `🟢 ACTIVE Mopup` / `🔴 INACTIVE Mopup` and `Time remaining: <time>`. Transient Discord network errors are warned and retried on later ticks.

# Watch out for

- Boot syncs last-known status **without** announcement, then may still run an update if cooldown allows.
- Renames only apply to Guild Voice / Stage channels; wrong channel types are silently skipped for rename.
- Timing uses `getTimezoneOffset()`—host timezone affects window math; keep production TZ stable.
- Do not announce on every tick—only when persisted last status differs from current.

# Key sources

- `src/helper/mopup.ts`
- `src/tc-bot.ts` (mopup functions)
- `src/helper/constants.ts` (`TIMERS`)
- `src/types/index.ts` (`MopupInfo`, `MopupStatus`)
