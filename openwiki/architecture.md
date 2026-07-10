# TC-Bot Architecture

## Overview
TC-Bot follows a modular architecture designed for extensibility, reliability, and maintainability. The system is organized around clear separation of concerns with distinct modules for commands, events, helpers, and data persistence.

## Core Components

### 1. Main Bot Entrypoint (`/src/tc-bot.ts`)
The central orchestrator that initializes and coordinates all bot components.

**Key Responsibilities**:
- Discord client initialization with configured intents
- Google Sheets client authentication and setup
- Dynamic command and event loading
- Graceful shutdown handling (SIGTERM, SIGINT)
- Process lifecycle management

**8-Step Initialization Sequence**:
1. Environment loading via `@dotenvx/dotenvx`
2. Discord.js Client configuration
3. Google Sheets client authentication (JWT/OAuth2)
4. Command discovery and loading
5. Event handler registration
6. Client login and connection
7. Metrics database initialization
8. PM2 metrics monitoring setup

### 2. Helper Modules (`/src/helper/`)
Utility modules providing shared functionality across the application.

#### Core Helpers:
- **`constants.ts`** - Shared constants (timers, cooldowns, validation rules, cost types)
- **`commandDiscovery.ts`** - Dynamic command file discovery and loading
- **`sheetsCache.ts`** - Google Sheets integration with TTL-based caching
- **`usageTracker.ts`** - SQLite metrics database with queue-based writes
- **`mopup.ts`** - Mopup timing calculations with rate limiting
- **`debugLogger.ts`** - Centralized logging for operational debugging
- **`logError.ts`** - Error logging with transient network error detection
- **`idempotencyGuard.ts`** - Prevents duplicate command execution
- **`formatters.ts`** - String and data formatting utilities

#### Supporting Helpers:
- **`hrDuration.ts`** - Human-readable duration formatting
- **`metrics.js`** - Legacy metrics utilities (being migrated)
- **`validation.js`** - Input validation helpers

### 3. Event System (`/src/events/`)
Discord.js event handlers for bot lifecycle and user interactions.

#### Primary Events:
- **`clientReady.ts`** - Bot startup completion
  - Latency monitoring initialization
  - Status message updates
  - PM2 metrics registration

- **`interactionCreate.ts`** - Slash command execution
  - Command routing and execution
  - Cooldown enforcement
  - Usage tracking via `usageTracker`
  - Error handling and user feedback

- **`messageCreate.ts`** - Legacy message commands (optional)
  - Controlled by `ENABLE_LEGACY_MESSAGE_COMMANDS` flag
  - Backward compatibility for users
  - Same validation and error handling as slash commands

### 4. Command System (`/src/commands/`)
Modular command implementations organized by category.

#### Command Categories:
- **Ark of War Commands** (`/src/commands/aow/`):
  - `healtroop.ts` - Troop healing cost calculations (16KB - most complex)
  - `gearcheck.ts` - Gear statistics checking
  - `its.ts` - Item Trading System calculations
  - `mopup.ts` - Mopup timing status display

- **Utility Commands** (`/src/commands/utility/`):
  - `help.ts` - Command help and documentation
  - `metrics.ts` - Bot usage statistics display
  - `ping.ts` - Latency checking
  - `reboot.ts` - Uptime and reboot reason display

**Command Interface**:
```typescript
interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  cooldowns?: Map<string, number>;
}
```

### 5. Type Definitions (`/src/types/index.ts`)
Centralized TypeScript interfaces and type definitions.

**Key Types**:
- `Command` - Command structure definition
- `CommandUsage` - Usage tracking interface
- `MopupInfo` - Mopup timing data
- `TroopRow` - Google Sheets row wrapper
- `GoogleSheetsClient` - Typed sheets client
- Application-specific types for game calculations

## State Management Architecture

### Hybrid Storage Approach

#### 1. Google Sheets (Primary Game Data)
- **Purpose**: External game data storage
- **Integration**: `@googleapis/sheets` library
- **Caching**: Configurable TTL via `sheetsCache.ts`
- **Authentication**: Service account JWT/OAuth2

**Cache Features**:
- In-memory `Map`-based storage
- TTL-based expiration (`GOOGLE_SHEET_CACHE`)
- Proactive refresh scheduling
- Background refresh to prevent cache stampedes

#### 2. SQLite Database (Metrics & State)
- **Purpose**: Local metrics tracking and bot state
- **Database**: `better-sqlite3` with WAL mode
- **Location**: `./data/metrics.db` (configurable via `SQLITE_DB_PATH`)
- **Tables**: `command_usage`, `mopup_update_state`, `event_dedupe_lock`

**Optimizations**:
- WAL (Write-Ahead Logging) for concurrency
- Queue-based batched writes (1-second intervals)
- Automatic cleanup (90-day retention)
- Prepared statements for performance

### Data Flow Patterns

#### Command Execution Flow:
```
User Interaction → Discord.js → Event Handler → Command Execution
        ↓                               ↓               ↓
  Discord API                    Usage Tracking     Game Logic
        ↓                               ↓               ↓
  Response to User              SQLite Queue      Google Sheets
                                          ↓           ↓
                                    Batch Flush   Cache Layer
                                          ↓
                                    SQLite Database
```

#### Google Sheets Data Flow:
```
Command Request → Cache Check → [HIT] Return Cached Data
                        ↓ [MISS]
                  Google Sheets API → Parse Response
                        ↓
                  Update Cache → Schedule Refresh
                        ↓
                  Return Data to Command
```

## Error Handling & Resilience

### Multi-Layer Error Handling

#### 1. Command-Level Error Handling
```typescript
try {
  await command.execute(interaction);
} catch (error) {
  await logError(error, 'Command execution failed');
  await interaction.reply({ 
    content: 'An error occurred processing your command.', 
    ephemeral: true 
  });
}
```

#### 2. Transient Error Detection
- **`isTransientNetworkError()`**: Identifies network errors that should be retried
- **Automatic retry logic** for Google Sheets API calls
- **Graceful degradation** when external services are unavailable

#### 3. Process Resilience
- **Graceful shutdown**: Proper resource cleanup on SIGTERM/SIGINT
- **PM2 supervision**: Automatic restart on crashes
- **Memory limits**: 500MB restart threshold
- **Health monitoring**: Latency and connectivity checks

### Idempotency & Deduplication
- **`idempotencyGuard.ts`**: Prevents duplicate command processing
- **Database-level locks**: `event_dedupe_lock` table for distributed locking
- **Time-based deduplication**: Configurable cooldowns and rate limits

## Performance Optimizations

### Caching Strategies
1. **Google Sheets Cache**: 5-minute TTL with proactive refresh
2. **Command Cooldowns**: Per-user rate limiting via `TIMERS` constants
3. **Database Optimization**: WAL mode, batch writes, prepared statements

### Resource Management
- **Connection pooling**: Managed by libraries (Discord.js, better-sqlite3)
- **Memory management**: Queue-based writes prevent memory bloat
- **File descriptors**: Proper cleanup of database and log files

### Monitoring & Metrics
- **PM2 metrics**: Process-level monitoring
- **Usage tracking**: Command success/failure rates
- **Latency monitoring**: Discord API response times
- **Cache statistics**: Hit/miss rates for Google Sheets data

## Extension Points

### Adding New Commands
1. Create file in `/src/commands/[category]/`
2. Implement `Command` interface
3. Export `data` (SlashCommandBuilder) and `execute` function
4. Command automatically discovered and registered

### Adding New Events
1. Create file in `/src/events/`
2. Export event handler function
3. Register in `tc-bot.ts` initialization
4. Follow existing patterns for error handling

### Adding New Helpers
1. Create file in `/src/helper/`
2. Export focused, reusable functionality
3. Add TypeScript definitions if needed
4. Follow existing patterns for logging and error handling

### Configuration Extensions
1. **Environment variables**: Add to `.env.example` and type definitions
2. **Constants**: Add to `constants.ts` with documentation
3. **Database schema**: Extend via `CREATE TABLE IF NOT EXISTS` pattern

## Architecture Principles

### 1. Separation of Concerns
- Commands handle user interactions
- Events manage Discord.js lifecycle
- Helpers provide reusable utilities
- Types define data structures

### 2. Configurability
- Environment variable-driven configuration
- Constants file for tunable parameters
- Modular design for easy customization

### 3. Observability
- Comprehensive logging at all levels
- Usage tracking for analytics
- Performance monitoring via PM2
- Error tracking with context

### 4. Maintainability
- TypeScript with strict mode
- Consistent code patterns
- Comprehensive documentation
- Automated testing and validation

### 5. Production Readiness
- Graceful error handling
- Resource cleanup on shutdown
- Process supervision via PM2
- Security best practices

## System Dependencies

### Core Dependencies
- **Discord.js v14**: Discord API interaction
- **@googleapis/sheets**: Google Sheets integration
- **better-sqlite3**: Local database storage
- **@pm2/io**: Production monitoring

### Development Dependencies
- **TypeScript**: Static typing
- **Vitest**: Testing framework
- **oxlint/oxfmt**: Code quality tools
- **semantic-release**: Version management

## Deployment Architecture

### Runtime Environment
- **Node.js 26+**: JavaScript runtime
- **pnpm 11+**: Package management
- **PM2**: Process management
- **dotenvx**: Environment variable encryption

### Production Considerations
- **Memory limits**: 500MB per process
- **Log rotation**: Configured via PM2
- **Backup strategy**: Database and environment backups
- **Monitoring**: PM2 metrics + custom usage tracking

This architecture enables TC-Bot to provide reliable, performant game calculations while maintaining ease of development and operational simplicity.
