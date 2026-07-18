---
type: Domain Concept
title: Theorycrafting Commands
description: Ark of War healing, ITS kill estimates, and gear stat multiplier calculations.
tags: [domain, aow, commands]
timestamp: 2026-07-18T21:30:00Z
---

# Overview

Game-facing slash commands under `src/commands/aow/` implement theorycrafting for Ark of War. Healing and ITS read troop tables from [Google Sheets](/openwiki/integrations/google-sheets.md). Gearcheck is pure math from constants. All execute through the [command pipeline](/openwiki/workflows/command-pipeline.md). Shared validation limits and cost labels live in `src/helper/constants.ts`; domain types in `src/types/index.ts`.

# Where to start

| Command      | File                            | Needs Sheets?                                            |
| ------------ | ------------------------------- | -------------------------------------------------------- |
| `/healtroop` | `src/commands/aow/healtroop.ts` | Yes                                                      |
| `/its`       | `src/commands/aow/its.ts`       | Yes                                                      |
| `/gearcheck` | `src/commands/aow/gearcheck.ts` | No                                                       |
| `/mopup`     | `src/commands/aow/mopup.ts`     | No (see [mopup](/openwiki/workflows/mopup-scheduler.md)) |

Utility commands (`help`, `ping`, `metrics`, `reboot`) live under `src/commands/utility/` and are not game math.

# Healtroop

Computes healing costs for selected troop rows from the Theorycrafters sheet. Uses resource/special/other cost columns (`COST_TYPES`), modifier tiers (`MODIFIER_THRESHOLDS`), and formatted labels (`COST_LABELS`). Flow typically defers the interaction, caches sheet rows, may present a string select (`healtroop:…`) when many matches exist (`TRUNCATION_LIMITS`), and embeds current vs optimal cost breakdowns (`HealingCosts`). Select menus are routed from `interactionsCreate`.

# ITS (Ignore Tier Suppression)

Estimates how many troops of a target tier can be killed given ITS skill level, leadership, optional TDR. Pulls troop power/HP-related fields from sheet rows (`TroopRow`), applies `VALIDATION.ITS_DAMAGE_COEFFICIENT` (0.005) and tier bounds (`MIN_TIER`/`MAX_TIER`). Returns `KillResult`-style counts in an embed.

# Gearcheck

Given current stat amount and upgrade level, projects values at gear checkpoints `GEARCHECK_LEVELS` / `GEARCHECK_MULTIPLIERS` (0, +10, +13, +20, +30, +40, +50). Caps gear level via `VALIDATION.MAX_GEAR_LEVEL`. No external data.

# Watch out for

- Sheet column header names must match what healtroop/ITS expect (`TroopRow` maps header → value); sheet schema changes break calcs without code updates.
- Select option cap is 25 (Discord); truncation helpers limit rows shown.
- `client.GoogleSheets` may be null only if init failed—boot normally prevents that; commands should still guard.

# Key sources

- `src/commands/aow/healtroop.ts`
- `src/commands/aow/its.ts`
- `src/commands/aow/gearcheck.ts`
- `src/helper/constants.ts`
- `src/types/index.ts` (`TroopRow`, `HealingCosts`, `KillResult`, `GearCalculations`)
