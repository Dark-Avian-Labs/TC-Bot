# TC-Bot Workflows

## Command Deployment Process

1. **Preparation**:
   - Edit/create command in `/src/commands/[module]/[command].ts`
   - Add examples to command data for documentation
   - Ensure proper validation and error handling

2. **Deployment**:
   - Build TypeScript: `pnpm run build`
   - Register commands: `pnpm run deploy`
   - Optional: Guild-specific deployment with `GUILD_ID`

3. **Verification**:
   - Test command in Discord channel
   - Verify slash command autocomplete
   - Check error handling paths

## Interaction Handling Flow

1. **Event Dispatch**:
   - `interactionsCreate` event receives interaction
   - Bot verifies interaction is from command
   - Looks up command in client.commands collection

2. **Command Execution**:
   - Validates parameters against command data
   - Checks rate limits/cooldowns if applicable
   - Executes command.execute(interaction) method

3. **Response Handling**:
   - Defer replies for long operations
   - Edit replies with results or errors
   - Handle string select menus via handleSelect

## Error Recovery Patterns

1. **Network Resilience**:
   - `isTransientNetworkError` in `logError.js` detects transient failures
   - Automatic retries for Google Sheets API calls
   - Fallback to cached data when Sheets unavailable

2. **Process Management**:
   - Graceful shutdown on SIGTERM/SIGINT
   - Cleanup of timers, database connections
   - Discord client destruction to prevent leaks

3. **Data Integrity**:
   - Idempotency guards prevent duplicate processing
   - WAL checkpointing ensures metrics durability
   - Environment validation at startup

## Testing Workflow

1. **Unit Tests**:
   - Located in `/tests/` directory
   - Run with `pnpm run test` or `pnpm run test:watch`
   - Coverage via `pnpm run test:coverage`

2. **Validation Pipeline**:
   - Format check: `pnpm run check-format`
   - Linting: `pnpm run lint`
   - Type checking: `pnpm run typecheck`
   - Combined: `pnpm run validate`

3. **Test Examples**:
   - `/tests/mopup.test.ts` - Tests mopup timing logic
   - `/tests/healtroop.test.ts` - Tests troop healing calculations
   - `/tests/sheetsCache.test.ts` - Tests Google Sheets caching

## Release Process

1. **Version Bumping**:
   - Automatic via semantic-release
   - Conventional commits required
   - Release notes generated from commits

2. **CI/CD Pipeline**:
   - GitHub Actions in `.github/workflows/`
   - Runs on push to main branch
   - Includes build, test, and deploy steps

3. **Release Artifacts**:
   - Built JavaScript in `/dist/` directory
   - TypeScript definitions included
     .d.ts files
   - Release notes in CHANGELOG.md

## Operational Procedures

1. **Startup Sequence**:
   - Validate required environment variables
   - Initialize Google Sheets connection
   - Load all command modules
   - Register event handlers
   - Connect to Discord

2. **Health Monitoring**:
   - Discord latency monitoring via websocket ping
   - Metrics database checkpointing
   - Error logging to console and Discord

3. **Shutdown Procedure**:
   - Stop all timers and intervals
   - Flush metrics database
   - Close database connections
   - Destroy Discord client connection

## Environment Configuration

1. **Required Variables**:
   - `TOKEN`: Discord bot token
   - `CLIENT_ID`: Discord application ID
   - `GUILD_ID`: Target Discord server (optional for global commands)
   - `GOOGLE_SPREADSHEET_ID`: Google Sheets ID for data storage
   - `GOOGLE_SHEET_ID`: Specific tab/worksheet ID

2. **Optional Features**:
   - `ENABLE_LEGACY_MESSAGE_COMMANDS`: Enable !tcmu legacy commands
   - `MESSAGE_COMMAND_CHANNEL_ID`: Restrict legacy commands to channel
   - `GOOGLE_SHEET_CACHE`: Cache TTL for Sheets data (ms)
   - `SQLITE_DB_PATH`: Location for metrics database

3. **Security Considerations**:
   - Never commit `.env` files with real secrets
   - Use dotenvx for encrypted environment variables
   - Store `client_secret.json` for Google API access locally only
