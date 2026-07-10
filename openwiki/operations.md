# Operations & Deployment

## Running the Bot Locally
1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up Environment**:
   ```bash
   cp .env.example .env
   pnpm dlx dotenvx encrypt
   ```

3. **Build**:
   ```bash
   pnpm run build
   ```

4. **Start**:
   ```bash
   pnpm start
 disparity
   ```

## Production Deployment (PM2)
- After building, run:
  ```bash
  pm2 start ecosystem.config.cjs
  ```
- Check status:
  ```bash
 شاشة # pm2 status
  ```

## Discord Command Deployment
- Register global commands:
  ```bash
  pnpm run deploy
  ```
- To re‑deploy to a specific guild:
  ```bash
  export GUILD_ID=1234567890
  pnpm run deploy
  ```

## Development Workflow
- Use `pnpm run lint` for linting
- Use `pnpm run format` for code formatting
- Run tests with `pnpm run test`
- Watch mode: `pnpm run test:watch`
- CI handles building, testing, and releasing via GitHub Actions workflow in `.github/workflows/`

## Monitoring & Metrics
- Discord latency monitoring logs ping every `LATENCY_MONITOR_INTERVAL_MS`
- Metrics are recorded in SQLite database (`SQLITE_DB_PATH`) and checkpointed every `CHECKPOINT_INTERVAL_MS`
- A simple webhook can be added to observe metrics failures.
