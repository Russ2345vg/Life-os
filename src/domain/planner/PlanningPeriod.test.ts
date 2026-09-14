import { describe, expect, it } from 'vitest';
import {
  automaticPeriod,
  thirtyDayPeriod,
  nextSevenDays,
  focusWarning,
  membershipId,
} from './PlanningPeriod';

describe('planning periods', () => {
  it('uses stable calendar years and quarters', () => {
    expect(automaticPeriod('year', '2026-09-14')).toMatchObject({
      id: 'year:2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(automaticPeriod('quarter', '2026-09-30')).toEqual(
      automaticPeriod('quarter', '2026-07-01'),
    );
    expect(automaticPeriod('quarter', '2026-10-01').id).toBe('quarter:2026-Q4');
  });
  it('distinguishes Monday-Sunday from a rolling seven days across year boundaries', () => {
    expect(automaticPeriod('week', '2027-01-01')).toMatchObject({
      id: 'week:2026-12-28',
      startDate: '2026-12-28',
      endDate: '2027-01-03',
    });
    expect(nextSevenDays('2027-01-01')).toEqual({ startDate: '2027-01-01', endDate: '2027-01-07' });
  });
  it('fixes thirty days inclusively including leap February', () => {
    expect(thirtyDayPeriod('2026-09-14')).toMatchObject({
      startDate: '2026-09-14',
      endDate: '2026-10-13',
    });
    expect(thirtyDayPeriod('2028-02-01').endDate).toBe('2028-03-01');
  });
  it('has unlimited participation and warnings rather than focus errors', () => {
    expect(focusWarning('week', 5)).toBeTruthy();
    expect(focusWarning('week', 4)).toBeNull();
    expect(focusWarning('year', 6)).toBeTruthy();
    expect(membershipId('week:2026-09-14', 'goal', 'a:b')).not.toBe(
      membershipId('week:2026-09-14', 'action', 'a:b'),
    );
  });
});
