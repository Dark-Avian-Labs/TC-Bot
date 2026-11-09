import { describe, expect, it } from 'vitest';

import { waitForSentinelExit } from '../src/sentinelAgent.js';

describe('waitForSentinelExit', () => {
  it('returns when the report settles before the deadline', async () => {
    const started = Date.now();
    await waitForSentinelExit(Promise.resolve(), 5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('returns when the deadline wins', async () => {
    const started = Date.now();
    await waitForSentinelExit(new Promise(() => {}), 30);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(elapsed).toBeLessThan(1_000);
  }, 1_000);
});
