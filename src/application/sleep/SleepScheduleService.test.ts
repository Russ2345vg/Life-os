import { describe, expect, it } from 'vitest';
import { WAKE_OCCURRENCE_STATUS, type SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { SleepScheduleRepository, SleepScheduleUpdate } from './SleepScheduleRepository';
import { SleepScheduleService } from './SleepScheduleService';
import type {
  AlarmSound,
  WakeAlarmGateway,
  WakeAlarmSchedule,
  WakeAlarmStatus,
  WakeDismissalSetup,
} from './WakeAlarmGateway';

describe('SleepScheduleService', () => {
  it('re-enabling the alarm restores future occurrences and native scheduling', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00Z'));
    const gateway = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('enabled'),
      gateway,
    );
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await service.setEnabled(false);
    await service.setEnabled(true);
    expect(gateway.reconciliations.at(-1)?.nextOccurrence?.scheduledAt.toISOString()).toBe(
      '2026-09-20T22:00:00.000Z',
    );
  });
  it('persists a one-time wake across reopening and reconciles the exact shifted timestamp', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00Z'));
    const gateway = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('once'),
      gateway,
    );
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await service.setNearestWakeTime('09:00');
    expect(gateway.reconciliations.at(-1)?.nextOccurrence?.scheduledAt.toISOString()).toBe(
      '2026-09-21T00:00:00.000Z',
    );
    expect(gateway.reconciliations.at(-1)?.wakeTime).toBe('07:00');
    clock.setTime(new Date('2026-09-20T23:00:00Z'));
    const reopened = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('reload'),
      gateway,
    );
    await reopened.syncAlarm();
    expect(gateway.reconciliations.at(-1)?.nextOccurrence?.scheduledAt.toISOString()).toBe(
      '2026-09-21T00:00:00.000Z',
    );
    clock.setTime(new Date('2026-09-21T00:01:00Z'));
    await reopened.syncAlarm();
    expect(gateway.reconciliations.at(-1)?.nextOccurrence?.scheduledAt.toISOString()).toBe(
      '2026-09-21T22:00:00.000Z',
    );
  });
  it('persists settings and reopens one stable night cycle', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const service = new SleepScheduleService(repository, clock, new FakeIdGenerator('sleep'));
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });

    const first = await service.ensureNightCycle('2026-09-20', [
      {
        id: 'prepare-water',
        groupId: 'environment',
        groupTitle: 'Среда',
        title: 'Поставить воду',
        position: 0,
        status: 'PENDING',
      },
    ]);
    clock.setTime(new Date('2026-09-20T16:30:00.000Z'));
    const reopened = await service.ensureNightCycle('2026-09-20', []);

    expect(reopened).toEqual(first);
    expect(repository.state?.nightCycles).toHaveLength(1);
    expect(repository.saveCount).toBe(2);
  });

  it('rebuilds idempotently and skips only the nearest persisted wake', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const service = new SleepScheduleService(repository, clock, new FakeIdGenerator('sleep'));
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });

    await service.rebuild(['2026-09-20', '2026-09-21']);
    await service.rebuild(['2026-09-20', '2026-09-21']);
    const skipped = await service.skipNearestWake();

    expect(skipped.wakeOccurrences.map(({ status }) => status)).toEqual([
      WAKE_OCCURRENCE_STATUS.skipped,
      WAKE_OCCURRENCE_STATUS.scheduled,
    ]);
    expect(skipped.alarmExceptions).toHaveLength(1);
  });

  it('persists the reversible feature switch', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const service = new SleepScheduleService(repository, clock, new FakeIdGenerator('sleep'));
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await service.rebuild(['2026-09-20']);

    const disabled = await service.setEnabled(false);

    expect(disabled.settings?.enabled).toBe(false);
    expect(disabled.wakeOccurrences[0]?.status).toBe(WAKE_OCCURRENCE_STATUS.cancelled);
    await expect(service.getState()).resolves.toEqual(disabled);
  });

  it('opens the current night from the catalog and immediately persists item completion', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T20:30:00.000Z'));
    const service = new SleepScheduleService(repository, clock, new FakeIdGenerator('sleep'));
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });

    const opened = await service.openCurrentNight();
    expect(opened.nightCycles[0]).toMatchObject({ cycleDate: '2026-09-20' });
    await service.completeItem('base-room-air');

    const reopened = new SleepScheduleService(repository, clock, new FakeIdGenerator('reopen'));
    expect((await reopened.openCurrentNight()).nightCycles[0]?.preparationItems[0]?.status).toBe(
      'DONE',
    );
  });

  it('adds a custom item to the current unfinished night and future nights without resetting completed items', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const service = new SleepScheduleService(repository, clock, new FakeIdGenerator('sleep'));
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await service.openCurrentNight();
    await service.completeItem('base-room-air');

    await service.addCustomItem('personal', 'Подготовить сумку');
    const state = await service.getState();

    expect(state.preparationItems.at(-1)).toMatchObject({
      title: 'Подготовить сумку',
      kind: 'CUSTOM',
    });
    expect(state.nightCycles[0]?.preparationItems).toHaveLength(5);
    expect(
      state.nightCycles[0]?.preparationItems.find(({ id }) => id === 'base-room-air')?.status,
    ).toBe('DONE');
    expect(state.nightCycles[0]?.preparationItems.at(-1)).toMatchObject({
      title: 'Подготовить сумку',
      groupId: 'personal',
      groupTitle: 'Личное',
      status: 'PENDING',
    });
    const reopened = new SleepScheduleService(repository, clock, new FakeIdGenerator('reopen'));
    expect((await reopened.openCurrentNight()).nightCycles[0]?.preparationItems).toEqual(
      state.nightCycles[0]?.preparationItems,
    );
    clock.setTime(new Date('2026-09-21T12:00:00.000Z'));
    const tomorrow = await reopened.openCurrentNight();
    expect(tomorrow.nightCycles[1]?.preparationItems.at(-1)).toMatchObject({
      title: 'Подготовить сумку',
      status: 'PENDING',
    });
  });

  it('leaves past unfinished nights and the completed current night unchanged when adding an item', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-19T12:00:00.000Z'));
    const service = new SleepScheduleService(repository, clock, new FakeIdGenerator('sleep'));
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await service.openCurrentNight();
    clock.setTime(new Date('2026-09-20T12:00:00.000Z'));
    await service.openCurrentNight();
    const before = await service.finish('WITH_SKIPS');
    const after = await service.addCustomItem('personal', 'Подготовить документы');
    expect(after.nightCycles).toEqual(before.nightCycles);
    expect(after.preparationItems.at(-1)?.title).toBe('Подготовить документы');
    clock.setTime(new Date('2026-09-21T12:00:00.000Z'));
    const next = await service.openCurrentNight();
    expect(next.nightCycles[2]?.preparationItems.at(-1)?.title).toBe('Подготовить документы');
  });

  it('reconciles the next concrete wake occurrence after settings are saved', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const alarm = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('sleep'),
      alarm,
    );

    const saved = await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
      quietModeEnabled: true,
      alarmSound: { uri: null, title: 'Системный сигнал' },
    });

    expect(
      saved.wakeOccurrences.filter(({ status }) => status === 'SCHEDULED').length,
    ).toBeGreaterThan(1);
    expect(alarm.reconciliations).toHaveLength(1);
    expect(alarm.reconciliations[0]).toMatchObject({
      enabled: true,
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      quietModeEnabled: true,
      currentCycleDate: '2026-09-20',
      repeatReminderSuppressed: false,
      sound: { uri: null, title: 'Системный сигнал' },
      nextOccurrence: { cycleDate: '2026-09-20' },
    });
  });

  it('cancels the skipped occurrence and reconciles the following day without disabling the series', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const alarm = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('sleep'),
      alarm,
    );
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });

    const skipped = await service.skipNearestWake();

    expect(skipped.wakeOccurrences[0]?.status).toBe(WAKE_OCCURRENCE_STATUS.skipped);
    expect(alarm.reconciliations.at(-1)).toMatchObject({
      enabled: true,
      nextOccurrence: { cycleDate: '2026-09-21' },
    });
  });

  it('reconciles an explicit native cancellation when the schedule is disabled', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const alarm = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('sleep'),
      alarm,
    );
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });

    await service.setEnabled(false);

    expect(alarm.reconciliations.at(-1)).toMatchObject({
      enabled: false,
      nextOccurrence: null,
    });
  });

  it('reconciles preparation completion so only the repeat reminder is suppressed', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const alarm = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('sleep'),
      alarm,
    );
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    await service.openCurrentNight();

    await service.finish('SKIPPED_TODAY');

    expect(alarm.reconciliations.at(-1)).toMatchObject({
      enabled: true,
      currentCycleDate: '2026-09-20',
      repeatReminderSuppressed: true,
      nextOccurrence: { cycleDate: '2026-09-20' },
    });
  });

  it('imports native events and wake results before returning a synchronized state', async () => {
    const repository = new InMemorySleepScheduleRepository();
    const clock = new FakeClock(new Date('2026-09-20T12:00:00.000Z'));
    const alarm = new FakeWakeAlarmGateway();
    const service = new SleepScheduleService(
      repository,
      clock,
      new FakeIdGenerator('sleep'),
      alarm,
    );
    await service.saveSettings({
      bedtime: '22:00',
      wakeTime: '07:00',
      timeZone: 'Asia/Chita',
      enabled: true,
    });
    const occurrence = repository.state!.wakeOccurrences[0]!;
    alarm.nativeStatus = {
      ...readyStatus(alarm.reconciliations.at(-1)),
      sleepEvents: [
        {
          id: 'REMINDER_60:2026-09-20',
          cycleDate: '2026-09-20',
          kind: 'REMINDER_60',
          occurredAt: new Date('2026-09-20T11:00:00.000Z'),
        },
      ],
      wakeResults: [
        {
          id: `wake:${occurrence.id}`,
          occurrenceId: occurrence.id,
          cycleDate: occurrence.cycleDate,
          kind: 'QR',
          recordedAt: new Date('2026-09-20T22:01:00.000Z'),
          emergencyReason: null,
          emergencyComment: null,
          waterCompletedAt: null,
        },
      ],
    };

    const synchronized = await service.syncAlarm();

    expect(synchronized.state.sleepEvents).toHaveLength(1);
    expect(synchronized.state.wakeResults).toHaveLength(1);
    expect(synchronized.state.wakeOccurrences[0]?.status).toBe(WAKE_OCCURRENCE_STATUS.delivered);
  });
});

class FakeWakeAlarmGateway implements WakeAlarmGateway {
  public readonly reconciliations: WakeAlarmSchedule[] = [];
  public nativeStatus: WakeAlarmStatus | null = null;

  public async reconcile(schedule: WakeAlarmSchedule): Promise<WakeAlarmStatus> {
    this.reconciliations.push(schedule);
    return readyStatus(schedule);
  }

  public async status(): Promise<WakeAlarmStatus> {
    return this.nativeStatus ?? readyStatus(this.reconciliations.at(-1));
  }

  public async listSounds(): Promise<readonly AlarmSound[]> {
    return [{ uri: null, title: 'Системный сигнал' }];
  }

  public async scheduleTest(): Promise<WakeAlarmStatus> {
    return this.status();
  }

  public async openSettings(): Promise<void> {}

  public async stop(): Promise<void> {}
  public async exportDismissalQr(): Promise<void> {}

  public async dismissalSetup(): Promise<WakeDismissalSetup> {
    return unavailableDismissalSetup();
  }

  public async regenerateDismissalQr(): Promise<WakeDismissalSetup> {
    return unavailableDismissalSetup();
  }

  public async saveEmergencyPhrase(): Promise<WakeDismissalSetup> {
    return unavailableDismissalSetup();
  }
}

function unavailableDismissalSetup(): WakeDismissalSetup {
  return {
    supported: false,
    qrConfigured: false,
    emergencyPhraseConfigured: false,
    qrSavedTo: null,
    lastWaterCompletedAt: null,
  };
}

function readyStatus(schedule?: WakeAlarmSchedule): WakeAlarmStatus {
  return {
    supported: true,
    state: schedule?.nextOccurrence === null ? 'READY' : 'SCHEDULED',
    exactAlarmGranted: true,
    notificationsGranted: true,
    fullScreenGranted: true,
    notificationPolicyAccessGranted: true,
    issues: [],
    nextOccurrenceId: schedule?.nextOccurrence?.id ?? null,
    nextScheduledAt: schedule?.nextOccurrence?.scheduledAt ?? null,
    acknowledgedSettingsVersion: schedule?.settingsVersion ?? null,
    lastDeliveredAt: null,
    quietModeState: 'READY',
    nextReminderAt: null,
    sleepEvents: [],
    wakeResults: [],
    message: null,
  };
}

class InMemorySleepScheduleRepository implements SleepScheduleRepository {
  public state: SleepScheduleState | null = null;
  public saveCount = 0;

  public async load(): Promise<SleepScheduleState | null> {
    return this.state;
  }

  public async save(state: SleepScheduleState): Promise<void> {
    this.state = state;
    this.saveCount += 1;
  }

  public async update(transform: SleepScheduleUpdate): Promise<SleepScheduleState> {
    const next = transform(this.state);
    if (next !== this.state) {
      this.state = next;
      this.saveCount += 1;
    }
    return next;
  }
}
