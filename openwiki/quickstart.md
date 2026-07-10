# OpenWiki for TC-Bot

## Documentation Overview

TC-Bot is a Discord bot that provides stat calculations and theorycrafting tools for the game **Ark of War**. Built with TypeScript and Discord.js v14, it combines Google Sheets for game data persistence with SQLite for metrics tracking, serving users of the [Diplomacy of War Discord Server](https://discord.gg/YMAhCNjkgp).

## Getting Started

- **Quick Reference**: See [Architecture Overview](architecture.md)
- **Setup Guide**: [Installation & Setup](setup.md)
- **Command System**: [Commands & Usage](commands.md)
- **Data Models**: [Data Storage & Database Schema](data-models.md)
- **Developer Reference**: [API & Contribution Guidelines](developer-reference.md)
- **Testing Guide**: [Test Structure & CI/CD](testing.md)
- **Workflows**: [User Interactions & Bot Behavior](workflows.md)
- **Operations**: [Production Deployment & Monitoring](operations.md)

## Project Overview

TC-Bot was originally created by Krylar and has evolved through multiple major versions. Version 7+ is a complete TypeScript rewrite featuring strict typing, automated testing via Vitest, and robust CI/CD with GitHub Actions. The bot provides game-specific calculations for Ark of War, including troop healing costs, gear checking, and mopup timing.

### Key Features

- **8 Discord Commands**: Game calculations and utility functions
- **Google Sheets Integration**: External game data with intelligent caching
- **SQLite Metrics Database**: Usage tracking with automatic cleanup
- **Production Monitoring**: PM2 process management with metrics
- **Secure Configuration**: dotenvx encrypted environment variables
- **Comprehensive Testing**: 70% coverage thresholds with automated CI

## Core Architecture

- **Modular Design**: Commands (`/src/commands/`), events (`/src/events/`), helpers (`/src/helper/`), types (`/src/types/`)
- **State Management**: Google Sheets for game data + SQLite for metrics with WAL checkpointing
- **Command Discovery**: Dynamic loading via `/src/helper/commandDiscovery.ts`
- **Rate Limiting**: Configurable cooldowns via constants with user feedback
- **Error Handling**: Centralized logging, graceful shutdown, idempotency guards

## Setup Requirements

- **Node.js 26+**: Required runtime
- **pnpm 11+**: Package manager
- **Google Sheets API**: Service account credentials
- **Discord Bot Token**: From Discord Developer Portal
- **dotenvx**: For encrypted environment variable support (optional)

## Development Workflow

- **Local Development**: `pnpm start` (builds and runs)
- **Command Deployment**: `pnpm run deploy` (registers slash commands)
- **Quality Checks**: `pnpm run validate` (formatting, linting, typecheck, tests)
- **Environment Management**: `pnpm dlx dotenvx encrypt` (secure config)
- **Release Management**: Semantic release via CI pipelines

## Important Files

- `/src/tc-bot.ts` - Main bot entrypoint with 8-step initialization
- `/src/helper/constants.ts` - Shared constants (timers, cooldowns, validation)
- `/src/helper/mopup.ts` - Mopup timing system with rate limiting
- `/src/helper/sheetsCache.ts` - Google Sheets caching with TTL-based invalidation
- `/src/helper/usageTracker.ts` - SQLite metrics database with queue-based writes
- `/src/deployCommands.ts` - Command deployment and registration
- `/src/types/index.ts` - TypeScript interfaces and type definitions
- `/ecosystem.config.cjs` - PM2 production configuration

## Command Categories

- **Ark of War Commands** (`/src/commands/aow/`):
  - `healtroop` - Calculate troop healing costs
  - `gearcheck` - Check gear statistics
  - `its` - Item Trading System calculations
  - `mopup` - Display mopup timing status
- **Utility Commands** (`/src/commands/utility/`):
  - `help` - Display command help
  - `metrics` - Show bot usage statistics
  - `ping` - Check bot latency
  - `reboot` - Display bot uptime and reboot reasons

## Testing

- **Run Tests**: `pnpm run test`
- **Watch Mode**: `pnpm run test:watch`
- **Coverage**: `pnpm run test:coverage`
- **Type Checking**: `pnpm run typecheck`
- **Validation**: `pnpm run validate` (comprehensive quality check)

## Next Steps

1. **New Developers**: Start with [setup.md](setup.md) for installation
2. **Understanding Architecture**: Read [architecture.md](architecture.md)
3. **Adding Commands**: See [workflows.md](workflows.md) for command patterns
4. **Production Deployment**: Review [operations.md](operations.md) for deployment guidance
5. **Data Management**: Consult [data-models.md](data-models.md) for database schema
