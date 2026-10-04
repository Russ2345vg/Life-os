import { describe, expect, it } from 'vitest';
import type { SleepObservation } from '../../domain/sleep/SleepObservation';
import {
  createEmptySleepSchedule,
  type SleepScheduleState,
  type WakeResult,
} from '../../domain/sleep/SleepSchedule';
import { FakeClock } from '../../test/helpers/Fakes';
import type {
  SleepObservationPeriod,
  SleepObservationRepository,
} from './SleepObservationRepository';
import type { SleepScheduleRepository, SleepScheduleUpdate } from './SleepScheduleRepository';
import { SleepObservationService } from './SleepObservationService';

describe('SleepObservationService', () => {
  it('creates one editable draft from a late QR dismissal and keeps its original cycle', async () => {
    const observations = new InMemorySleepObservationRepository();
    const schedules = new InMemorySleepScheduleRepository(schedule());
    const service = new SleepObservationService(
      observations,
      schedules,
      new FakeClock(new Date('2026-10-04T01:00:00.000Z')),
    );
    const result = wakeResult('QR');

    const first = await service.reconcileWakeResult(schedule(), result);
    const repeated = await service.reconcileWakeResult(schedule(), result);

    expect(first).toMatchObject({
      id: 'sleep-observation:2026-10-03',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wakeOccurrenceId: 'wake-1',
      wakeSource: 'ALARM_QR',
      wentToBedAt: null,
      confirmedAt: null,
    });
    expect(first?.wokeAt?.toISOString()).toBe('2026-10-04T00:40:00.000Z');
    expect(repeated).toEqual(first);
    expect(observations.saved).toHaveLength(1);
  });

  it.each(['QR', 'EMERGENCY'] as const)('maps a trustworthy %s dismissal', async (kind) => {
    const observations = new InMemorySleepObservationRepository();
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      new FakeClock(new Date('2026-10-04T01:00:00.000Z')),
    );

    await expect(service.reconcileWakeResult(schedule(), wakeResult(kind))).resolves.toMatchObject({
      wakeSource: kind === 'QR' ? 'ALARM_QR' : 'ALARM_EMERGENCY',
    });
  });

  it('ignores delivery without a trustworthy dismissal', async () => {
    const observations = new InMemorySleepObservationRepository();
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      new FakeClock(new Date('2026-10-04T01:00:00.000Z')),
    );

    await expect(
      service.reconcileWakeResult(schedule(), wakeResult('NO_RESULT')),
    ).resolves.toBeNull();
    expect(observations.saved).toHaveLength(0);
  });

  it('confirms a manual no-alarm night from schedule context', async () => {
    const observations = new InMemorySleepObservationRepository();
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      new FakeClock(new Date('2026-10-04T01:05:00.000Z')),
    );

    const confirmed = await service.confirm({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:35:00.000Z'),
      wokeAt: new Date('2026-10-04T00:45:00.000Z'),
    });

    expect(confirmed).toMatchObject({
      nightCycleId: 'night-1',
      wakeSource: 'MANUAL',
      wakeOccurrenceId: null,
      timeZone: 'Asia/Chita',
    });
    expect(confirmed.confirmedAt?.toISOString()).toBe('2026-10-04T01:05:00.000Z');
  });

  it('does not overwrite a confirmed observation during repeated alarm reconciliation', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-04T01:00:00.000Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    await service.reconcileWakeResult(schedule(), wakeResult('QR'));
    const confirmed = await service.confirm({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:20:00.000Z'),
      wokeAt: new Date('2026-10-04T01:00:00.000Z'),
    });

    const reconciled = await service.reconcileWakeResult(schedule(), wakeResult('QR'));

    expect(reconciled).toEqual(confirmed);
    expect(observations.saved).toHaveLength(2);
  });

  it('revises a confirmed night and exposes only an incomplete observation as pending', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-04T01:00:00.000Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    await service.reconcileWakeResult(schedule(), wakeResult('QR'));
    await expect(service.pending('2026-10-03')).resolves.toMatchObject({ confirmedAt: null });
    await service.confirm({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:20:00.000Z'),
      wokeAt: new Date('2026-10-04T00:40:00.000Z'),
    });
    await expect(service.pending('2026-10-03')).resolves.toBeNull();
    clock.setTime(new Date('2026-10-04T02:00:00.000Z'));

    const revised = await service.revise({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:50:00.000Z'),
      wokeAt: new Date('2026-10-04T01:20:00.000Z'),
    });

    expect(revised.wakeSource).toBe('MANUAL');
    await expect(service.history('2026-10-01', '2026-10-04')).resolves.toEqual([revised]);
  });
});

class InMemorySleepObservationRepository implements SleepObservationRepository {
  readonly values = new Map<string, SleepObservation>();
  readonly saved: SleepObservation[] = [];

  public async getByCycleDate(cycleDate: string): Promise<SleepObservation | null> {
    return this.values.get(cycleDate) ?? null;
  }
  public async list(period: SleepObservationPeriod): Promise<readonly SleepObservation[]> {
    return [...this.values.values()]
      .filter(({ cycleDate }) => cycleDate >= period.from && cycleDate <= period.to)
      .sort((left, right) => right.cycleDate.localeCompare(left.cycleDate));
  }
  public async save(observation: SleepObservation): Promise<void> {
    this.values.set(observation.cycleDate, observation);
    this.saved.push(observation);
  }
  public subscribe(): () => void {
    return () => undefined;
  }
}

class InMemorySleepScheduleRepository implements SleepScheduleRepository {
  public constructor(public state: SleepScheduleState | null) {}
  public async load(): Promise<SleepScheduleState | null> {
    return this.state;
  }
  public async save(state: SleepScheduleState): Promise<void> {
    this.state = state;
  }
  public async update(transform: SleepScheduleUpdate): Promise<SleepScheduleState> {
    this.state = transform(this.state);
    return this.state;
  }
}

function schedule(): SleepScheduleState {
  return {
    ...createEmptySleepSchedule(),
    settings: {
      version: 1,
      bedtime: '22:30',
      wakeTime: '08:00',
      timeZone: 'Asia/Chita',
      enabled: true,
      quietModeEnabled: false,
      alarmSound: { uri: null, title: 'Системный сигнал' },
      wakeOverride: null,
      updatedAt: new Date('2026-10-03T12:00:00.000Z'),
    },
    nightCycles: [
      {
        id: 'night-1',
        cycleDate: '2026-10-03',
        plannedSleepAt: new Date('2026-10-03T14:30:00.000Z'),
        plannedWakeAt: new Date('2026-10-04T00:00:00.000Z'),
        preparationItems: [],
        preparationCompletionKind: null,
        preparationCompletedAt: null,
        createdAt: new Date('2026-10-03T12:00:00.000Z'),
      },
    ],
    wakeOccurrences: [
      {
        id: 'wake-1',
        cycleDate: '2026-10-03',
        scheduledAt: new Date('2026-10-04T00:00:00.000Z'),
        status: 'DELIVERED',
        createdAt: new Date('2026-10-03T12:00:00.000Z'),
        updatedAt: new Date('2026-10-04T00:40:00.000Z'),
      },
    ],
  };
}

function wakeResult(kind: WakeResult['kind']): WakeResult {
  return {
    id: 'result-1',
    occurrenceId: 'wake-1',
    cycleDate: '2026-10-03',
    kind,
    recordedAt: new Date('2026-10-04T00:40:00.000Z'),
    emergencyReason: kind === 'EMERGENCY' ? 'Недомогание' : null,
    emergencyComment: kind === 'EMERGENCY' ? 'Личный комментарий' : null,
    waterCompletedAt: null,
  };
}
