# Data Models & Storage Architecture

## Overview
TC-Bot uses a hybrid storage approach:
- **SQLite** for local metrics and bot state tracking
- **Google Sheets** for external game data with intelligent caching
- **In-memory cache** for performance optimization

## SQLite Database Schema

### Database Location
- **Default path**: `./data/metrics.db`
- **Configurable via**: `SQLITE_DB_PATH` environment variable
- **Connection**: Managed by `better-sqlite3` library

### Tables

#### 1. `command_usage` - Command Execution Metrics
```sql
CREATE TABLE IF NOT EXISTS command_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_name TEXT NOT NULL,
  user_id TEXT,
  guild_id TEXT,
  success INTEGER NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'))
);
```

**Purpose**: Tracks all Discord command executions for analytics and monitoring.

**Fields**:
- `id`: Auto-incrementing primary key
- `command_name`: Name of the executed command (e.g., "healtroop", "gearcheck")
- `user_id`: Discord user ID who invoked the command
- `guild_id`: Discord server ID where command was executed
- `success`: Boolean (1 = success, 0 = failure)
- `error_message`: Error details if command failed
- `created_at`: Timestamp of execution

#### 2. `mopup_update_state` - Mopup Status Tracking
```sql
CREATE TABLE IF NOT EXISTS mopup_update_state (
  key TEXT PRIMARY KEY,
  updated_at_ms INTEGER NOT NULL
);
```

**Purpose**: Prevents rapid successive updates to mopup channels by tracking last update timestamps.

**Fields**:
- `key`: Unique identifier for the update context
- `updated_at_ms`: Timestamp of last update in milliseconds

#### 3. `event_dedupe_lock` - Event Deduplication
```sql
CREATE TABLE IF NOT EXISTS event_dedupe_lock (
  key TEXT PRIMARY KEY,
  expires_at_ms INTEGER NOT NULL
);
```

**Purpose**: Implements a distributed locking mechanism to prevent duplicate event processing.

**Fields**:
- `key`: Unique lock identifier
- `expires_at_ms`: Expiration timestamp in milliseconds

### Indices
```sql
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON command_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_cmd ON command_usage(command_name);
```

### Database Configuration

#### WAL (Write-Ahead Logging) Mode
```javascript
// Configured in /src/helper/usageTracker.ts
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

**Benefits**:
- Improved concurrency for read-heavy workloads
- Better performance for queue-based writes
- Configurable checkpoint intervals

#### Retention Policies
- **Default retention**: 90 days (`METRICS_RETENTION_DAYS`)
- **Automatic cleanup**: Old records purged based on retention policy
- **Checkpoint interval**: 300,000ms (5 minutes) - `CHECKPOINT_INTERVAL_MS`

#### Write Optimization
- **Queue-based writes**: In-memory queue buffers database writes
- **Batch flushing**: Flushes every 1,000ms (`METRICS_FLUSH_INTERVAL_MS`) with batch size of 50
- **Prepared statements**: Reusable SQL statements for performance

## Google Sheets Integration

### Caching Architecture (`/src/helper/sheetsCache.ts`)

#### Cache Structure
```typescript
interface CacheEntry {
  rows: TroopRow[];
  expiresAtMs: number;
  refreshScheduled: boolean;
}

// Cache storage
const cache = new Map<string, CacheEntry>();
```

#### Cache Configuration
- **Default TTL**: 300,000ms (5 minutes) - `GOOGLE_SHEET_CACHE`
- **Proactive refresh**: Refreshes before expiration based on lead time
- **Background scheduling**: Asynchronous refresh scheduling

#### Sheet Data Access
```typescript
// Primary access function
async function getSheetRowsCached(
  spreadsheetId: string,
  sheetId: number,
  options?: CacheOptions
): Promise<TroopRow[]>

// Sheet registration for caching
function registerSheetTitle(
  spreadsheetId: string, 
  sheetId: number, 
  title: string
): void
```

### Google Sheets Client
- **Library**: `@googleapis/sheets`
- **Authentication**: JWT/OAuth2 via service account
- **Configuration**: `client_secret.json` in project root
- **Environment variables**:
  - `GOOGLE_SPREADSHEET_ID`: Target spreadsheet
  - `GOOGLE_SHEET_ID`: Specific worksheet/tab ID
  - `GOOGLE_SHEET_NAME`: Optional sheet title override

## Data Models (`/src/types/index.ts`)

### Core Interfaces

#### Command Usage Tracking
```typescript
interface CommandUsage {
  commandName: string;
  userId?: string;
  guildId?: string | null;
  success: boolean;
  errorMessage?: string;
}
```

#### Metrics Aggregation
```typescript
interface MetricsTotals {
  total_count: number;
  success_count: number;
  failure_count: number;
}

interface MetricsTopCommand {
  command_name: string;
  cnt: number;
}
```

#### Application-Specific Models

**Mopup System**:
```typescript
interface MopupInfo {
  status: 'ACTIVE' | 'INACTIVE';
  timeRemaining: string;
  nextReset: string;
  timestamp: string;
}
```

**Game Calculations**:
```typescript
interface KillResult {
  kills: number;
  remainingHP: number;
  overkill: boolean;
}

interface GearCalculations {
  // Gear calculation data structure
}

interface HealingCosts {
  // Healing cost calculations
}
```

**Sheet Data**:
```typescript
interface TroopRow {
  // Dynamic row wrapper with header mapping
  [key: string]: string | number;
}
```

## Data Persistence Patterns

### 1. Queue-Based Batched Writes
- **Location**: `/src/helper/usageTracker.ts`
- **Pattern**: Commands queue usage events → Periodic batch flush to SQLite
- **Benefits**: Reduced database contention, improved response times

### 2. Cache-Aside Pattern (Google Sheets)
- **Pattern**: Check cache → If miss, fetch from Google Sheets → Update cache
- **TTL-based invalidation**: Automatic cache expiration
- **Proactive refresh**: Prevents cache stampedes

### 3. Event Deduplication
- **Pattern**: Database-level locks prevent duplicate event processing
- **Implementation**: `event_dedupe_lock` table with expiration timestamps
- **Use case**: Mopup channel updates, critical bot operations

### 4. WAL Checkpointing
- **Pattern**: Regular WAL checkpointing for durability
- **Configuration**: `CHECKPOINT_INTERVAL_MS` environment variable
- **Benefit**: Balances performance with data safety

## Environment Variables

### Database Configuration
```
SQLITE_DB_PATH=./data/metrics.db
METRICS_RETENTION_DAYS=90
CHECKPOINT_INTERVAL_MS=300000
METRICS_FLUSH_INTERVAL_MS=1000
```

### Google Sheets Configuration
```
GOOGLE_SHEET_CACHE=300000
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SHEET_ID=your-sheet-id
GOOGLE_SHEET_NAME=optional-sheet-title
```

## Maintenance Operations

### Database Cleanup
```bash
# Manual cleanup (retention enforced automatically)
DELETE FROM command_usage 
WHERE created_at < date('now', '-90 days');
```

### Cache Management
- **Automatic**: TTL-based expiration
- **Manual**: Restart bot to clear in-memory cache
- **Monitoring**: Cache hit/miss metrics available in debug logs

### Backup Considerations
1. **SQLite**: Regular backups of `./data/metrics.db`
2. **Google Sheets**: Native version history and backup features
3. **Environment**: Secure backup of `.env.keys` for dotenvx encryption

## Data Flow Diagram
```
User Command → Discord.js → Command Handler → [Success/Failure]
                                      ↓
                                Queue Usage Event
                                      ↓
                             Periodic Batch Flush (1s)
                                      ↓
                              SQLite (WAL mode) ←→ Automatic Cleanup
                                      ↓
                                Analytics Queries
                                      
Google Sheets API ←→ Cache Layer (5min TTL) ←→ Game Data Requests
```

## Common Data Operations

### Adding New Metrics
1. Import `usageTracker` module
2. Call `trackCommandUsage(usage: CommandUsage)`
3. Event automatically queued and persisted

### Accessing Sheet Data
1. Import `getSheetRowsCached` from `sheetsCache`
2. Provide spreadsheet and sheet IDs
3. Receive cached or freshly fetched rows

### Custom Data Persistence
For new data types beyond metrics:
1. Extend SQLite schema with new tables
2. Implement dedicated helper module
3. Follow queue-based pattern for write-heavy operations