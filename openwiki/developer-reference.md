# Developer Reference & Contribution Guidelines

## Overview

This document provides technical reference and contribution guidelines for TC-Bot development. It covers code organization, API patterns, testing practices, and the development workflow.

## Project Structure

### Directory Layout

```
/
├── src/
│   ├── commands/          # Discord slash commands
│   │   ├── aow/          # Ark of War game commands
│   │   └── utility/      # Utility commands
│   ├── events/           # Discord event handlers
│   ├── helper/           # Utility modules
│   ├── types/            # TypeScript type definitions
│   ├── env/              # Environment loading
│   ├── tc-bot.ts         # Main bot entrypoint
│   └── deployCommands.ts # Command deployment script
├── tests/                # Test files
├── scripts/              # Build and utility scripts
├── .github/              # CI/CD workflows
└── data/                 # SQLite database (gitignored)
```

### TypeScript Configuration

- **Strict mode**: Enabled for all TypeScript files
- **Target**: ES2022
- **Module**: ES2022
- **Module resolution**: Node16
- **Config files**:
  - `tsconfig.json` - Main configuration
  - `tsconfig.test.json` - Test-specific configuration

## API Reference

### Core Bot Client Extension

The Discord.js Client is extended with custom properties:

```typescript
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
    GoogleSheets: GoogleSheetsClient | null;
  }
}
```

### Command Interface

All commands must implement the `Command` interface:

```typescript
interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  cooldowns?: Map<string, number>;
}
```

### Helper Module Exports

#### Constants (`/src/helper/constants.ts`)

```typescript
export const TIMERS: Record<string, number>;
export const ENABLE_LEGACY_MESSAGE_COMMANDS: boolean;
export const COST_TYPES: readonly string[];
export const VALIDATION: Record<string, RegExp>;
```

#### Command Discovery (`/src/helper/commandDiscovery.ts`)

```typescript
export async function discoverCommandFiles(): Promise<string[]>;
export function loadCommand(filePath: string): Promise<Command>;
```

#### Usage Tracker (`/src/helper/usageTracker.ts`)

```typescript
export function trackCommandUsage(usage: CommandUsage): void;
export function getMetricsTotals(): Promise<MetricsTotals>;
export function getTopCommands(limit?: number): Promise<MetricsTopCommand[]>;
export function cleanupOldMetrics(): Promise<void>;
```

#### Sheets Cache (`/src/helper/sheetsCache.ts`)

```typescript
export function getSheetRowsCached(
  spreadsheetId: string,
  sheetId: number,
  options?: CacheOptions,
): Promise<TroopRow[]>;

export function registerSheetTitle(spreadsheetId: string, sheetId: number, title: string): void;
```

#### Mopup System (`/src/helper/mopup.ts`)

```typescript
export function calculateMopupTiming(): MopupInfo;
export function getMopupUpdateWaitMs(key: string): number;
export function updateMopupState(key: string): void;
```

## Adding New Commands

### 1. Command Structure Template

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('commandname')
  .setDescription('Command description')
  .addStringOption((option) =>
    option.setName('parameter').setDescription('Parameter description').setRequired(true),
  );

export async function execute(interaction) {
  // Command logic here
  await interaction.reply({ content: 'Response', ephemeral: true });
}

// Optional: Cooldown tracking
export const cooldowns = new Map<string, number>();
```

### 2. Command Placement

- **Game-related commands**: `/src/commands/aow/`
- **Utility commands**: `/src/commands/utility/`
- **File naming**: Use descriptive names (e.g., `gearcheck.ts`, `healtroop.ts`)

### 3. Command Registration

Commands are automatically discovered and loaded via:

- **Discovery**: `discoverCommandFiles()` scans command directories
- **Loading**: Dynamic import of `.ts` files
- **Registration**: Added to `client.commands` collection

### 4. Best Practices

- **Error handling**: Wrap in try-catch, log errors via `logError`
- **User feedback**: Use ephemeral replies for errors
- **Validation**: Validate inputs before processing
- **Rate limiting**: Respect cooldowns defined in `constants.ts`

## Event Handlers

### Available Events

1. **`clientReady`** (`/src/events/clientReady.ts`)
   - Bot startup completion
   - Latency monitoring initialization
   - Status message updates

2. **`interactionCreate`** (`/src/events/interactionCreate.ts`)
   - Slash command execution
   - Cooldown enforcement
   - Usage tracking
   - Error handling

3. **`messageCreate`** (`/src/events/messageCreate.ts`)
   - Legacy message-based commands (optional)
   - Controlled by `ENABLE_LEGACY_MESSAGE_COMMANDS`

### Adding New Events

1. Create file in `/src/events/`
2. Export event handler function
3. Register in `tc-bot.ts` initialization

## Testing Framework

### Test Structure

- **Framework**: Vitest
- **Location**: `/tests/` directory
- **Naming**: `*.test.ts` suffix
- **Coverage**: 70% minimum thresholds

### Running Tests

```bash
# Run all tests
pnpm run test

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test:coverage

# Single test file
pnpm test -- tests/file.test.ts
```

### Test Helpers

```typescript
// Available in tests/helpers.ts
export function createMockRow(data: Record<string, string>): TroopRow;
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { calculateSomething } from '../src/helper/something.ts';

describe('something module', () => {
  it('should calculate correctly', () => {
    const result = calculateSomething(input);
    expect(result).toEqual(expected);
  });
});
```

## Code Quality

### Linting & Formatting

- **Linter**: oxlint with Node.js, Promise, Import, and Vitest plugins
- **Formatter**: oxfmt
- **Commands**:
  ```bash
  pnpm run lint          # Check code quality
  pnpm run format        # Format code
  pnpm run check-format  # Check formatting
  pnpm run typecheck     # TypeScript validation
  pnpm run validate      # Comprehensive quality check
  ```

### Quality Gates

1. **Formatting**: oxfmt compliance
2. **Linting**: No oxlint errors
3. **Type checking**: No TypeScript errors
4. **Tests**: All tests pass with 70% coverage
5. **Build**: Successful TypeScript compilation

## Development Workflow

### Local Development

1. **Setup**: Follow [setup.md](setup.md)
2. **Development**: `pnpm start` (auto-rebuilds on changes)
3. **Testing**: `pnpm run test:watch`
4. **Quality**: `pnpm run validate` before commits

### Command Deployment

```bash
# Register slash commands with Discord
pnpm run deploy

# Environment options:
# - Default: Uses .env file
# - Production: Uses .env.production
# - Development: Uses .env.development
```

### Environment Management

```bash
# Encrypt environment variables (production)
pnpm dlx dotenvx encrypt

# Decrypt for editing
pnpm dlx dotenvx decrypt

# Different environments
DOTENV_ENVIRONMENT=production pnpm dlx dotenvx encrypt
```

## CI/CD Pipeline

### GitHub Actions Workflows

1. **`ci.yml`**: Main CI/CD pipeline (push to main)
   - Smart deployment detection
   - Version bumping via semantic-release
   - Quality validation
   - Production deployment

2. **`pr.yml`**: Pull request validation
   - Quality checks only
   - No deployment

### Semantic Release Configuration

- **Version bumping**: Based on commit messages
- **Changelog**: Automatic updates to CHANGELOG.md
- **Git tags**: Automatic tagging
- **Deployment**: Only on production dependency changes

### Deployment Process

1. **Detection**: Checks if production dependencies changed
2. **Versioning**: semantic-release determines next version
3. **Validation**: Formatting, linting, typecheck, tests
4. **Build**: TypeScript compilation
5. **Command deployment**: Registers slash commands
6. **Server deployment**: SSH-based deployment to production

## Performance Considerations

### Memory Management

- **Cache size**: Google Sheets cache uses configurable TTL
- **Queue limits**: Usage tracker queue flushes regularly
- **Database connections**: SQLite connection managed properly

### Database Optimization

- **WAL mode**: Enabled for better concurrency
- **Batch writes**: Usage events batched for efficiency
- **Indexes**: Proper indexing on frequently queried columns
- **Cleanup**: Automatic cleanup of old records

### Google Sheets Optimization

- **Caching**: Configurable TTL reduces API calls
- **Batch reads**: Fetch all rows at once
- **Proactive refresh**: Prevents cache misses during peak usage

## Security Considerations

### Environment Variables

- **Encryption**: dotenvx support for encrypted `.env` files
- **Secrets**: Never commit `.env.keys` or `client_secret.json`
- **GitHub Secrets**: Store production keys in repository secrets

### Input Validation

- **User inputs**: Validate all command parameters
- **Regular expressions**: Use patterns from `constants.ts`
- **Type coercion**: Proper type checking for all inputs

### Error Handling

- **Logging**: Centralized error logging via `logError`
- **User feedback**: Generic error messages for users
- **Sensitive data**: Never expose secrets in error messages

## Troubleshooting

### Common Issues

#### Command Not Registering

1. Check file location in `/src/commands/`
2. Verify command follows interface structure
3. Run `pnpm run deploy` to register commands
4. Check Discord Developer Portal for command registration

#### Google Sheets Access Issues

1. Verify `client_secret.json` exists
2. Check spreadsheet sharing with service account
3. Verify environment variables are set
4. Check cache TTL configuration

#### Database Issues

1. Check `./data/` directory permissions
2. Verify SQLite database file exists
3. Check WAL journal files are accessible
4. Review database connection in `usageTracker.ts`

#### Test Failures

1. Run `pnpm run typecheck` for TypeScript issues
2. Check test environment configuration
3. Verify mock data matches current schema
4. Review coverage thresholds

### Debugging Tools

- **Logging**: `debugLogger` for operational debugging
- **Metrics**: `metrics` command for usage statistics
- **PM2**: Process monitoring and logging
- **Vitest**: Interactive test debugging with `--watch`

## Contribution Checklist

### Before Submitting PR

- [ ] Code follows project structure patterns
- [ ] All tests pass (`pnpm run test`)
- [ ] TypeScript compiles without errors (`pnpm run typecheck`)
- [ ] Code is properly formatted (`pnpm run check-format`)
- [ ] Linting passes (`pnpm run lint`)
- [ ] New commands include tests
- [ ] Documentation updated if needed
- [ ] No sensitive data in commits

### Code Review Focus Areas

1. **Architecture**: Follows existing patterns
2. **Testing**: Adequate test coverage
3. **Performance**: Efficient algorithms and data structures
4. **Security**: Proper input validation and error handling
5. **Documentation**: Clear comments and type definitions

## Getting Help

- **Issues**: GitHub issue tracker
- **Documentation**: This OpenWiki
- **Community**: Diplomacy of War Discord server
- **Historical context**: CHANGELOG.md and git history
