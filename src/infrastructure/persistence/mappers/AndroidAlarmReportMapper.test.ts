import { describe, expect, it } from 'vitest';
import { createEmptySleepSchedule, updateSleepSettings } from '../../../domain/sleep/SleepSchedule';
import { SleepScheduleRecordMapper } from './SleepScheduleRecordMapper';

const now = new Date('2026-10-10T12:00:00Z');
const original = updateSleepSettings(
  createEmptySleepSchedule(),
  { bedtime: '22:30', wakeTime: '07:15', timeZone: 'Asia/Chita', enabled: true },
  now,
);
const report = {
  source: 'ANDROID' as const,
  checkedAt: now,
  scheduleKey: 'key',
  outcome: 'CONFIRMED' as const,
  acknowledgedSettingsVersion: 1,
  nextOccurrenceId: 'wake-1',
  nextScheduledAt: new Date('2026-10-10T22:15:00Z'),
};
const wireReport = {
  ...report,
  checkedAt: report.checkedAt.toISOString(),
  nextScheduledAt: report.nextScheduledAt.toISOString(),
};
describe('optional Android alarm report record', () => {
  it('round-trips dates and leaves old records unchanged', () => {
    const state = { ...original, androidAlarmReport: report };
    const record = SleepScheduleRecordMapper.toRecord(state);
    expect(record.androidAlarmReport?.checkedAt).toBe('2026-10-10T12:00:00.000Z');
    expect(SleepScheduleRecordMapper.fromRecord(record)).toEqual(state);
    expect(
      SleepScheduleRecordMapper.fromRecord(SleepScheduleRecordMapper.toRecord(original)),
    ).toEqual(original);
  });
  it.each([
    null,
    'unexpected',
    { ...wireReport, source: 'WINDOWS' },
    { ...wireReport, outcome: 'FAKE' },
    { ...wireReport, checkedAt: 'invalid' },
    { ...wireReport, nextScheduledAt: 'invalid' },
    { ...wireReport, acknowledgedSettingsVersion: null },
    { ...wireReport, acknowledgedSettingsVersion: -1 },
    { ...wireReport, nextOccurrenceId: null },
    { ...wireReport, scheduleKey: '' },
    { ...wireReport, nextScheduledAt: null },
  ])('ignores malformed optional telemetry without losing the schedule %j', (invalid) => {
    const record = SleepScheduleRecordMapper.toRecord(original);
    expect(
      SleepScheduleRecordMapper.fromRecord({ ...record, androidAlarmReport: invalid }),
    ).toEqual(original);
  });
  it('projects only the agreed report fields', () => {
    const record = SleepScheduleRecordMapper.toRecord({ ...original, androidAlarmReport: report });
    const restored = SleepScheduleRecordMapper.fromRecord({
      ...record,
      androidAlarmReport: { ...record.androidAlarmReport, privateMessage: 'private' },
    });
    expect(restored.androidAlarmReport).toEqual(report);
  });
});
