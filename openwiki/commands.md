# Commands & Usage

## Overview

TC-Bot provides 8 Discord slash commands organized into two categories: Ark of War game commands and utility commands. All commands follow a consistent structure and include proper error handling, rate limiting, and usage tracking.

## Command Structure

### Standard Command Template

```typescript
import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('commandname')
  .setDescription('Command description')
  .addStringOption((option) =>
    option.setName('parameter').setDescription('Parameter description').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    // Command logic here
    const result = await performCalculation();

    await interaction.reply({
      content: `Result: ${result}`,
      ephemeral: true, // Makes response visible only to user
    });
  } catch (error) {
    await logError(error, 'Command execution failed');
    await interaction.reply({
      content: 'An error occurred processing your command.',
      ephemeral: true,
    });
  }
}

// Optional: Cooldown tracking
export const cooldowns = new Map<string, number>();
```

### Command Discovery & Loading

Commands are automatically discovered and loaded via `/src/helper/commandDiscovery.ts`:

1. Scans `/src/commands/` directory recursively
2. Finds all `.ts` files
3. Dynamically imports each module
4. Adds to `client.commands` collection

## Ark of War Commands (`/src/commands/aow/`)

### 1. `healtroop` - Troop Healing Cost Calculator

**File**: `/src/commands/aow/healtroop.ts` (16KB - most complex command)

**Purpose**: Calculates healing costs for troops in Ark of War based on various factors.

**Parameters**:

- `units` (required): Number of units to heal
- `unit_type`: Type of units (soldier, rider, etc.)
- `current_hp`: Current health percentage
- `target_hp`: Target health percentage
- `cost_type`: Type of cost calculation (resource type)

**Features**:

- Complex calculation logic with multiple formulas
- Input validation and error checking
- Multiple cost type calculations
- User-friendly formatted output

**Usage Example**:

```
/healtroop units:1000 unit_type:soldier current_hp:50 target_hp:100 cost_type:gold
```

### 2. `gearcheck` - Gear Statistics Checker

**File**: `/src/commands/aow/gearcheck.ts`

**Purpose**: Analyzes gear statistics and provides optimization recommendations.

**Parameters**:

- `gear_level`: Gear level to analyze
- `gear_type`: Type of gear (weapon, armor, etc.)
- `stat_focus`: Primary stat to optimize

**Features**:

- Gear calculation algorithms
- Stat optimization suggestions
- Comparative analysis

**Usage Example**:

```
/gearcheck gear_level:epic gear_type:weapon stat_focus:attack
```

### 3. `its` - Item Trading System Calculator

**File**: `/src/commands/aow/its.ts`

**Purpose**: Calculates Item Trading System values and exchange rates.

**Parameters**:

- `item_name`: Name of the item to trade
- `quantity`: Number of items
- `target_item`: Item to trade for
- `exchange_rate`: Custom exchange rate (optional)

**Features**:

- ITS value calculations
- Exchange rate optimization
- Profit/loss analysis

**Usage Example**:

```
/its item_name:crystal quantity:100 target_item:gold
```

### 4. `mopup` - Mopup Timing Status

**File**: `/src/commands/aow/mopup.ts`

**Purpose**: Displays current mopup status and timing information.

**Parameters**: None (simple status command)

**Features**:

- Real-time mopup timing calculations
- Status display (ACTIVE/INACTIVE)
- Time remaining until next change
- Rate-limited updates to prevent spam

**Usage Example**:

```
/mopup
```

**Output Format**:

```
Mopup Status: ACTIVE
Time Remaining: 4:32
Next Reset: 2024-01-01 18:00:00 UTC
```

## Utility Commands (`/src/commands/utility/`)

### 5. `help` - Command Help & Documentation

**File**: `/src/commands/utility/help.ts`

**Purpose**: Displays help information for all commands or specific commands.

**Parameters**:

- `command` (optional): Specific command to get help for

**Features**:

- Dynamic command listing
- Detailed parameter descriptions
- Usage examples
- Ephemeral responses for privacy

**Usage Example**:

```
/help command:healtroop
```

### 6. `metrics` - Bot Usage Statistics

**File**: `/src/commands/utility/metrics.ts`

**Purpose**: Displays bot usage statistics and performance metrics.

**Parameters**: None

**Features**:

- Command usage counts
- Success/failure rates
- Top commands by usage
- Database query optimization

**Usage Example**:

```
/metrics
```

**Output Includes**:

- Total commands executed
- Success rate percentage
- Top 5 most used commands
- Time period covered

### 7. `ping` - Latency Check

**File**: `/src/commands/utility/ping.ts`

**Purpose**: Checks bot latency and response time.

**Parameters**: None

**Features**:

- Round-trip latency measurement
- Simple health check
- Quick response time verification

**Usage Example**:

```
/ping
```

### 8. `reboot` - Uptime & Reboot Information

**File**: `/src/commands/utility/reboot.ts`

**Purpose**: Displays bot uptime and reboot history.

**Parameters**: None

**Features**:

- Current uptime calculation
- Last reboot timestamp
- Reboot reason tracking
- Version information

**Usage Example**:

```
/reboot
```

## Rate Limiting & Cooldowns

### Configuration

Rate limits are defined in `/src/helper/constants.ts`:

```typescript
export const TIMERS = {
  COMMAND_COOLDOWN_MS: 3000, // 3 seconds between commands
  MOPUP_UPDATE_COOLDOWN_MS: 60000, // 1 minute between mopup updates
  IDEMPOTENCY_WINDOW_MS: 5000, // 5-second idempotency window
  // ... additional timers
};
```

### Enforcement

- **Per-user cooldowns**: Tracked via `cooldowns` Map in command modules
- **Global rate limits**: Applied at event handler level
- **Feedback**: Users receive ephemeral messages when rate-limited

### User Experience

```
User: /healtroop ...
Bot: ⚠️ Please wait 2.3 seconds before using this command again.
```

## Legacy Message Commands

### Configuration

Legacy message-based commands are optional and controlled by:

```typescript
export const ENABLE_LEGACY_MESSAGE_COMMANDS = true; // In constants.ts
```

### Implementation

- **Handler**: `/src/events/messageCreate.ts`
- **Prefix**: Traditional `!` prefix (e.g., `!mopup`)
- **Features**: Same validation and error handling as slash commands
- **Purpose**: Backward compatibility for users accustomed to message commands

## Command Execution Flow

### 1. User Interaction

```
User types "/healtroop units:1000" in Discord
```

### 2. Event Handling

```typescript
// /src/events/interactionCreate.ts
if (interaction.isChatInputCommand()) {
  const command = client.commands.get(interaction.commandName);
  await command.execute(interaction);
}
```

### 3. Command Processing

1. **Input Validation**: Check parameters against validation rules
2. **Rate Limiting**: Verify user isn't exceeding cooldowns
3. **Business Logic**: Execute command-specific calculations
4. **External Data**: Fetch from Google Sheets cache if needed
5. **Formatting**: Prepare user-friendly response

### 4. Response & Tracking

1. **Reply to User**: Send formatted response (ephemeral if appropriate)
2. **Usage Tracking**: Record command execution in SQLite database
3. **Error Handling**: Log any failures for debugging

## Error Handling in Commands

### Standard Pattern

```typescript
export async function execute(interaction) {
  try {
    // Command logic
    await interaction.reply({ content: 'Success!', ephemeral: true });
  } catch (error) {
    // Log the error
    await logError(error, `Command failed: ${interaction.commandName}`);

    // User-friendly error message
    const errorMessage = isTransientNetworkError(error)
      ? 'Temporary network issue. Please try again.'
      : 'An unexpected error occurred.';

    await interaction.reply({
      content: errorMessage,
      ephemeral: true,
    });
  }
}
```

### Common Error Types

1. **Validation Errors**: Invalid input parameters
2. **Network Errors**: Google Sheets API failures
3. **Calculation Errors**: Game logic failures
4. **Rate Limit Errors**: User exceeding cooldowns

## Adding New Commands

### Step-by-Step Process

1. **Choose Category**: `aow/` for game commands, `utility/` for bot utilities
2. **Create File**: `src/commands/[category]/newcommand.ts`
3. **Implement Interface**: Follow `Command` interface structure
4. **Define Schema**: Use `SlashCommandBuilder` for command definition
5. **Implement Logic**: Add business logic in `execute` function
6. **Add Tests**: Create `tests/newcommand.test.ts`
7. **Register**: Command auto-discovered on next bot start
8. **Deploy**: Run `pnpm run deploy` to register with Discord

### Best Practices

- **Descriptive Names**: Use clear, lowercase command names
- **Comprehensive Help**: Include detailed parameter descriptions
- **Input Validation**: Validate all user inputs
- **Error Handling**: Implement proper try-catch blocks
- **Testing**: Include unit tests for new commands
- **Documentation**: Update relevant documentation

## Testing Commands

### Test Structure

```typescript
// tests/gearcheck.test.ts
import { describe, it, expect } from 'vitest';
import { calculateGearStats } from '../src/commands/aow/gearcheck.js';

describe('gearcheck command', () => {
  it('should calculate stats correctly for epic weapon', () => {
    const result = calculateGearStats('epic', 'weapon', 'attack');
    expect(result.attack).toBeGreaterThan(0);
    expect(result.recommendation).toContain('optimize');
  });
});
```

### Mocking Dependencies

- **Discord Interactions**: Mock `ChatInputCommandInteraction`
- **Google Sheets**: Mock sheets client responses
- **Database**: Use in-memory SQLite for testing

## Performance Considerations

### Optimizations

1. **Caching**: Google Sheets data cached with TTL
2. **Batch Operations**: Group similar calculations
3. **Lazy Loading**: Load expensive resources only when needed
4. **Connection Reuse**: Reuse authenticated clients

### Monitoring

- **Execution Time**: Track command processing duration
- **Cache Hit Rate**: Monitor Google Sheets cache effectiveness
- **Error Rates**: Track command failure percentages
- **User Adoption**: Monitor command usage patterns

## Command Deployment

### Registration Process

```bash
# Build and register commands with Discord
pnpm run deploy

# Environment-specific deployment
DOTENV_ENVIRONMENT=production pnpm run deploy
```

### Deployment Notes

1. **Global vs Guild Commands**: Configured via `GUILD_ID` environment variable
2. **Update Propagation**: May take up to 1 hour for global command updates
3. **Version Management**: Command versions tracked via deployment timestamps
4. **Rollback**: Previous command versions remain until explicitly removed
