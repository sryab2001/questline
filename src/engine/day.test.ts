import { describe, expect, it } from 'vitest';

import { addDays, dayKey, dayRange, daysBetween, weekday } from './day';

describe('dayKey', () => {
  it('uses the local date in the given time zone', () => {
    // 2026-10-20 20:00 UTC is already the 21st in Kolkata (UTC+5:30).
    const instant = new Date('2026-10-20T20:00:00Z');
    expect(dayKey(instant, 'UTC')).toBe('2026-10-20');
    expect(dayKey(instant, 'Asia/Kolkata')).toBe('2026-10-21');
  });

  it('keeps early-morning hours on the previous day before the reset hour', () => {
    // 02:30 local in Kolkata on the 21st.
    const instant = new Date('2026-10-20T21:00:00Z');
    expect(dayKey(instant, 'Asia/Kolkata', 0)).toBe('2026-10-21');
    expect(dayKey(instant, 'Asia/Kolkata', 4)).toBe('2026-10-20');
  });

  it('handles a DST change (London, last Sunday of October)', () => {
    // 2026-10-25 is the day clocks go back in London.
    expect(dayKey(new Date('2026-10-25T00:30:00Z'), 'Europe/London')).toBe('2026-10-25');
    expect(dayKey(new Date('2026-10-24T23:30:00Z'), 'Europe/London')).toBe('2026-10-25');
  });
});

describe('day arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between keys', () => {
    expect(daysBetween('2026-10-01', '2026-10-20')).toBe(19);
    expect(daysBetween('2026-10-20', '2026-10-01')).toBe(-19);
  });

  it('returns weekdays with 0 = Sunday', () => {
    expect(weekday('2026-10-18')).toBe(0);
    expect(weekday('2026-10-20')).toBe(2);
  });

  it('builds inclusive ranges', () => {
    expect(dayRange('2026-10-19', '2026-10-21')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(dayRange('2026-10-21', '2026-10-19')).toEqual([]);
  });
});
