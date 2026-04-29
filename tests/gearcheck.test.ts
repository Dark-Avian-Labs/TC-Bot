import { describe, expect, it } from 'vitest';

import { calculateGearStats } from '../src/commands/aow/gearcheck.js';

describe('calculateGearStats', () => {
  it('uses current level to derive base stat consistently', () => {
    const result = calculateGearStats(120, 20);
    expect(result[0]).toBe('40.00');
    expect(result[10]).toBe('80.00');
    expect(result[20]).toBe('120.00');
    expect(result[50]).toBe('240.00');
  });

  it('keeps expected breakpoints and multipliers', () => {
    const result = calculateGearStats(100, 0);
    expect(result[0]).toBe('100.00');
    expect(Object.keys(result).map(Number)).toEqual([0, 10, 13, 20, 30, 40, 50]);
    expect(result[13]).toBe('230.00');
    expect(result[30]).toBe('400.00');
    expect(result[40]).toBe('500.00');
  });

  it('handles decimal input with stable rounding to 2 decimals', () => {
    const result = calculateGearStats(85.5, 10);
    expect(result[0]).toBe('42.75');
    expect(result[13]).toBe('98.32');
    expect(result[50]).toBe('256.50');
  });

  it('remains stable for higher levels than output breakpoints', () => {
    const result = calculateGearStats(600, 50);
    expect(result[0]).toBe('100.00');
    expect(result[10]).toBe('200.00');
    expect(result[50]).toBe('600.00');
  });
});
