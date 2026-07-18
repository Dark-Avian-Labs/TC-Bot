---
type: Testing Guide
title: Quality and Tests
description: Vitest suites, coverage gates, and the local validate pipeline used in CI.
tags: [testing, vitest, quality]
timestamp: 2026-07-18T21:30:00Z
---

# Overview

Tests and static checks gate changes before merge/deploy. Local `pnpm run validate` mirrors the spirit of PR CI ([runtime and deploy](/openwiki/operations/runtime-and-deploy.md)). Prefer editing helpers/commands with matching tests under `tests/`.

# Where to start

- `vitest.config.ts` — node env, includes `tests/**/*.test.ts` and `scripts/**/*.test.ts`
- `tests/` — unit tests for formatters, commands (gearcheck, healtroop, its, mopup), sheets cache, reply dedupe, logging
- `tests/helpers.ts` — shared test utilities
- `run-quality-checks.mjs` — validate orchestrator
- `tsconfig.test.json` — typecheck of tests alongside `tsconfig.json`

# Commands

| Script                           | Role                                |
| -------------------------------- | ----------------------------------- |
| `pnpm run test`                  | `vitest run`                        |
| `pnpm run test:watch`            | interactive Vitest                  |
| `pnpm run test:coverage`         | coverage (v8); thresholds in config |
| `pnpm run typecheck`             | `tsc` noEmit for app + tests        |
| `pnpm run lint` / `check-format` | Oxlint / Oxfmt                      |
| `pnpm run validate`              | format → lint → typecheck → test    |

Coverage includes `src/helper/**` and `src/commands/**` with floors: lines/functions/statements 70%, branches 60%.

# What is covered

Strong coverage on pure helpers and command math (mopup timing, sheets cache behavior, duplicate reply cleanup, heal/ITS/gearcheck). Integration with live Discord or Google APIs is not the default—tests mock or exercise logic in isolation.

PR workflow runs build + test without requiring production dotenv secrets; main CI runs tests via `dotenvx run --strict -f .env.production`.

# Watch out for

- Adding commands under `src/commands/` should extend coverage-friendly units or helpers so thresholds stay green.
- `validate` treats step warnings specially in its summary UI—read the script if interpreting non-zero warning output.
- Native module `better-sqlite3` may need rebuild in some environments (`pnpm rebuild better-sqlite3`) before tests that touch the DB.

# Key sources

- `vitest.config.ts`
- `tests/*.test.ts`
- `run-quality-checks.mjs`
- `.github/workflows/pr.yml`
