import { describe, expect, it } from 'vitest';

import { calculateKills } from '../src/commands/aow/its.js';
import { TroopRow } from '../src/types/index.js';
import { createMockRow } from './helpers.js';

describe('calculateKills', () => {
  const mockRows: TroopRow[] = [
    createMockRow({
      troopTier: '12',
      troopUnits: '100',
      troopName: 'Test Infantry',
      troopType: 'Infantry',
      isNPC: 'N',
    }),
    createMockRow({
      troopTier: '12',
      troopUnits: '50',
      troopName: 'Test Walker',
      troopType: 'Walker',
      isNPC: 'N',
    }),
    createMockRow({
      troopTier: '10',
      troopUnits: '100',
      troopName: 'Lower Tier Infantry',
      troopType: 'Infantry',
      isNPC: 'N',
    }),
    createMockRow({
      troopTier: '12',
      troopUnits: '100',
      troopName: 'NPC Unit',
      troopType: 'Infantry',
      isNPC: 'Y',
    }),
  ];

  it('filters by target tier and NPC flag', () => {
    const kills = calculateKills(mockRows, 12, 30, 500000, 0);

    const names = kills.map((k) => k.name);
    expect(names).toContain('Test Infantry');
    expect(names).toContain('Test Walker');
    expect(names).not.toContain('Lower Tier Infantry');
    expect(names).not.toContain('NPC Unit');
  });

  it('calculates kill count from coefficient and rounds down', () => {
    const kills = calculateKills(mockRows, 12, 30, 500000, 0);

    const infantry = kills.find((k) => k.name === 'Test Infantry');
    expect(infantry?.count).toBe(750);
  });

  it('applies TDR reduction correctly', () => {
    const kills = calculateKills(mockRows, 12, 30, 500000, 20);

    const infantry = kills.find((k) => k.name === 'Test Infantry');
    expect(infantry?.count).toBe(600);
  });

  it('sorts results by kill count descending', () => {
    const kills = calculateKills(mockRows, 12, 30, 500000, 0);

    expect(kills[0].name).toBe('Test Walker');
    expect(kills[0].count).toBe(1500);
    expect(kills[1].name).toBe('Test Infantry');
    expect(kills[1].count).toBe(750);
  });

  it('returns empty array when no troops match', () => {
    const kills = calculateKills(mockRows, 99, 30, 500000, 0);

    expect(kills).toEqual([]);
  });

  it('returns empty when coefficient does not produce at least 1 kill', () => {
    const kills = calculateKills(mockRows, 12, 1, 1, 0);

    expect(kills.length).toBe(0);
  });

  it('abbreviates troop types correctly', () => {
    const kills = calculateKills(mockRows, 12, 30, 500000, 0);

    const infantry = kills.find((k) => k.name === 'Test Infantry');
    const walker = kills.find((k) => k.name === 'Test Walker');

    expect(infantry?.type).toBe('INF');
    expect(walker?.type).toBe('WLK');
  });

  it('skips rows with invalid units or missing names', () => {
    const rowsWithInvalid = [
      ...mockRows,
      createMockRow({
        troopTier: '12',
        troopUnits: '',
        troopName: 'Invalid Unit',
        troopType: 'Infantry',
        isNPC: 'N',
      }),
      createMockRow({
        troopTier: '12',
        troopUnits: '50',
        troopName: '',
        troopType: 'Walker',
        isNPC: 'N',
      }),
    ];

    const kills = calculateKills(rowsWithInvalid, 12, 30, 500000, 0);

    const names = kills.map((k) => k.name);
    expect(names).not.toContain('Invalid Unit');
    expect(names).not.toContain('');
  });

  it('produces no kills when called with 100% TDR', () => {
    const kills = calculateKills(mockRows, 12, 30, 500000, 100);

    expect(kills.length).toBe(0);
  });
});
