import { Colors } from 'discord.js';
import { describe, it, expect } from 'vitest';

import { calculateMopupTiming, getMopupWindow, determineMopupStatus, formatTime } from '../src/helper/mopup.js';

describe('formatTime', () => {
  it('formats milliseconds to HH:MM:SS', () => {
    expect(formatTime(0)).toBe('00:00:00');
    expect(formatTime(1000)).toBe('00:00:01');
    expect(formatTime(60000)).toBe('00:01:00');
    expect(formatTime(3600000)).toBe('01:00:00');
    expect(formatTime(3661000)).toBe('01:01:01');
  });

  it('handles negative values (uses absolute)', () => {
    expect(formatTime(-1000)).toBe('00:00:01');
    expect(formatTime(-3600000)).toBe('01:00:00');
  });

  it('formats multi-hour durations', () => {
    expect(formatTime(8 * 3600000)).toBe('08:00:00');
    expect(formatTime(16 * 3600000)).toBe('16:00:00');
  });

  it('wraps durations above 24h like Date.toISOString does', () => {
    expect(formatTime(25 * 3600000)).toBe('01:00:00');
  });
});

describe('getMopupWindow', () => {
  it('returns correct window for even days', () => {
    const window = getMopupWindow(0);
    const hourInMs = 60 * 60 * 1000;

    expect(window.startTime).toBe(26 * hourInMs);
    expect(window.endTime).toBe(34 * hourInMs);
  });

  it('returns correct window for odd days', () => {
    const window = getMopupWindow(1);
    const dayInMs = 24 * 60 * 60 * 1000;
    const hourInMs = 60 * 60 * 1000;

    expect(window.startTime).toBe(dayInMs + 8 * hourInMs);
    expect(window.endTime).toBe(dayInMs + 24 * hourInMs);
  });

  it('alternates between even and odd day windows', () => {
    const window0 = getMopupWindow(0);
    const window1 = getMopupWindow(1);
    const window2 = getMopupWindow(2);

    expect(window2.endTime - window2.startTime).toBe(window0.endTime - window0.startTime);
    expect(window1.endTime - window1.startTime).toBe(16 * 60 * 60 * 1000);
  });
});

describe('determineMopupStatus', () => {
  const currentTime = 1700000000000;

  it('returns ACTIVE when mopup is ongoing', () => {
    const result = determineMopupStatus(-1000, 3600000, currentTime);
    expect(result.status).toBe('ACTIVE');
    expect(result.color).toBe(Colors.Green);
    expect(result.timestamp).toBe(Math.floor((currentTime + 3600000) / 1000));
  });

  it('returns INACTIVE when mopup has not started', () => {
    const result = determineMopupStatus(3600000, 7200000, currentTime);
    expect(result.status).toBe('INACTIVE');
    expect(result.color).toBe(Colors.Red);
    expect(result.timestamp).toBe(Math.floor((currentTime + 3600000) / 1000));
  });

  it('returns INACTIVE when mopup has ended', () => {
    const result = determineMopupStatus(-7200000, -3600000, currentTime);
    expect(result.status).toBe('INACTIVE');
    expect(result.color).toBe(Colors.Red);
    const nextStartDelta = -3600000 + 24 * 60 * 60 * 1000;
    expect(result.timestamp).toBe(Math.floor((currentTime + nextStartDelta) / 1000));
  });

  it('treats exact start and exact end as inactive boundaries', () => {
    const atStart = determineMopupStatus(0, 3600000, currentTime);
    expect(atStart.status).toBe('INACTIVE');

    const atEnd = determineMopupStatus(-3600000, 0, currentTime);
    expect(atEnd.status).toBe('INACTIVE');
  });
});

describe('calculateMopupTiming', () => {
  it('returns valid MopupInfo structure', () => {
    const result = calculateMopupTiming();

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('color');
    expect(result).toHaveProperty('time');
    expect(result).toHaveProperty('timestamp');

    expect(['ACTIVE', 'INACTIVE']).toContain(result.status);
    expect(typeof result.color).toBe('number');
    expect(result.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(typeof result.timestamp).toBe('number');
  });

  it('returns consistent color for status', () => {
    const result = calculateMopupTiming();

    expect(result.color).toBe(result.status === 'ACTIVE' ? Colors.Green : Colors.Red);
  });

  it('returns a future timestamp', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = calculateMopupTiming();
    expect(result.timestamp).toBeGreaterThanOrEqual(nowSeconds);
  });
});
