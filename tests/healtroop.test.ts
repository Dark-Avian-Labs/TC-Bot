import { describe, expect, it } from 'vitest';

import {
  getModifier,
  getOptimalModifier,
  calculateResourceCost,
  calculateHealingCosts,
} from '../src/commands/aow/healtroop.js';
import { createMockRow } from './helpers.js';

describe('getModifier', () => {
  it('matches threshold boundaries exactly', () => {
    expect(getModifier(3500)).toBe(0.22);
    expect(getModifier(3501)).toBe(0.25);
    expect(getModifier(1500)).toBe(0.19);
    expect(getModifier(1501)).toBe(0.22);
    expect(getModifier(900)).toBe(0.17);
    expect(getModifier(901)).toBe(0.19);
    expect(getModifier(500)).toBe(0.15);
    expect(getModifier(501)).toBe(0.17);
    expect(getModifier(200)).toBe(0.1);
    expect(getModifier(201)).toBe(0.15);
  });
});

describe('getOptimalModifier', () => {
  it('returns next reachable discount tier', () => {
    expect(getOptimalModifier(3501)).toEqual({ modifier: 0.25, units: -1 });
    expect(getOptimalModifier(1000)).toEqual({ modifier: 0.22, units: 1501 });
    expect(getOptimalModifier(500)).toEqual({ modifier: 0.17, units: 501 });
    expect(getOptimalModifier(50)).toEqual({ modifier: 0.15, units: 201 });
  });
});

describe('calculateResourceCost', () => {
  it('parses comma-formatted values and rounds up partial costs', () => {
    expect(calculateResourceCost('1,000,000', 1, 0.1)).toBe(100000);
    expect(calculateResourceCost('101', 1, 0.17)).toBe(18);
  });

  it('returns null for missing or invalid numeric data', () => {
    expect(calculateResourceCost(null, 10, 0.25)).toBeNull();
    expect(calculateResourceCost(undefined, 10, 0.25)).toBeNull();
    expect(calculateResourceCost('', 10, 0.25)).toBeNull();
    expect(calculateResourceCost('abc', 10, 0.25)).toBeNull();
  });

  it('keeps parseInt semantics for decimal-like strings', () => {
    expect(calculateResourceCost('100.9', 10, 0.25)).toBe(250);
  });
});

describe('calculateHealingCosts', () => {
  it('returns null for invalid troop unit definitions', () => {
    const row = createMockRow({ troopUnits: '0' });
    expect(calculateHealingCosts(row, 10)).toBeNull();

    const row2 = createMockRow({ troopUnits: '-1' });
    expect(calculateHealingCosts(row2, 10)).toBeNull();

    const row3 = createMockRow({ troopUnits: 'invalid' });
    expect(calculateHealingCosts(row3, 10)).toBeNull();
  });

  it('calculates total units and active modifier', () => {
    const row = createMockRow({
      troopUnits: '100',
      foodCost: '1000',
    });

    const costs = calculateHealingCosts(row, 50);

    expect(costs?.totalUnits).toBe(5000);
    expect(costs?.modifier).toBe(0.25);
  });

  it('computes resource costs for current and optimal tiers', () => {
    const row = createMockRow({
      troopUnits: '100',
      foodCost: '1000',
      partsCost: '500',
    });

    const costs = calculateHealingCosts(row, 50);

    expect(costs?.resources['foodCost']?.current).toBe(12500);
    expect(costs?.resources['foodCost']?.optimal).toBe(7500);
    expect(costs?.resources['partsCost']?.current).toBe(6250);
  });

  it('computes special costs in optimal chunks and enforces minimum 1 per chunk', () => {
    const row = createMockRow({
      troopUnits: '100',
      smCost: '1',
    });
    const costs = calculateHealingCosts(row, 50);
    expect(costs?.special['smCost']).toEqual({ current: 13, optimal: 25 });
  });

  it('computes other stats: parseInt on cell values (truncates decimals), then ceil on v × troopAmount', () => {
    const row = createMockRow({
      troopUnits: '100',
      foodCost: '1',
      powerLost: '500.9',
      kePoints: '100',
    });

    const costs = calculateHealingCosts(row, 10);

    expect(costs?.other['powerLost']).toBe(5000);
    expect(costs?.other['kePoints']).toBe(1000);
  });

  it('sets hasData only when at least one cost bucket is present', () => {
    const row = createMockRow({
      troopUnits: '100',
      foodCost: '1000',
    });

    const costs = calculateHealingCosts(row, 10);
    expect(costs?.hasData).toBe(true);
  });

  it('returns null when no cost data exists', () => {
    const row = createMockRow({
      troopUnits: '100',
    });

    const costs = calculateHealingCosts(row, 10);
    expect(costs).toBeNull();
  });

  it('computes optimal quantity from per-troop unit size', () => {
    const row = createMockRow({
      troopUnits: '500',
      foodCost: '1000',
    });

    const costs = calculateHealingCosts(row, 10);

    expect(costs?.optQty).toBe(1);
  });
});
