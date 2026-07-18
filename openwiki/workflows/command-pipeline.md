---
type: Workflow
title: Command Pipeline
description: Slash interactions, optional legacy !tcmu, idempotency locks, and duplicate-safe Discord replies.
tags: [workflows, discord, commands]
timestamp: 2026-07-18T21:30:00Z
---

# Overview

User-facing work flows through Discord events into registered command modules. The pipeline depends on the [bot runtime](/openwiki/architecture/bot-runtime.md) command collection and records usage in SQLite via [runtime ops](/openwiki/operations/runtime-and-deploy.md). Theorycrafting slash commands are described under [theorycrafting](/openwiki/domain/theorycrafting.md); mopup embeds share helpers with the [mopup scheduler](/openwiki/workflows/mopup-scheduler.md).

# Where to start

- `src/events/interactionsCreate.ts` — chat commands + healtroop select menus
- `src/events/messageCreate.ts` — legacy `!tcmu` (gated)
- `src/helper/safeDiscordResponse.ts` — reply/followUp/send with dedupe
- `src/helper/idempotencyGuard.ts` — in-process duplicate event IDs
- `src/helper/usageTracker.ts` — `tryAcquireEventLock`, `logCommandUsage`
- `src/helper/errorHandler.ts` — user-visible error replies

# Slash / interaction path

1. `InteractionCreate` fires.
2. Skip if `isDuplicateEventId(interaction:…)` (in-process) or SQLite `tryAcquireEventLock(interaction:exec:…)` fails (cross-process).
3. String select menus with `customId` starting `healtroop:` → dynamic import of healtroop `handleSelect`.
4. Chat input → lookup `client.commands`; missing command gets an ephemeral fallback.
5. `command.execute` → on success/failure: PM2 counters + `logCommandUsage`; failures go through `handleCommandError`.

# Legacy message path

Enabled only when `ENABLE_LEGACY_MESSAGE_COMMANDS` is `true`/`1`. Requires `MESSAGE_COMMAND_CHANNEL_ID` and GuildText channel match; bots ignored. Sole command: exact `!tcmu` → mopup embed via `safeMessageReply`, with its own cross-process lock key.

Without the flag, message intents are not requested and the `MessageCreate` event module is not registered.

# Safe replies and dedupe

`safeInteractionReply`, `safeInteractionFollowUp`, `safeDeferReply`, `safeMessageReply`, and `safeChannelSend` wrap discord.js sends. Non-ephemeral responses use `replyDuplicateCleanup` fingerprints so overlapping processes/restarts do not post duplicate public messages. Ephemeral replies skip fingerprint cleanup. Interaction exec lock TTL is 15 minutes (`INTERACTION_EXEC_LOCK_TTL_MS`).

# Watch out for

- Always prefer the `safe*` helpers for public channel content; raw `interaction.reply` bypasses dedupe.
- Healtroop select handling is hard-wired in the event file—new select menus need similar routing or a shared dispatcher.
- Usage logging failures after a command error are swallowed after logging so they do not mask the original failure path.

# Key sources

- `src/events/interactionsCreate.ts`
- `src/events/messageCreate.ts`
- `src/helper/safeDiscordResponse.ts`
- `src/helper/replyDuplicateCleanup.ts`
- `src/helper/idempotencyGuard.ts`
- `src/helper/constants.ts` (`ENABLE_LEGACY_MESSAGE_COMMANDS`)
