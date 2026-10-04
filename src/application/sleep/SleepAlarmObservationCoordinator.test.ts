import { describe, expect, it } from 'vitest';
import {
  createEmptySleepSchedule,
  type SleepScheduleState,
} from '../../domain/sleep/SleepSchedule';
import { unavailableWakeAlarmStatus, type WakeAlarmStatus } from './WakeAlarmGateway';
import { SleepAlarmObservationCoordinator } from './SleepAlarmObservationCoordinator';

describe('SleepAlarmObservationCoordinator', () => {
  it('returns the alarm sync result after reconciling every imported wake result', async () => {
    const state = scheduleWithResults();
    const alarm = alarmStatus();
    const seen: string[] = [];
    const coordinator = new SleepAlarmObservationCoordinator(
      { syncAlarm: async () => ({ state, alarm }) },
      {
        reconcileWakeResult: async (_state, result) => {
          seen.push(result.id);
          return null;
        },
      },
    );

    await expect(coordinator.sync()).resolves.toEqual({ state, alarm });
    expect(seen).toEqual(['trusted']);
  });

  it('retries observation reconciliation after storage failure without re-importing a different result', async () => {
    const state = scheduleWithResults();
    const alarm = alarmStatus();
    let attempts = 0;
    const seen: string[] = [];
    const coordinator = new SleepAlarmObservationCoordinator(
      { syncAlarm: async () => ({ state, alarm }) },
      {
        reconcileWakeResult: async (_state, result) => {
          if (result.kind === 'NO_RESULT') return null;
          attempts += 1;
          seen.push(result.id);
          if (attempts === 1) throw new Error('storage unavailable');
          return null;
        },
      },
    );

    await expect(coordinator.sync()).rejects.toThrow('storage unavailable');
    await expect(coordinator.sync()).resolves.toEqual({ state, alarm });
    expect(seen).toEqual(['trusted', 'trusted']);
  });
});

function scheduleWithResults(): SleepScheduleState {
  return {
    ...createEmptySleepSchedule(),
    wakeResults: [
      {
        id: 'no-result',
        occurrenceId: 'wake-1',
        cycleDate: '2026-10-03',
        kind: 'NO_RESULT',
        recordedAt: new Date('2026-10-04T00:00:00.000Z'),
        emergencyReason: null,
        emergencyComment: null,
        waterCompletedAt: null,
      },
      {
        id: 'trusted',
        occurrenceId: 'wake-1',
        cycleDate: '2026-10-03',
        kind: 'QR',
        recordedAt: new Date('2026-10-04T00:01:00.000Z'),
        emergencyReason: null,
        emergencyComment: null,
        waterCompletedAt: null,
      },
    ],
  };
}

function alarmStatus(): WakeAlarmStatus {
  return unavailableWakeAlarmStatus();
}
