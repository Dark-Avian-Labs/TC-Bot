import { describe, it, expect } from 'vitest';

import { computeProactiveRefreshDelayMs } from '../src/helper/sheetsCache.js';

describe('computeProactiveRefreshDelayMs', () => {
  it('refreshes before expiry using a proportional lead time', () => {
    expect(computeProactiveRefreshDelayMs(300_000)).toBe(255_000);
  });

  it('uses at least the minimum refresh delay for short TTLs', () => {
    expect(computeProactiveRefreshDelayMs(60_000)).toBe(30_000);
  });

  it('caps the lead time for long TTLs', () => {
    expect(computeProactiveRefreshDelayMs(3_600_000)).toBe(3_480_000);
  });
});
