import { describe, it, expect } from 'vitest';
import { fmtCompact, fmtPct, fmtMoney, fmtDate } from './mediaKit';

describe('media kit formatting', () => {
  it('compacts follower counts the way a brand reads them', () => {
    expect(fmtCompact(999)).toBe('999');
    expect(fmtCompact(9500)).toBe('9.5K');
    expect(fmtCompact(30500)).toBe('30.5K');
    expect(fmtCompact(45000)).toBe('45K');
    expect(fmtCompact(146119)).toBe('146K');
    expect(fmtCompact(1_250_000)).toBe('1.3M');
    expect(fmtCompact(0)).toBe('0');
  });

  it('signs growth and drops the noise', () => {
    expect(fmtPct(1.52)).toBe('+1.5%');
    expect(fmtPct(-0.34)).toBe('-0.3%');
    expect(fmtPct(0)).toBe('0%');
    expect(fmtPct(0.04)).toBe('0%');
  });

  it('prints money from integer cents, never floats', () => {
    expect(fmtMoney(50000)).toBe('$500');
    expect(fmtMoney(125050)).toBe('$1,250.50');
    expect(fmtMoney(25000, 'USD', 'from')).toBe('from $250');
    expect(fmtMoney(null)).toBe('Inquire');
  });

  it('dates a stat without shifting the day', () => {
    expect(fmtDate('2026-07-04')).toBe('Jul 4, 2026');
    expect(fmtDate('2026-09-06T17:20:36.111Z')).toBe('Sep 6, 2026');
  });
});
