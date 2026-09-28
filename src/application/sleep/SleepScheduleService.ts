import {
  addCustomPreparationItem,
  addPreparationGroup,
  completePreparationItem,
  createEmptySleepSchedule,
  deletePreparationGroup,
  deletePreparationItem,
  ensureNightCycle,
  finishPreparation,
  importNativeSleepEvents,
  importNativeWakeResults,
  movePreparationGroup,
  movePreparationItem,
  rebuildWakeSchedule,
  renamePreparationGroup,
  renamePreparationItem,
  reopenPreparationItem,
  setPreparationItemEnabled,
  setSleepFeatureEnabled,
  setNearestWakeTime,
  clearNearestWakeTime,
  setSleepQuietModeEnabled,
  skipNearestWakeOccurrence,
  updateSleepSettings,
  type NightCycle,
  type PreparationSnapshotItemInput,
  type SleepScheduleState,
  type SleepSettingsInput,
  type PreparationCompletionKind,
} from '../../domain/sleep/SleepSchedule';
import { resolveSleepCycleDate } from '../../domain/sleep/NightTime';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { SleepScheduleRepository } from './SleepScheduleRepository';
import {
  UnsupportedWakeAlarmGateway,
  type AlarmSound,
  type WakeAlarmGateway,
  type WakeAlarmPermissionIssue,
  type WakeAlarmSchedule,
  type WakeAlarmStatus,
  type WakeDismissalSetup,
} from './WakeAlarmGateway';

const NATIVE_SCHEDULE_HORIZON_DAYS = 2;

export class SleepScheduleService {
  readonly #repository: SleepScheduleRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #alarmGateway: WakeAlarmGateway;

  public constructor(
    repository: SleepScheduleRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    alarmGateway: WakeAlarmGateway = new UnsupportedWakeAlarmGateway(),
  ) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#alarmGateway = alarmGateway;
  }

  public async getState(): Promise<SleepScheduleState> {
    return (await this.#repository.load()) ?? createEmptySleepSchedule();
  }

  public async saveSettings(input: SleepSettingsInput): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) => {
      const updated = updateSleepSettings(current ?? createEmptySleepSchedule(), input, now);
      return rebuildWakeSchedule(updated, {
        cycleDates: upcomingCycleDates(
          resolveSleepCycleDate(now, updated.settings!.timeZone, updated.settings!.wakeTime),
          NATIVE_SCHEDULE_HORIZON_DAYS,
        ),
        now,
        nextId: () => this.#idGenerator.generate().toString(),
      });
    });
    await this.#reconcileNative(state);
    return state;
  }

  public async ensureNightCycle(
    cycleDate: string,
    preparationItems: readonly PreparationSnapshotItemInput[],
  ): Promise<NightCycle> {
    const createdAt = this.#clock.now();
    let cycle: NightCycle | null = null;
    await this.#repository.update((current) => {
      const result = ensureNightCycle(current ?? createEmptySleepSchedule(), {
        cycleDate,
        preparationItems,
        cycleId: this.#idGenerator.generate().toString(),
        createdAt,
      });
      cycle = result.cycle;
      return result.state;
    });
    if (cycle === null) throw new Error('Ночной цикл не был создан или загружен.');
    return cycle;
  }

  public async openCurrentNight(): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    return this.#repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      const settings = requiredSettings(state);
      return ensureNightCycle(state, {
        cycleDate: resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime),
        cycleId: this.#idGenerator.generate().toString(),
        createdAt: now,
      }).state;
    });
  }

  public async addGroup(title: string): Promise<SleepScheduleState> {
    const id = this.#idGenerator.generate().toString();
    return this.#repository.update((current) =>
      addPreparationGroup(current ?? createEmptySleepSchedule(), { id, title }),
    );
  }

  public async renameGroup(groupId: string, title: string): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      renamePreparationGroup(current ?? createEmptySleepSchedule(), groupId, title),
    );
  }

  public async moveGroup(groupId: string, targetPosition: number): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      movePreparationGroup(current ?? createEmptySleepSchedule(), groupId, targetPosition),
    );
  }

  public async deleteGroup(groupId: string, targetGroupId?: string): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      deletePreparationGroup(current ?? createEmptySleepSchedule(), groupId, targetGroupId),
    );
  }

  public async addCustomItem(groupId: string, title: string): Promise<SleepScheduleState> {
    const id = this.#idGenerator.generate().toString();
    const now = this.#clock.now();
    return this.#repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      return addCustomPreparationItem(state, {
        id,
        groupId,
        title,
        ...(state.settings === null ? {} : { currentCycleDate: currentCycleDate(state, now) }),
      });
    });
  }

  public async renameItem(itemId: string, title: string): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      renamePreparationItem(current ?? createEmptySleepSchedule(), itemId, title),
    );
  }

  public async setItemEnabled(itemId: string, enabled: boolean): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      setPreparationItemEnabled(current ?? createEmptySleepSchedule(), itemId, enabled),
    );
  }

  public async deleteItem(itemId: string): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      deletePreparationItem(current ?? createEmptySleepSchedule(), itemId),
    );
  }

  public async moveItem(
    itemId: string,
    targetGroupId: string,
    targetPosition: number,
  ): Promise<SleepScheduleState> {
    return this.#repository.update((current) =>
      movePreparationItem(current ?? createEmptySleepSchedule(), {
        itemId,
        targetGroupId,
        targetPosition,
      }),
    );
  }

  public async completeItem(itemId: string): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      return completePreparationItem(state, currentCycleDate(state, now), itemId, now);
    });
    await this.#reconcileNative(state);
    return state;
  }

  public async reopenItem(itemId: string): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      return reopenPreparationItem(state, currentCycleDate(state, now), itemId);
    });
    await this.#reconcileNative(state);
    return state;
  }

  public async finish(
    kind: Extract<PreparationCompletionKind, 'WITH_SKIPS' | 'SKIPPED_TODAY'>,
  ): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) => {
      const state = current ?? createEmptySleepSchedule();
      return finishPreparation(state, currentCycleDate(state, now), kind, now);
    });
    await this.#reconcileNative(state);
    return state;
  }

  public async rebuild(cycleDates: readonly string[]): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) =>
      rebuildWakeSchedule(current ?? createEmptySleepSchedule(), {
        cycleDates,
        now,
        nextId: () => this.#idGenerator.generate().toString(),
      }),
    );
    await this.#reconcileNative(state);
    return state;
  }

  public async skipNearestWake(expectedOccurrenceId?: string): Promise<SleepScheduleState> {
    await this.syncAlarm();
    const now = this.#clock.now();
    const exceptionId = this.#idGenerator.generate().toString();
    const state = await this.#repository.update((current) =>
      skipNearestWakeOccurrence(current ?? createEmptySleepSchedule(), {
        now,
        exceptionId,
        ...(expectedOccurrenceId === undefined ? {} : { expectedOccurrenceId }),
      }),
    );
    await this.#reconcileNative(state);
    return state;
  }

  public async setEnabled(enabled: boolean): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) => {
      const updated = setSleepFeatureEnabled(current ?? createEmptySleepSchedule(), enabled, now);
      const settings = requiredSettings(updated);
      return rebuildWakeSchedule(updated, {
        cycleDates: upcomingCycleDates(
          resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime),
          NATIVE_SCHEDULE_HORIZON_DAYS,
        ),
        now,
        nextId: () => this.#idGenerator.generate().toString(),
      });
    });
    await this.#reconcileNative(state);
    return state;
  }

  public async setNearestWakeTime(
    wakeTime: string,
    expectedOccurrenceId?: string,
  ): Promise<SleepScheduleState> {
    await this.syncAlarm();
    return this.#updateWakeOverride((state, now) =>
      setNearestWakeTime(state, wakeTime, now, expectedOccurrenceId),
    );
  }

  public async clearNearestWakeTime(): Promise<SleepScheduleState> {
    await this.syncAlarm();
    return this.#updateWakeOverride(clearNearestWakeTime);
  }

  async #updateWakeOverride(
    update: (state: SleepScheduleState, now: Date) => SleepScheduleState,
  ): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) => {
      const updated = update(current ?? createEmptySleepSchedule(), now);
      const settings = requiredSettings(updated);
      return rebuildWakeSchedule(updated, {
        cycleDates: upcomingCycleDates(
          resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime),
          NATIVE_SCHEDULE_HORIZON_DAYS,
        ),
        now,
        nextId: () => this.#idGenerator.generate().toString(),
      });
    });
    await this.#reconcileNative(state);
    return state;
  }

  public async setQuietModeEnabled(enabled: boolean): Promise<SleepScheduleState> {
    const now = this.#clock.now();
    const state = await this.#repository.update((current) =>
      setSleepQuietModeEnabled(current ?? createEmptySleepSchedule(), enabled, now),
    );
    await this.#reconcileNative(state);
    return state;
  }

  public async syncAlarm(): Promise<{
    readonly state: SleepScheduleState;
    readonly alarm: WakeAlarmStatus;
  }> {
    const now = this.#clock.now();
    const nativeStatus = await this.#alarmGateway.status();
    const state = await this.#repository.update((current) => {
      const loaded = importNativeWakeResults(
        importNativeSleepEvents(current ?? createEmptySleepSchedule(), nativeStatus.sleepEvents),
        nativeStatus.wakeResults,
      );
      if (loaded.settings === null) return loaded;
      return rebuildWakeSchedule(loaded, {
        cycleDates: upcomingCycleDates(
          resolveSleepCycleDate(now, loaded.settings.timeZone, loaded.settings.wakeTime),
          NATIVE_SCHEDULE_HORIZON_DAYS,
        ),
        now,
        nextId: () => this.#idGenerator.generate().toString(),
      });
    });
    return { state, alarm: await this.#reconcileNative(state) };
  }

  public async getAlarmStatus(): Promise<WakeAlarmStatus> {
    return this.#alarmGateway.status();
  }

  public async listAlarmSounds(): Promise<readonly AlarmSound[]> {
    return this.#alarmGateway.listSounds();
  }

  public async scheduleTestAlarm(delaySeconds = 20): Promise<WakeAlarmStatus> {
    const state = await this.getState();
    const sound = state.settings?.alarmSound ?? { uri: null, title: 'Системный сигнал' };
    return this.#alarmGateway.scheduleTest({ sound, delaySeconds });
  }

  public async openAlarmSettings(issue: WakeAlarmPermissionIssue): Promise<void> {
    await this.#alarmGateway.openSettings(issue);
  }

  public async stopAlarm(): Promise<void> {
    await this.#alarmGateway.stop();
  }

  public async getWakeDismissalSetup(): Promise<WakeDismissalSetup> {
    return this.#alarmGateway.dismissalSetup();
  }

  public async regenerateWakeDismissalQr(): Promise<WakeDismissalSetup> {
    return this.#alarmGateway.regenerateDismissalQr();
  }

  public async exportWakeDismissalQr(): Promise<void> {
    await this.#alarmGateway.exportDismissalQr();
  }

  public async saveWakeEmergencyPhrase(phrase: string): Promise<WakeDismissalSetup> {
    return this.#alarmGateway.saveEmergencyPhrase(phrase);
  }

  async #reconcileNative(state: SleepScheduleState): Promise<WakeAlarmStatus> {
    const settings = state.settings;
    if (settings === null) return this.#alarmGateway.status();
    const now = this.#clock.now().getTime();
    const nextOccurrence = state.wakeOccurrences
      .filter(
        (occurrence) => occurrence.status === 'SCHEDULED' && occurrence.scheduledAt.getTime() > now,
      )
      .sort(
        (left, right) =>
          left.scheduledAt.getTime() - right.scheduledAt.getTime() ||
          left.id.localeCompare(right.id),
      )[0];
    const activeCycleDate = currentCycleDate(state, this.#clock.now());
    const activeCycle = state.nightCycles.find(({ cycleDate }) => cycleDate === activeCycleDate);
    const schedule: WakeAlarmSchedule = {
      enabled: settings.enabled,
      settingsVersion: settings.version,
      bedtime: settings.bedtime,
      wakeTime: settings.wakeTime,
      timeZone: settings.timeZone,
      quietModeEnabled: settings.quietModeEnabled,
      currentCycleDate: activeCycleDate,
      repeatReminderSuppressed: activeCycle?.preparationCompletionKind != null,
      sound: settings.alarmSound,
      nextOccurrence:
        settings.enabled && nextOccurrence !== undefined
          ? {
              id: nextOccurrence.id,
              cycleDate: nextOccurrence.cycleDate,
              scheduledAt: nextOccurrence.scheduledAt,
            }
          : null,
    };
    return this.#alarmGateway.reconcile(schedule);
  }
}

function upcomingCycleDates(firstCycleDate: string, days: number): readonly string[] {
  const [year, month, day] = firstCycleDate.split('-').map(Number);
  const start = new Date(Date.UTC(year!, month! - 1, day!));
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

function requiredSettings(state: SleepScheduleState) {
  if (state.settings === null) throw new Error('Настройки сна ещё не заданы.');
  return state.settings;
}

function currentCycleDate(state: SleepScheduleState, now: Date): string {
  const settings = requiredSettings(state);
  return resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime);
}
