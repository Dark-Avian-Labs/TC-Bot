import { createRequire } from 'node:module';

const MIN_NODE_MAJOR = 26;
const MIN_PNPM_MAJOR = 11;

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`\n[preflight] ${message}\n`);
  process.exit(1);
}

function parseMajor(version) {
  const match = /^v?(\d+)/.exec(String(version));
  return match ? Number(match[1]) : 0;
}

const nodeMajor = parseMajor(process.version);
if (nodeMajor < MIN_NODE_MAJOR) {
  fail(
    `Node ${MIN_NODE_MAJOR}+ required (current: ${process.version}). Use nvm install ${MIN_NODE_MAJOR} and rebuild native modules.`,
  );
}

try {
  const pkg = require('../package.json');
  const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
  const pnpmMatch = /^pnpm@(\d+)/.exec(manager);
  if (pnpmMatch) {
    const requiredMajor = Number(pnpmMatch[1]);
    if (requiredMajor < MIN_PNPM_MAJOR) {
      fail(`pnpm ${MIN_PNPM_MAJOR}+ required per packageManager (${manager}).`);
    }
  }
} catch {
  // ignore
}

try {
  const mod = require('better-sqlite3');
  const Database = mod.default ?? mod;
  const db = new Database(':memory:');
  db.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const hint = message.includes('NODE_MODULE_VERSION') ? ' Run: pnpm rebuild better-sqlite3' : '';
  fail(`SQLite native module unavailable:${hint}\n  ${message}`);
}

console.log(`[preflight] OK — Node ${process.version}`);
