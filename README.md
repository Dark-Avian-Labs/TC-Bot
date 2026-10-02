<p align="center">
  <img src="https://raw.githubusercontent.com/Dark-Avian-Labs/.github/refs/heads/main/banner.png" alt="Dark Avian Labs">
</p>

# TC-Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
![Node](https://img.shields.io/badge/Node-%3E%3D26-339933?logo=node.js&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white&style=flat-square)
[![Cursor](https://img.shields.io/badge/Cursor-IDE-141414?logo=cursor&logoColor=white&style=flat-square)](https://cursor.com)

TC-Bot sits in [Diplomacy of War](https://discord.gg/YMAhCNjkgp) and answers the Ark of War questions that used to mean opening the theorycrafters' sheet. Healing, gear, damage, iTS. You type a slash command in Discord.

It is for officers and players on that server who want the sheet's numbers without scrolling a tab at 2am.

## Features

**Slash commands for the usual checks.** `/healtroop` prices a stack of injured troops. `/gearcheck` projects a stat at a higher upgrade. `/its` checks an iTS setup. `/damage` runs a hit with the bonuses you pass in. `/help` lists what the bot will take.

**Mopup, on a clock.** `/mopup` says when the next window opens. When the channels are configured, the bot renames them as the window moves and posts into the announcement channel when it opens. Timing uses the clock of the machine the bot runs on.

**The sheet the officers already keep.** Troop stats and costs are read from that Google Sheet. Change the sheet, and the next command sees it after the cache refreshes. The bot keeps a local metrics database for its own `/metrics` command. Troop numbers still come from the sheet.

## What you should know

There is no website to sign in to. The bot only answers inside the Discord server it was invited to.

Slash commands are registered by a separate deploy step. Restarting the bot does not publish a new command. Mopup timing follows the host timezone, so a box set to the wrong zone will announce the window early or late.

## Self-hosting

Node 26 or newer, and pnpm 12. Copy `.env.example` to `.env.development`. `pnpm start` leaves `NODE_ENV` unset, so it reads that file.

```
pnpm install
pnpm run build
pnpm start
```

Put `client_secret.json` in the project root. Boot reads it for the Google Sheet even before a command asks for troop numbers. `GOOGLE_SHEET_ID` is the numeric tab id from the sheet URL, not the tab's name.

`pnpm run deploy` always loads `.env.production`, registers slash commands globally, and then clears guild commands for `GUILD_ID`. Run it after a command change. A production process needs `NODE_ENV=production` and that same env file, plus the Discord token and the sheet ids the example lists.

## License

MIT
