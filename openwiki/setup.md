# Installation & Setup

## Prerequisites

- Node.js version 26 or higher
- pnpm version 11 or higher
- Google Sheets API access
- Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)

## Step-by-Step Setup

### 1. Repository Setup

```bash
git clone https://github.com/ishark5060/tc-bot.git
cd tc-bot
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values:

- `TOKEN` - Your Discord bot token
- `CLIENT_ID` - Your Discord application ID
- `GUILD_ID` - Your Discord server ID (optional for global commands)
- `GOOGLE_SPREADSHEET_ID` - Your Google Spreadsheet ID
- `GOOGLE_SHEET_ID` - Specific worksheet/tab ID

### 4. Optional: Encrypt Environment Variables

For enhanced security, use dotenvx:

```bash
pnpm dlx dotenvx encrypt
```

This creates an encrypted `.env` file and a `.env.keys` file (keep the keys secure!).

### 5. Google Service Account

Place your Google service account credentials as `client_secret.json` in the project root:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@project.iam.gserviceaccount.com",
  ...
}
```

### 6. Build & Deploy

```bash
pnpm run build          # Compile TypeScript
pnpm run deploy         # Register slash commands with Discord
```

### 7. Start the Bot

```bash
pnpm start              # Run in foreground
# OR
pm2 start ecosystem.config.cjs  # Run as background service
```

### 8. Verify Operation

- Check console output for successful startup
- Test `/mopup` command in Discord
- Verify Google Sheets connectivity if applicable

## Environment Variables Reference

| Variable                         | Description                                     | Required                  |
| -------------------------------- | ----------------------------------------------- | ------------------------- |
| `TOKEN`                          | Discord Bot Token                               | Yes                       |
| `CLIENT_ID`                      | Discord Application Client ID                   | Yes                       |
| `GUILD_ID`                       | Discord Server ID (for guild-specific commands) | No                        |
| `OCR_SPACEKEY`                   | OCR.space API Key                               | No                        |
| `CHANNEL_ID1`                    | Mopup Status Channel ID                         | No                        |
| `CHANNEL_ID2`                    | Mopup Timer Channel ID                          | No                        |
| `ENABLE_LEGACY_MESSAGE_COMMANDS` | Enable legacy "!tcmu" commands                  | No                        |
| `MESSAGE_COMMAND_CHANNEL_ID`     | Channel ID for legacy message commands          | No                        |
| `GOOGLE_SPREADSHEET_ID`          | Google Spreadsheet ID                           | Yes (for Sheets features) |
| `GOOGLE_SHEET_ID`                | Specific worksheet/tab ID                       | Yes (for Sheets features) |
| `GOOGLE_SHEET_CACHE`             | Cache TTL for spreadsheet data (ms)             | No                        |
| `SQLITE_DB_PATH`                 | Path to SQLite metrics database                 | No                        |
| `CHECKPOINT_INTERVAL_MS`         | WAL checkpoint interval (ms)                    | No                        |
| `METRICS_RETENTION_DAYS`         | Metrics retention in days (0 = keep forever)    | No                        |
| `METRICS_FLUSH_INTERVAL_MS`      | Metrics queue flush interval (ms)               | No                        |
| `METRICS_FLUSH_BATCH_SIZE`       | Batch size for metrics flush                    | No                        |
| `METRICS_MAX_QUEUE_LENGTH`       | Max queue length before dropping events         | No                        |
| `METRICS_MAX_RETRIES`            | Max retries for failed metrics flush            | No                        |
| `DEBUG`                          | Enable verbose debug logging                    | No                        |

## Development Setup

### Code Quality Tools

- Linting: `pnpm run lint`
- Formatting: `pnpm run format`
- Type checking: `pnpm run typecheck`
- Full validation: `pnpm run validate`

### Testing

- Run tests: `pnpm run test`
- Watch mode: `pnpm run test:watch`
- Coverage: `pnpm run test:coverage`

### Environment Management

- View current encrypted values: `pnpm dlx dotenvx decrypt`
- Re-encrypt after changes: `pnpm dlx dotenvx encrypt`
