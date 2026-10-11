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
  it('queues independent choices and retries a failed put without duplicates', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-11T01:00:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    const input = { cycleDate: '2026-10-10', feedback: { sleepQuality: 'GOOD' as const } };
    observations.failNextSave = true;
    await expect(service.setMorningFeedback(input)).rejects.toThrow('save failed');
    await Promise.all([
      service.setMorningFeedback(input),
      service.setMorningFeedback({ cycleDate: input.cycleDate, feedback: { energy: 'TIRED' } }),
    ]);
    expect(observations.values.size).toBe(1);
    expect(observations.values.get(input.cycleDate)).toMatchObject({
      id: 'sleep-observation:2026-10-10',
      timeZone: 'Asia/Chita',
      wentToBedAt: null,
      wokeAt: null,
      confirmedAt: null,
      morningFeedback: { sleepQuality: 'GOOD', energy: 'TIRED' },
    });
    await service.clearMorningFeedback(input.cycleDate);
    expect(observations.values.get(input.cycleDate)).not.toHaveProperty('morningFeedback');
    expect(await service.clearMorningFeedback('2026-10-09')).toBeNull();
    expect(observations.values.size).toBe(1);
  });
  it('retains feedback through alarm prefill and confirmed times', async () => {
    const observations = new InMemorySleepObservationRepository();
    const schedules = new InMemorySleepScheduleRepository(schedule());
    const clock = new FakeClock(new Date('2026-10-04T01:00:00Z'));
    const service = new SleepObservationService(observations, schedules, clock);
    const rated = await service.setMorningFeedback({
      cycleDate: '2026-10-03',
      feedback: { energy: 'ENERGETIC' },
      timeZone: 'Asia/Chita',
    });
    const alarm = await service.reconcileWakeResult(schedule(), wakeResult('QR'));
    expect(alarm?.morningFeedback).toEqual(rated.morningFeedback);
    const confirmed = await service.confirm({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:00:00Z'),
      wokeAt: alarm!.wokeAt!,
    });
    schedules.state = {
      ...schedule(),
      settings: { ...schedule().settings!, timeZone: 'America/Los_Angeles' },
    };
    clock.setTime(new Date('2026-10-04T01:10:00Z'));
    const updated = await service.setMorningFeedback({
      cycleDate: '2026-10-03',
      feedback: { sleepQuality: 'OK' },
    });
    expect(updated).toMatchObject({
      timeZone: 'Asia/Chita',
      createdAt: rated.createdAt,
      confirmedAt: confirmed.confirmedAt,
      wentToBedAt: confirmed.wentToBedAt,
      wokeAt: confirmed.wokeAt,
      morningFeedback: { sleepQuality: 'OK', energy: 'ENERGETIC' },
    });
  });
  it('rejects a future selected wake date without persisting an observation', async () => {
    const observations = new InMemorySleepObservationRepository();
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      new FakeClock(new Date('2026-10-10T20:00:00Z')),
    );
    await expect(
      service.setMorningFeedback({
        cycleDate: '2026-10-10',
        timeZone: 'America/Los_Angeles',
        feedback: { energy: 'TIRED' },
      }),
    ).rejects.toThrow('будущ');
    expect(observations.values.size).toBe(0);
  });
  it('retains the timezone of an entered observation after synced schedule settings change', async () => {
    const original = schedule();
    const schedules = new InMemorySleepScheduleRepository({
      ...original,
      settings: { ...original.settings!, timeZone: 'Pacific/Kiritimati' },
    });
    const service = new SleepObservationService(
      new InMemorySleepObservationRepository(),
      schedules,
      new FakeClock(new Date('2026-10-04T05:00:00Z')),
    );
    const saved = await service.confirm({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:30:00Z'),
      wokeAt: new Date('2026-10-04T00:45:00Z'),
      timeZone: 'Asia/Chita',
    });
    expect(saved.timeZone).toBe('Asia/Chita');
    expect(saved.wentToBedAt?.toISOString()).toBe('2026-10-03T14:30:00.000Z');
  });
  it('previews the bed draft at the same clock instant and rejects a zero-length wake', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-03T14:30:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    await service.markBedtimeNow();
    expect((await service.quickEntryContext()).wakeCycleDate).toBe('2026-10-03');
    await expect(service.markWakeNow()).rejects.toThrow('раньше');
    expect(observations.values.size).toBe(1);
  });
  it('records an after-midnight bedtime and late manual wake in the same draft', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-03T16:00:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    const bed = await service.markBedtimeNow();
    expect(bed.cycleDate).toBe('2026-10-03');
    clock.setTime(new Date('2026-10-04T02:00:00Z'));
    const wake = await service.markWakeNow();
    expect(wake).toMatchObject({
      cycleDate: bed.cycleDate,
      wentToBedAt: bed.wentToBedAt,
      wokeAt: clock.now(),
      wakeSource: 'MANUAL',
      confirmedAt: null,
    });
    clock.setTime(new Date('2026-10-04T02:10:00Z'));
    expect(await service.markWakeNow()).toEqual(wake);
    expect(observations.values.size).toBe(1);
  });

  it('uses the past night without bedtime and never overwrites a confirmed night', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-04T02:00:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    expect(await service.markWakeNow()).toMatchObject({
      cycleDate: '2026-10-03',
      wentToBedAt: null,
    });
    const confirmed = await service.confirm({
      cycleDate: '2026-10-03',
      wentToBedAt: new Date('2026-10-03T14:00:00Z'),
      wokeAt: clock.now(),
    });
    clock.setTime(new Date('2026-10-04T03:00:00Z'));
    expect(await service.markWakeNow()).toEqual(confirmed);
  });

  it('replaces an alarm hint with explicit manual wake and ignores a stale bed draft', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-03T14:30:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    await service.markBedtimeNow();
    clock.setTime(new Date('2026-10-04T01:00:00Z'));
    const hint = await service.reconcileWakeResult(schedule(), wakeResult('QR'));
    expect(hint?.wentToBedAt?.toISOString()).toBe('2026-10-03T14:30:00.000Z');
    expect(hint?.wakeSource).toBe('ALARM_QR');
    expect(await service.markWakeNow()).toMatchObject({
      wakeSource: 'MANUAL',
      wokeAt: clock.now(),
    });
    clock.setTime(new Date('2026-10-07T02:00:00Z'));
    expect(await service.markWakeNow()).toMatchObject({
      cycleDate: '2026-10-06',
      wentToBedAt: null,
    });
  });

  it('serializes a simultaneous alarm import and manual wake without losing the bedtime', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-03T14:30:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    await service.markBedtimeNow();
    clock.setTime(new Date('2026-10-04T01:00:00Z'));
    await Promise.all([
      service.reconcileWakeResult(schedule(), wakeResult('QR')),
      service.markWakeNow(),
    ]);
    const final = observations.values.get('2026-10-03');
    expect(final).toMatchObject({
      wentToBedAt: new Date('2026-10-03T14:30:00Z'),
      wokeAt: clock.now(),
      wakeSource: 'MANUAL',
    });
    expect(await service.reconcileWakeResult(schedule(), wakeResult('QR'))).toEqual(final);
  });

  it('allows retry after a failed write and serializes confirm against another mark', async () => {
    const observations = new InMemorySleepObservationRepository();
    const clock = new FakeClock(new Date('2026-10-03T14:30:00Z'));
    const service = new SleepObservationService(
      observations,
      new InMemorySleepScheduleRepository(schedule()),
      clock,
    );
    observations.failNextSave = true;
    await expect(service.markBedtimeNow()).rejects.toThrow('save failed');
    await service.markBedtimeNow();
    clock.setTime(new Date('2026-10-04T01:00:00Z'));
    const [confirmed] = await Promise.all([
      service.confirm({
        cycleDate: '2026-10-03',
        wentToBedAt: new Date('2026-10-03T14:30:00Z'),
        wokeAt: new Date('2026-10-04T00:50:00Z'),
      }),
      service.markWakeNow(),
    ]);
    expect(observations.values.get('2026-10-03')).toEqual(confirmed);
  });
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
  public failNextSave = false;
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
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('save failed');
    }
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
