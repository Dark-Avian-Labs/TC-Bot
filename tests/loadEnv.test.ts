import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('loadEnv', () => {
  it('loads ENV_FILE through the dotenvx config export', () => {
    const envFile = path.join('tests', 'loadenv-probe.env');
    fs.writeFileSync(envFile, 'TC_BOT_LOADENV_PROBE=ok\n');

    try {
      const output = execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          "import './src/env/loadEnv.ts'; console.log(process.env.TC_BOT_LOADENV_PROBE ?? '');",
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, ENV_FILE: envFile, NODE_ENV: 'test' },
          encoding: 'utf8',
        },
      );

      expect(output.trim()).toBe('ok');
    } finally {
      fs.rmSync(envFile, { force: true });
    }
  });
});
