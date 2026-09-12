<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# TC-Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/ishark5060/tc-bot/ci.yml?style=flat-square&label=CI)](https://github.com/ishark5060/tc-bot/actions/workflows/ci.yml)
[![PR](https://img.shields.io/github/actions/workflow/status/ishark5060/tc-bot/pr.yml?style=flat-square&label=PR)](https://github.com/ishark5060/tc-bot/actions/workflows/pr.yml)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

Discord bot for [Ark of War](https://www.7piratesgames.com/ark.html), built for [Diplomacy of War](https://discord.gg/YMAhCNjkgp). Slash commands for healing, gear, and iTS. Mopup windows get channel updates. Troop numbers come from the theorycrafters' Google Sheet.

Source lives at [ishark5060/tc-bot](https://github.com/ishark5060/tc-bot), not the org.

## Gotchas

- Boot **hard-requires** `client_secret.json` in the project root plus `GOOGLE_SPREADSHEET_ID` / `GOOGLE_SHEET_ID`, even for commands that never touch the sheet. Tab identity is the numeric sheet id, not the tab name. Without a copy of the Theorycrafters sheet, healing/iTS will not work.
- Slash commands are not registered at boot. Run `pnpm run deploy` after a command change. It always uses `.env.production` and registers globally, then clears guild commands for `GUILD_ID`.
- `pnpm start` does **not** set `NODE_ENV=production`; PM2 does (`ecosystem.config.cjs`). Runtime loads `dist/commands/**/*.js`; deploy discovers `src/**/*.ts`. Keep both paths working.
- Mopup timing uses the **host timezone**. Even day: 26h–34h offsets; odd day: 8h–24h. Legacy `!tcmu` only when `ENABLE_LEGACY_MESSAGE_COMMANDS` is on and the channel matches `MESSAGE_COMMAND_CHANNEL_ID`.
- After changing Node versions on Windows, `pnpm rebuild better-sqlite3`.

## License

MIT
