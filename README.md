# Discord Bot for Ark of War

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
![Static Badge](https://img.shields.io/badge/Node.js-25-red?style=for-the-badge)
![Static Badge](https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge)
![NPM Version](https://img.shields.io/npm/v/discord.js?style=for-the-badge&label=Discord.js&color=blue)
![NPM Version](https://img.shields.io/npm/v/%40dotenvx%2Fdotenvx?style=for-the-badge&label=.envx&color=green)
![NPM Version](https://img.shields.io/npm/v/%40googleapis%2Fsheets?style=for-the-badge&label=%40googleapis%2Fsheets&color=orange)

TC-Bot is a pretty simple Discord bot based on the `Discord.js` framework and is built around the game [Ark of War](https://www.7piratesgames.com/ark.html).
It provides the users of the [Diplomacy of War Discord Server](https://discord.gg/YMAhCNjkgp) several commands to calculate stats in the game.

## About

The bot is the brainchild of [Krylar](https://github.com/Krylar) and was "hacked together" (his words) by him by following early discord.js tutorials.
In the years it was rewritten several times by both him and me after I have taken over the project.
Outside of the game itself, the bot is pretty useless, and even in the game it has outlived most of its usefulness.

## History

The initial bot was created before I knew how to properly use GitHub (and version control in general) and after I had taken over the project I used a new repo for each iteration. The previous one was set to private and only the current version was visible to the public.

At some point I consolidated all repositories into one, keeping the original history intact, but scrapping all the history from the other version-specific repos.
I mainly did this because I still wasn't exactly sure what to do in such situation and handling the hundreds of merge conflicts seemed too much of a hassle (I now know there would have been easier ways, but oh well).

Starting from Version 5 the bot was fully rewritten using agentic coding (Claude 4 Sonnet and GPT-5 at that point) as helpers and from Version 7 it was again fully rewritten, this time in TypeScript. Since then the functionality was kept mostly the same with added tests and validations. Some packages were swapped out for better or newer alternatives, but since the bot is doing its job perfectly fine and no further functions are needed/wanted by its users it will most likely stay this way.

TypeScript is used in strict mode by now, tests are automated via Vitest and the CI/CD is realized with GitHub Actions runners. Dependencies are mostly updated automatically via Dependabot, but I also keep them up to date manually.

## Requirements

- Node.js 25+
- pnpm 10+

## Setup

1. Install Node and pnpm:

Use whatever installation method you prefer for your system.

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy and edit env file:

   ```bash
   cp .env.example .env
   nano .env
   ```

4. Build and run:

   ```bash
   pnpm run build
   pnpm start
   ```

or start it with PM2 ecosystem file for better control

```bash
pm2 start ecosystem.config.cjs
```

5. Deploy Slash commands

```bash
pnpm run deploy
```

## dotenvx and encrypted env files

This project supports `dotenvx` for local `.env` loading now, and can optionally use encrypted env artifacts.

- use `pnpm dlx dotenvx encrypt` to encrypt your local `.env` file and make it safe to commit
- this will also create a `.env.keys` file with your private encryption key, which should NEVER be committed.
- if you need to change env variables, use `pnpm dlx dotenvx decrypt` to use the key in `.env.keys` to restore the `.env` file
- re-encrypt afterwards (it will reuse the same keys) and commit the changes
- keep the private key in GitHub secrets like you would your SSH_KEY

Suggested secret naming when vault is enabled:

- `DOTENV_PRIVATE_KEY_DEVELOPMENT`
- `DOTENV_PRIVATE_KEY_PRODUCTION`

Use one key per environment to reduce blast radius.

## Google service account credentials

For Google Sheets access, provide `client_secret.json` in project root.

```json
{
  "type": "service_account",
  "project_id": "your_project_id",
  "private_key_id": "your_private_key_id",
  "private_key": "-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----\n",
  "client_email": "your@client.email",
  "client_id": "123456",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

Unless you have a copy of the Theorycrafters Google Sheet and valid API credentials, Healing/ITS features will not work.

## Environment Variables

| Variable                         | Description                                         |
| -------------------------------- | --------------------------------------------------- |
| `TOKEN`                          | Discord Bot Token                                   |
| `CLIENT_ID`                      | Discord Application Client ID                       |
| `GUILD_ID`                       | Discord Server ID                                   |
| `OCR_SPACEKEY`                   | OCR.space API Key                                   |
| `CHANNEL_ID1`                    | Mopup Status Channel ID                             |
| `CHANNEL_ID2`                    | Mopup Timer Channel ID                              |
| `ENABLE_LEGACY_MESSAGE_COMMANDS` | If the bot should react to "!tcmu" commands         |
| `MESSAGE_COMMAND_CHANNEL_ID`     | Channel ID for legacy message commands              |
| `GOOGLE_SPREADSHEET_ID`          | Theorycrafters Google Spreadsheet ID                |
| `GOOGLE_SHEET_ID`                | Theorycrafters Google Spreadsheet Tab ID            |
| `GOOGLE_SHEET_CACHE`             | Time to cache the spreadsheet for                   |
| `SQLITE_DB_PATH`                 | Path to the SQLite metrics database                 |
| `CHECKPOINT_INTERVAL_MS`         | How often to checkpoint the metrics DB              |
| `METRICS_RETENTION_DAYS`         | Rolling retention in days (`0` = keep indefinitely) |
| `METRICS_FLUSH_INTERVAL_MS`      | Flush interval for the metrics queue                |
| `METRICS_FLUSH_BATCH_SIZE`       | Batch size when flushing metrics                    |
| `METRICS_MAX_QUEUE_LENGTH`       | Max queued metric events before dropping            |
| `METRICS_MAX_RETRIES`            | Max retries when flushing metrics fails             |
| `DEBUG`                          | Enable verbose debug logging (`true` / `false`)     |

## Scripts

| Script              | Description                            |
| ------------------- | -------------------------------------- |
| `pnpm run build`    | Compile TypeScript to `dist/`.         |
| `pnpm start`        | Run production server from `dist/`.    |
| `pnpm run deploy`   | Register slash commands with Discord.  |
| `pnpm run lint`     | Run OxLint.                            |
| `pnpm run format`   | Run Oxfmt formatting.                  |
| `pnpm run validate` | Check format, lint, typesafety, tests. |

## License

The TC-Bot project is licensed under the [MIT License](LICENSE).

Discord.js framework by [Discord.js](https://github.com/discordjs/discord.js).
