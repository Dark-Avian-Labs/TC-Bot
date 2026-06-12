import { describe, it, expect, vi, afterEach } from 'vitest';

import { formatHrDuration } from '../src/helper/hrDuration.js';

describe('formatHrDuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats sub-second durations in milliseconds', () => {
    const start = 0n;
    vi.spyOn(process.hrtime, 'bigint').mockReturnValue(450_000_000n);
    expect(formatHrDuration(start)).toBe('450ms');
  });

  it('formats multi-second durations in seconds', () => {
    const start = 0n;
    vi.spyOn(process.hrtime, 'bigint').mockReturnValue(4_130_902_000n);
    expect(formatHrDuration(start)).toBe('4.1s');
  });

  it('rounds longer second durations without decimals', () => {
    const start = 0n;
    vi.spyOn(process.hrtime, 'bigint').mockReturnValue(21_199_225_000n);
    expect(formatHrDuration(start)).toBe('21s');
  });

  it('formats minute-long durations', () => {
    const start = 0n;
    vi.spyOn(process.hrtime, 'bigint').mockReturnValue(125_000_000_000n);
    expect(formatHrDuration(start)).toBe('2m 5s');
  });

  it('never rolls seconds up to 60 in minute formatting', () => {
    const start = 0n;
    vi.spyOn(process.hrtime, 'bigint').mockReturnValue(119_500_000_000n);
    expect(formatHrDuration(start)).toBe('1m 59s');
  });

  it('omits seconds for exact minute boundaries', () => {
    const start = 0n;
    vi.spyOn(process.hrtime, 'bigint').mockReturnValue(120_000_000_000n);
    expect(formatHrDuration(start)).toBe('2m');
  });
});
