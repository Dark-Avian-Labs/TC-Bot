import { describe, expect, it } from 'vitest';

import { numberWithCommas } from '../src/helper/formatters.js';

describe('numberWithCommas', () => {
  it('formats positive and negative integers', () => {
    expect(numberWithCommas(0)).toBe('0');
    expect(numberWithCommas(999)).toBe('999');
    expect(numberWithCommas(1000)).toBe('1,000');
    expect(numberWithCommas(-1234567)).toBe('-1,234,567');
  });

  it('formats decimal strings without changing fractional precision', () => {
    expect(numberWithCommas('1000000.99')).toBe('1,000,000.99');
    expect(numberWithCommas('1234.56789')).toBe('1,234.56789');
    expect(numberWithCommas('-1234.500')).toBe('-1,234.500');
  });

  it('works with number representations dependency upgrades often affect', () => {
    expect(numberWithCommas(1e6)).toBe('1,000,000');
    expect(numberWithCommas('000123456')).toBe('000,123,456');
  });

  it('does not double-format already comma-formatted input', () => {
    expect(numberWithCommas('1,234,567')).toBe('1,234,567');
  });
});
