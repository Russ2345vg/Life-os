import { calculateNightWindow } from './NightTime';

export const SLEEP_SCHEDULE_ID = 'sleep-schedule';

export const PREPARATION_SNAPSHOT_STATUS = {
  pending: 'PENDING',
  done: 'DONE',
  skipped: 'SKIPPED',
} as const;
export type PreparationSnapshotStatus =
  (typeof PREPARATION_SNAPSHOT_STATUS)[keyof typeof PREPARATION_SNAPSHOT_STATUS];

export const PREPARATION_ITEM_KIND = {
  base: 'BASE',
  custom: 'CUSTOM',
} as const;
export type PreparationItemKind =
  (typeof PREPARATION_ITEM_KIND)[keyof typeof PREPARATION_ITEM_KIND];

export const PREPARATION_COMPLETION_KIND = {
  allDone: 'ALL_DONE',
  withSkips: 'WITH_SKIPS',
  skippedToday: 'SKIPPED_TODAY',
} as const;
export type PreparationCompletionKind =
  (typeof PREPARATION_COMPLETION_KIND)[keyof typeof PREPARATION_COMPLETION_KIND];

export const WAKE_OCCURRENCE_STATUS = {
  scheduled: 'SCHEDULED',
  cancelled: 'CANCELLED',
  delivered: 'DELIVERED',
  skipped: 'SKIPPED',
} as const;
export type WakeOccurrenceStatus =
  (typeof WAKE_OCCURRENCE_STATUS)[keyof typeof WAKE_OCCURRENCE_STATUS];

export const SLEEP_EVENT_KIND = {
  reminder60: 'REMINDER_60',
  reminder15: 'REMINDER_15',
  bedtime: 'BEDTIME',
  quietStarted: 'QUIET_STARTED',
  quietEnded: 'QUIET_ENDED',
} as const;
export type SleepEventKind = (typeof SLEEP_EVENT_KIND)[keyof typeof SLEEP_EVENT_KIND];

export const WAKE_RESULT_KIND = {
  qr: 'QR',
  emergency: 'EMERGENCY',
  noResult: 'NO_RESULT',
} as const;
export type WakeResultKind = (typeof WAKE_RESULT_KIND)[keyof typeof WAKE_RESULT_KIND];

export interface SleepAlarmSound {
  readonly uri: string | null;
  readonly title: string;
}

export const DEFAULT_SLEEP_ALARM_SOUND: SleepAlarmSound = {
  uri: null,
  title: 'Системный сигнал',
};

export interface SleepSettings {
  readonly bedtime: string;
  readonly wakeTime: string;
  readonly timeZone: string;
  readonly enabled: boolean;
  readonly quietModeEnabled: boolean;
  readonly alarmSound: SleepAlarmSound;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface SleepSettingsInput {
  readonly bedtime: string;
  readonly wakeTime: string;
  readonly timeZone: string;
  readonly enabled: boolean;
  readonly quietModeEnabled?: boolean;
  readonly alarmSound?: SleepAlarmSound;
}

export interface PreparationSnapshotItemInput {
  readonly id: string;
  readonly groupId: string;
  readonly groupTitle: string;
  readonly title: string;
  readonly position: number;
  readonly status: PreparationSnapshotStatus;
}

export type PreparationSnapshotItem = PreparationSnapshotItemInput;

export interface SleepPreparationGroup {
  readonly id: string;
  readonly title: string;
  readonly position: number;
}

export interface SleepPreparationItem {
  readonly id: string;
  readonly groupId: string;
  readonly title: string;
  readonly position: number;
  readonly kind: PreparationItemKind;
  readonly enabled: boolean;
}

export interface NightCycle {
  readonly id: string;
  readonly cycleDate: string;
  readonly plannedSleepAt: Date;
  readonly plannedWakeAt: Date;
  readonly preparationItems: readonly PreparationSnapshotItem[];
  readonly preparationCompletionKind: PreparationCompletionKind | null;
  readonly preparationCompletedAt: Date | null;
  readonly createdAt: Date;
}

export interface WakeOccurrence {
  readonly id: string;
  readonly cycleDate: string;
  readonly scheduledAt: Date;
  readonly status: WakeOccurrenceStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AlarmException {
  readonly id: string;
  readonly occurrenceId: string;
  readonly kind: 'SKIP_ONCE';
  readonly createdAt: Date;
}

export interface SleepEvent {
  readonly id: string;
  readonly cycleDate: string;
  readonly kind: SleepEventKind;
  readonly occurredAt: Date;
}

export interface WakeResult {
  readonly id: string;
  readonly occurrenceId: string;
  readonly cycleDate: string;
  readonly kind: WakeResultKind;
  readonly recordedAt: Date;
  readonly emergencyReason: string | null;
  readonly emergencyComment: string | null;
  readonly waterCompletedAt: Date | null;
}

export interface SleepHistorySummary {
  readonly qrDismissals: number;
  readonly emergencyDismissals: number;
  readonly alarmDisabled: number;
  readonly withoutTrustworthyResult: number;
  readonly waterCompleted: number;
  readonly qrShare: number | null;
}

export interface SleepHistoryEntry {
  readonly cycleDate: string;
  readonly preparation: PreparationCompletionKind | 'NO_MARKS';
  readonly wakeResult: WakeResultKind | 'ALARM_DISABLED';
  readonly waterCompleted: boolean;
}

export interface SleepScheduleState {
  readonly id: typeof SLEEP_SCHEDULE_ID;
  readonly version: number;
  readonly settings: SleepSettings | null;
  readonly preparationGroups: readonly SleepPreparationGroup[];
  readonly preparationItems: readonly SleepPreparationItem[];
  readonly nightCycles: readonly NightCycle[];
  readonly wakeOccurrences: readonly WakeOccurrence[];
  readonly alarmExceptions: readonly AlarmException[];
  readonly sleepEvents: readonly SleepEvent[];
  readonly wakeResults: readonly WakeResult[];
}

export interface EnsureNightCycleInput {
  readonly cycleDate: string;
  readonly preparationItems?: readonly PreparationSnapshotItemInput[];
  readonly cycleId: string;
  readonly createdAt: Date;
}

export interface RebuildWakeScheduleInput {
  readonly cycleDates: readonly string[];
  readonly now: Date;
  readonly nextId: () => string;
}

export function createEmptySleepSchedule(): SleepScheduleState {
  const catalog = createDefaultPreparationCatalog();
  return {
    id: SLEEP_SCHEDULE_ID,
    version: 0,
    settings: null,
    ...catalog,
    nightCycles: [],
    wakeOccurrences: [],
    alarmExceptions: [],
    sleepEvents: [],
    wakeResults: [],
  };
}

export function createDefaultPreparationCatalog(): Pick<
  SleepScheduleState,
  'preparationGroups' | 'preparationItems'
> {
  return {
    preparationGroups: [
      { id: 'room', title: 'Комната', position: 0 },
      { id: 'morning', title: 'Утро', position: 1 },
      { id: 'personal', title: 'Личное', position: 2 },
    ],
    preparationItems: [
      baseItem('base-room-air', 'room', 'Проветрить комнату', 0),
      baseItem('base-room-bed', 'room', 'Подготовить кровать', 1),
      baseItem('base-morning-clothes', 'morning', 'Подготовить одежду', 0),
      baseItem('base-morning-water', 'morning', 'Поставить стакан воды', 1),
    ],
  };
}

export function addPreparationGroup(
  state: SleepScheduleState,
  input: { readonly id: string; readonly title: string },
): SleepScheduleState {
  assertIdentifier(input.id, 'Идентификатор группы подготовки');
  const title = normalizedTitle(input.title);
  if (state.preparationGroups.some(({ id }) => id === input.id)) {
    throw new Error('Группа подготовки с таким идентификатором уже существует.');
  }
  return changed(state, {
    preparationGroups: [
      ...state.preparationGroups,
      { id: input.id, title, position: state.preparationGroups.length },
    ],
  });
}

export function renamePreparationGroup(
  state: SleepScheduleState,
  groupId: string,
  title: string,
): SleepScheduleState {
  requiredPreparationGroup(state, groupId);
  const normalized = normalizedTitle(title);
  return changed(state, {
    preparationGroups: state.preparationGroups.map((group) =>
      group.id === groupId ? { ...group, title: normalized } : group,
    ),
  });
}

export function movePreparationGroup(
  state: SleepScheduleState,
  groupId: string,
  targetPosition: number,
): SleepScheduleState {
  requiredPreparationGroup(state, groupId);
  const groups = moveAt(state.preparationGroups, groupId, targetPosition).map(
    (group, position) => ({
      ...group,
      position,
    }),
  );
  return changed(state, { preparationGroups: groups });
}

export function deletePreparationGroup(
  state: SleepScheduleState,
  groupId: string,
  targetGroupId?: string,
): SleepScheduleState {
  requiredPreparationGroup(state, groupId);
  if (state.preparationGroups.length === 1) throw new Error('Последнюю группу нельзя удалить.');
  const contained = state.preparationItems.filter((item) => item.groupId === groupId);
  if (contained.length > 0 && targetGroupId === undefined) {
    throw new Error('Выберите группу для переноса пунктов.');
  }
  if (targetGroupId === groupId) throw new Error('Выберите другую группу для переноса пунктов.');
  if (targetGroupId !== undefined) requiredPreparationGroup(state, targetGroupId);
  const existingTargetCount = state.preparationItems.filter(
    (item) => item.groupId === targetGroupId,
  ).length;
  const preparationItems = normalizeItemPositions(
    state.preparationItems.map((item) => {
      if (item.groupId !== groupId) return item;
      return {
        ...item,
        groupId: targetGroupId!,
        position: existingTargetCount + contained.findIndex(({ id }) => id === item.id),
      };
    }),
  );
  return changed(state, {
    preparationGroups: state.preparationGroups
      .filter(({ id }) => id !== groupId)
      .map((group, position) => ({ ...group, position })),
    preparationItems,
  });
}

export function addCustomPreparationItem(
  state: SleepScheduleState,
  input: { readonly id: string; readonly groupId: string; readonly title: string },
): SleepScheduleState {
  assertIdentifier(input.id, 'Идентификатор пункта подготовки');
  requiredPreparationGroup(state, input.groupId);
  if (state.preparationItems.some(({ id }) => id === input.id)) {
    throw new Error('Пункт подготовки с таким идентификатором уже существует.');
  }
  const position = state.preparationItems.filter(({ groupId }) => groupId === input.groupId).length;
  return changed(state, {
    preparationItems: [
      ...state.preparationItems,
      {
        id: input.id,
        groupId: input.groupId,
        title: normalizedTitle(input.title),
        position,
        kind: PREPARATION_ITEM_KIND.custom,
        enabled: true,
      },
    ],
  });
}

export function renamePreparationItem(
  state: SleepScheduleState,
  itemId: string,
  title: string,
): SleepScheduleState {
  const item = requiredPreparationItem(state, itemId);
  if (item.kind === PREPARATION_ITEM_KIND.base)
    throw new Error('Базовый пункт нельзя переименовать.');
  const normalized = normalizedTitle(title);
  return changed(state, {
    preparationItems: state.preparationItems.map((entry) =>
      entry.id === itemId ? { ...entry, title: normalized } : entry,
    ),
  });
}

export function setPreparationItemEnabled(
  state: SleepScheduleState,
  itemId: string,
  enabled: boolean,
): SleepScheduleState {
  const item = requiredPreparationItem(state, itemId);
  if (item.kind === PREPARATION_ITEM_KIND.base && !enabled) {
    throw new Error('Базовый пункт нельзя отключить.');
  }
  if (item.enabled === enabled) return state;
  return changed(state, {
    preparationItems: state.preparationItems.map((entry) =>
      entry.id === itemId ? { ...entry, enabled } : entry,
    ),
  });
}

export function deletePreparationItem(
  state: SleepScheduleState,
  itemId: string,
): SleepScheduleState {
  const item = requiredPreparationItem(state, itemId);
  if (item.kind === PREPARATION_ITEM_KIND.base) throw new Error('Базовый пункт нельзя удалить.');
  return changed(state, {
    preparationItems: normalizeItemPositions(
      state.preparationItems.filter(({ id }) => id !== itemId),
    ),
  });
}

export function movePreparationItem(
  state: SleepScheduleState,
  input: {
    readonly itemId: string;
    readonly targetGroupId: string;
    readonly targetPosition: number;
  },
): SleepScheduleState {
  const item = requiredPreparationItem(state, input.itemId);
  requiredPreparationGroup(state, input.targetGroupId);
  const without = state.preparationItems.filter(({ id }) => id !== input.itemId);
  const target = without
    .filter(({ groupId }) => groupId === input.targetGroupId)
    .sort((left, right) => left.position - right.position);
  const position = Math.max(0, Math.min(input.targetPosition, target.length));
  target.splice(position, 0, { ...item, groupId: input.targetGroupId, position });
  return changed(state, {
    preparationItems: normalizeItemPositions([
      ...without.filter(({ groupId }) => groupId !== input.targetGroupId),
      ...target,
    ]),
  });
}

export function updateSleepSettings(
  state: SleepScheduleState,
  input: SleepSettingsInput,
  updatedAt: Date,
): SleepScheduleState {
  assertDate(updatedAt, 'Время изменения настроек некорректно.');
  calculateNightWindow({ cycleDate: '2000-01-01', ...input });
  return {
    ...state,
    version: state.version + 1,
    settings: {
      ...input,
      quietModeEnabled: input.quietModeEnabled ?? state.settings?.quietModeEnabled ?? false,
      alarmSound: normalizeAlarmSound(
        input.alarmSound ?? state.settings?.alarmSound ?? DEFAULT_SLEEP_ALARM_SOUND,
      ),
      version: (state.settings?.version ?? 0) + 1,
      updatedAt: new Date(updatedAt),
    },
    wakeOccurrences: input.enabled
      ? state.wakeOccurrences
      : cancelFutureWakeOccurrences(state.wakeOccurrences, updatedAt),
  };
}

function normalizeAlarmSound(sound: SleepAlarmSound): SleepAlarmSound {
  const title = sound.title.trim();
  if (title.length === 0) throw new TypeError('Название звука будильника не может быть пустым.');
  const uri = sound.uri?.trim() || null;
  return { uri, title };
}

export function ensureNightCycle(
  state: SleepScheduleState,
  input: EnsureNightCycleInput,
): { readonly state: SleepScheduleState; readonly cycle: NightCycle } {
  const existing = state.nightCycles.find(({ cycleDate }) => cycleDate === input.cycleDate);
  if (existing !== undefined) return { state, cycle: existing };
  const settings = requiredSettings(state);
  assertIdentifier(input.cycleId, 'Идентификатор ночного цикла');
  assertDate(input.createdAt, 'Время создания ночного цикла некорректно.');
  const window = calculateNightWindow({ cycleDate: input.cycleDate, ...settings });
  const cycle: NightCycle = {
    id: input.cycleId,
    cycleDate: input.cycleDate,
    plannedSleepAt: window.plannedSleepAt,
    plannedWakeAt: window.plannedWakeAt,
    preparationItems: (input.preparationItems ?? preparationSnapshot(state)).map(
      copyPreparationItem,
    ),
    preparationCompletionKind: null,
    preparationCompletedAt: null,
    createdAt: new Date(input.createdAt),
  };
  return {
    state: {
      ...state,
      version: state.version + 1,
      nightCycles: [...state.nightCycles, cycle],
    },
    cycle,
  };
}

export function completePreparationItem(
  state: SleepScheduleState,
  cycleDate: string,
  itemId: string,
  completedAt: Date,
): SleepScheduleState {
  assertDate(completedAt, 'Время отметки пункта некорректно.');
  const cycle = requiredNightCycle(state, cycleDate);
  if (cycle.preparationCompletionKind !== null) return state;
  if (!cycle.preparationItems.some(({ id }) => id === itemId)) {
    throw new Error('Пункт текущей подготовки не найден.');
  }
  const preparationItems = cycle.preparationItems.map((item) =>
    item.id === itemId ? { ...item, status: PREPARATION_SNAPSHOT_STATUS.done } : item,
  );
  const completed = preparationItems.every(
    ({ status }) => status === PREPARATION_SNAPSHOT_STATUS.done,
  );
  return updateNightCycle(state, cycleDate, {
    ...cycle,
    preparationItems,
    preparationCompletionKind: completed ? PREPARATION_COMPLETION_KIND.allDone : null,
    preparationCompletedAt: completed ? new Date(completedAt) : null,
  });
}

export function reopenPreparationItem(
  state: SleepScheduleState,
  cycleDate: string,
  itemId: string,
): SleepScheduleState {
  const cycle = requiredNightCycle(state, cycleDate);
  if (!cycle.preparationItems.some(({ id }) => id === itemId)) {
    throw new Error('Пункт текущей подготовки не найден.');
  }
  return updateNightCycle(state, cycleDate, {
    ...cycle,
    preparationItems: cycle.preparationItems.map((item) =>
      item.id === itemId ? { ...item, status: PREPARATION_SNAPSHOT_STATUS.pending } : item,
    ),
    preparationCompletionKind: null,
    preparationCompletedAt: null,
  });
}

export function finishPreparation(
  state: SleepScheduleState,
  cycleDate: string,
  kind: Extract<PreparationCompletionKind, 'WITH_SKIPS' | 'SKIPPED_TODAY'>,
  completedAt: Date,
): SleepScheduleState {
  assertDate(completedAt, 'Время завершения подготовки некорректно.');
  const cycle = requiredNightCycle(state, cycleDate);
  if (cycle.preparationCompletionKind !== null) return state;
  return updateNightCycle(state, cycleDate, {
    ...cycle,
    preparationItems: cycle.preparationItems.map((item) =>
      item.status === PREPARATION_SNAPSHOT_STATUS.pending
        ? { ...item, status: PREPARATION_SNAPSHOT_STATUS.skipped }
        : item,
    ),
    preparationCompletionKind: kind,
    preparationCompletedAt: new Date(completedAt),
  });
}

export function rebuildWakeSchedule(
  state: SleepScheduleState,
  input: RebuildWakeScheduleInput,
): SleepScheduleState {
  assertDate(input.now, 'Время перестроения расписания некорректно.');
  const settings = requiredSettings(state);
  const nowMs = input.now.getTime();
  const desired = new Map<string, { cycleDate: string; scheduledAt: Date }>();
  if (settings.enabled) {
    for (const cycleDate of new Set(input.cycleDates)) {
      const { plannedWakeAt } = calculateNightWindow({ cycleDate, ...settings });
      if (plannedWakeAt.getTime() <= nowMs) continue;
      desired.set(cycleDate, {
        cycleDate,
        scheduledAt: plannedWakeAt,
      });
    }
  }

  for (const occurrence of state.wakeOccurrences) {
    if (
      occurrence.status === WAKE_OCCURRENCE_STATUS.delivered ||
      occurrence.status === WAKE_OCCURRENCE_STATUS.skipped
    ) {
      desired.delete(occurrence.cycleDate);
    }
  }

  const occurrences = state.wakeOccurrences.map((occurrence): WakeOccurrence => {
    if (
      occurrence.status === WAKE_OCCURRENCE_STATUS.delivered ||
      occurrence.status === WAKE_OCCURRENCE_STATUS.skipped
    ) {
      return occurrence;
    }
    const desiredOccurrence = desired.get(occurrence.cycleDate);
    if (desiredOccurrence?.scheduledAt.getTime() === occurrence.scheduledAt.getTime()) {
      desired.delete(occurrence.cycleDate);
      if (occurrence.status === WAKE_OCCURRENCE_STATUS.scheduled) return occurrence;
      return {
        ...occurrence,
        status: WAKE_OCCURRENCE_STATUS.scheduled,
        updatedAt: new Date(input.now),
      };
    }
    if (occurrence.status === WAKE_OCCURRENCE_STATUS.cancelled) return occurrence;
    return {
      ...occurrence,
      status: WAKE_OCCURRENCE_STATUS.cancelled,
      updatedAt: new Date(input.now),
    };
  });

  for (const value of desired.values()) {
    const id = input.nextId();
    assertIdentifier(id, 'Идентификатор срабатывания');
    occurrences.push({
      id,
      cycleDate: value.cycleDate,
      scheduledAt: new Date(value.scheduledAt),
      status: WAKE_OCCURRENCE_STATUS.scheduled,
      createdAt: new Date(input.now),
      updatedAt: new Date(input.now),
    });
  }

  occurrences.sort(
    (left, right) =>
      left.scheduledAt.getTime() - right.scheduledAt.getTime() || left.id.localeCompare(right.id),
  );
  return sameOccurrences(state.wakeOccurrences, occurrences)
    ? state
    : { ...state, version: state.version + 1, wakeOccurrences: occurrences };
}

export function skipNearestWakeOccurrence(
  state: SleepScheduleState,
  input: { readonly now: Date; readonly exceptionId: string },
): SleepScheduleState {
  assertDate(input.now, 'Время пропуска сигнала некорректно.');
  assertIdentifier(input.exceptionId, 'Идентификатор исключения');
  if (state.alarmExceptions.some(({ id }) => id === input.exceptionId)) return state;
  const nearest = state.wakeOccurrences
    .filter(
      ({ status, scheduledAt }) =>
        status === WAKE_OCCURRENCE_STATUS.scheduled && scheduledAt.getTime() > input.now.getTime(),
    )
    .sort(
      (left, right) =>
        left.scheduledAt.getTime() - right.scheduledAt.getTime() || left.id.localeCompare(right.id),
    )[0];
  if (nearest === undefined) throw new Error('Нет ближайшего запланированного сигнала подъёма.');

  return {
    ...state,
    version: state.version + 1,
    wakeOccurrences: state.wakeOccurrences.map((occurrence) =>
      occurrence.id === nearest.id
        ? {
            ...occurrence,
            status: WAKE_OCCURRENCE_STATUS.skipped,
            updatedAt: new Date(input.now),
          }
        : occurrence,
    ),
    alarmExceptions: [
      ...state.alarmExceptions,
      {
        id: input.exceptionId,
        occurrenceId: nearest.id,
        kind: 'SKIP_ONCE',
        createdAt: new Date(input.now),
      },
    ],
  };
}

export function setSleepFeatureEnabled(
  state: SleepScheduleState,
  enabled: boolean,
  updatedAt: Date,
): SleepScheduleState {
  const settings = requiredSettings(state);
  if (settings.enabled === enabled) return state;
  return updateSleepSettings(state, { ...settings, enabled }, updatedAt);
}

export function setSleepQuietModeEnabled(
  state: SleepScheduleState,
  enabled: boolean,
  updatedAt: Date,
): SleepScheduleState {
  const settings = requiredSettings(state);
  if (settings.quietModeEnabled === enabled) return state;
  return updateSleepSettings(state, { ...settings, quietModeEnabled: enabled }, updatedAt);
}

export function importNativeSleepEvents(
  state: SleepScheduleState,
  events: readonly SleepEvent[],
): SleepScheduleState {
  if (events.length === 0) return state;
  const byId = new Map(state.sleepEvents.map((event) => [event.id, event]));
  let changedState = false;
  for (const event of events) {
    assertIdentifier(event.id, 'Идентификатор события сна');
    assertCycleDate(event.cycleDate);
    assertSleepEventKind(event.kind);
    assertDate(event.occurredAt, 'Время события сна некорректно.');
    if (byId.has(event.id)) continue;
    byId.set(event.id, { ...event, occurredAt: new Date(event.occurredAt) });
    changedState = true;
  }
  if (!changedState) return state;
  const sleepEvents = [...byId.values()].sort(
    (left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id),
  );
  return changed(state, { sleepEvents });
}

export function importNativeWakeResults(
  state: SleepScheduleState,
  results: readonly WakeResult[],
): SleepScheduleState {
  if (results.length === 0) return state;
  const byId = new Map(state.wakeResults.map((result) => [result.id, result]));
  let changedState = false;
  for (const result of results) {
    const normalized = normalizeWakeResult(result);
    const existing = byId.get(normalized.id);
    if (existing !== undefined && !shouldReplaceWakeResult(existing, normalized)) continue;
    if (existing !== undefined && sameWakeResult(existing, normalized)) continue;
    byId.set(normalized.id, normalized);
    changedState = true;
  }
  if (!changedState) return state;
  const wakeResults = [...byId.values()].sort(
    (left, right) =>
      left.recordedAt.getTime() - right.recordedAt.getTime() || left.id.localeCompare(right.id),
  );
  const deliveredByOccurrence = new Map(
    wakeResults.map((result) => [result.occurrenceId, result.recordedAt]),
  );
  const wakeOccurrences = state.wakeOccurrences.map((occurrence) => {
    const deliveredAt = deliveredByOccurrence.get(occurrence.id);
    if (
      deliveredAt === undefined ||
      occurrence.status === WAKE_OCCURRENCE_STATUS.delivered ||
      occurrence.status === WAKE_OCCURRENCE_STATUS.skipped
    ) {
      return occurrence;
    }
    return {
      ...occurrence,
      status: WAKE_OCCURRENCE_STATUS.delivered,
      updatedAt: new Date(deliveredAt),
    };
  });
  return changed(state, { wakeResults, wakeOccurrences });
}

export function summarizeSleepHistory(state: SleepScheduleState): SleepHistorySummary {
  const qrDismissals = state.wakeResults.filter(({ kind }) => kind === WAKE_RESULT_KIND.qr).length;
  const emergencyDismissals = state.wakeResults.filter(
    ({ kind }) => kind === WAKE_RESULT_KIND.emergency,
  ).length;
  const denominator = qrDismissals + emergencyDismissals;
  return {
    qrDismissals,
    emergencyDismissals,
    alarmDisabled: state.alarmExceptions.length,
    withoutTrustworthyResult: state.wakeResults.filter(
      ({ kind }) => kind === WAKE_RESULT_KIND.noResult,
    ).length,
    waterCompleted: state.wakeResults.filter(({ waterCompletedAt }) => waterCompletedAt !== null)
      .length,
    qrShare: denominator === 0 ? null : qrDismissals / denominator,
  };
}

export function selectSleepHistoryEntries(state: SleepScheduleState): readonly SleepHistoryEntry[] {
  return [...state.nightCycles]
    .sort((left, right) => right.cycleDate.localeCompare(left.cycleDate))
    .map((cycle) => {
      const result = [...state.wakeResults]
        .filter(({ cycleDate }) => cycleDate === cycle.cycleDate)
        .sort((left, right) => right.recordedAt.getTime() - left.recordedAt.getTime())[0];
      const occurrenceIds = new Set(
        state.wakeOccurrences
          .filter(({ cycleDate }) => cycleDate === cycle.cycleDate)
          .map(({ id }) => id),
      );
      const alarmDisabled = state.alarmExceptions.some(({ occurrenceId }) =>
        occurrenceIds.has(occurrenceId),
      );
      return {
        cycleDate: cycle.cycleDate,
        preparation: cycle.preparationCompletionKind ?? 'NO_MARKS',
        wakeResult: result?.kind ?? (alarmDisabled ? 'ALARM_DISABLED' : 'NO_RESULT'),
        waterCompleted: result?.waterCompletedAt !== null && result !== undefined,
      };
    });
}

function requiredSettings(state: SleepScheduleState): SleepSettings {
  if (state.settings === null) throw new Error('Настройки сна ещё не заданы.');
  return state.settings;
}

function normalizeWakeResult(result: WakeResult): WakeResult {
  assertIdentifier(result.id, 'Идентификатор результата пробуждения');
  assertIdentifier(result.occurrenceId, 'Идентификатор срабатывания результата');
  assertCycleDate(result.cycleDate);
  if (!Object.values(WAKE_RESULT_KIND).includes(result.kind)) {
    throw new TypeError('Неизвестный результат пробуждения.');
  }
  assertDate(result.recordedAt, 'Время результата пробуждения некорректно.');
  if (result.waterCompletedAt !== null) {
    assertDate(result.waterCompletedAt, 'Время отметки воды некорректно.');
  }
  return {
    ...result,
    emergencyReason: normalizedOptionalText(result.emergencyReason),
    emergencyComment: normalizedOptionalText(result.emergencyComment),
    recordedAt: new Date(result.recordedAt),
    waterCompletedAt: result.waterCompletedAt === null ? null : new Date(result.waterCompletedAt),
  };
}

function shouldReplaceWakeResult(existing: WakeResult, incoming: WakeResult): boolean {
  const existingTrustworthy = existing.kind !== WAKE_RESULT_KIND.noResult;
  const incomingTrustworthy = incoming.kind !== WAKE_RESULT_KIND.noResult;
  if (existingTrustworthy && !incomingTrustworthy) return false;
  if (!existingTrustworthy && incomingTrustworthy) return true;
  return incoming.recordedAt.getTime() >= existing.recordedAt.getTime();
}

function sameWakeResult(left: WakeResult, right: WakeResult): boolean {
  return (
    left.id === right.id &&
    left.occurrenceId === right.occurrenceId &&
    left.cycleDate === right.cycleDate &&
    left.kind === right.kind &&
    left.recordedAt.getTime() === right.recordedAt.getTime() &&
    left.emergencyReason === right.emergencyReason &&
    left.emergencyComment === right.emergencyComment &&
    left.waterCompletedAt?.getTime() === right.waterCompletedAt?.getTime()
  );
}

function assertSleepEventKind(value: SleepEventKind): void {
  if (!Object.values(SLEEP_EVENT_KIND).includes(value)) {
    throw new TypeError('Неизвестный тип события сна.');
  }
}

function assertCycleDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Дата цикла сна некорректна.');
  }
}

function normalizedOptionalText(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}

function copyPreparationItem(item: PreparationSnapshotItemInput): PreparationSnapshotItem {
  assertIdentifier(item.id, 'Идентификатор пункта подготовки');
  assertIdentifier(item.groupId, 'Идентификатор группы подготовки');
  if (item.groupTitle.trim().length === 0 || item.title.trim().length === 0) {
    throw new TypeError('Название группы и пункта подготовки не может быть пустым.');
  }
  if (!Number.isInteger(item.position) || item.position < 0) {
    throw new TypeError('Позиция пункта подготовки должна быть неотрицательным целым числом.');
  }
  return { ...item, groupTitle: item.groupTitle.trim(), title: item.title.trim() };
}

function preparationSnapshot(state: SleepScheduleState): readonly PreparationSnapshotItemInput[] {
  const groups = new Map(state.preparationGroups.map((group) => [group.id, group]));
  return state.preparationItems
    .filter(({ enabled }) => enabled)
    .sort((left, right) => {
      const group =
        (groups.get(left.groupId)?.position ?? 0) - (groups.get(right.groupId)?.position ?? 0);
      return group || left.position - right.position;
    })
    .map((item) => ({
      id: item.id,
      groupId: item.groupId,
      groupTitle: groups.get(item.groupId)?.title ?? '',
      title: item.title,
      position: item.position,
      status: PREPARATION_SNAPSHOT_STATUS.pending,
    }));
}

function baseItem(
  id: string,
  groupId: string,
  title: string,
  position: number,
): SleepPreparationItem {
  return { id, groupId, title, position, kind: PREPARATION_ITEM_KIND.base, enabled: true };
}

function requiredPreparationGroup(
  state: SleepScheduleState,
  groupId: string,
): SleepPreparationGroup {
  const group = state.preparationGroups.find(({ id }) => id === groupId);
  if (group === undefined) throw new Error('Группа подготовки не найдена.');
  return group;
}

function requiredPreparationItem(state: SleepScheduleState, itemId: string): SleepPreparationItem {
  const item = state.preparationItems.find(({ id }) => id === itemId);
  if (item === undefined) throw new Error('Пункт подготовки не найден.');
  return item;
}

function requiredNightCycle(state: SleepScheduleState, cycleDate: string): NightCycle {
  const cycle = state.nightCycles.find((entry) => entry.cycleDate === cycleDate);
  if (cycle === undefined) throw new Error('Ночной цикл не найден.');
  return cycle;
}

function updateNightCycle(
  state: SleepScheduleState,
  cycleDate: string,
  cycle: NightCycle,
): SleepScheduleState {
  return changed(state, {
    nightCycles: state.nightCycles.map((entry) => (entry.cycleDate === cycleDate ? cycle : entry)),
  });
}

function changed(
  state: SleepScheduleState,
  patch: Partial<Omit<SleepScheduleState, 'id' | 'version'>>,
): SleepScheduleState {
  return { ...state, ...patch, version: state.version + 1 };
}

function normalizedTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new TypeError('Название не может быть пустым.');
  return title;
}

function moveAt<T extends { readonly id: string }>(
  values: readonly T[],
  id: string,
  targetPosition: number,
): T[] {
  const result = [...values];
  const index = result.findIndex((value) => value.id === id);
  const [value] = result.splice(index, 1);
  result.splice(Math.max(0, Math.min(targetPosition, result.length)), 0, value!);
  return result;
}

function normalizeItemPositions(items: readonly SleepPreparationItem[]): SleepPreparationItem[] {
  const positions = new Map<string, number>();
  return [...items]
    .sort(
      (left, right) => left.groupId.localeCompare(right.groupId) || left.position - right.position,
    )
    .map((item) => {
      const position = positions.get(item.groupId) ?? 0;
      positions.set(item.groupId, position + 1);
      return { ...item, position };
    });
}

function cancelFutureWakeOccurrences(
  occurrences: readonly WakeOccurrence[],
  updatedAt: Date,
): readonly WakeOccurrence[] {
  return occurrences.map((occurrence) =>
    occurrence.status === WAKE_OCCURRENCE_STATUS.scheduled &&
    occurrence.scheduledAt.getTime() > updatedAt.getTime()
      ? {
          ...occurrence,
          status: WAKE_OCCURRENCE_STATUS.cancelled,
          updatedAt: new Date(updatedAt),
        }
      : occurrence,
  );
}

function sameOccurrences(
  left: readonly WakeOccurrence[],
  right: readonly WakeOccurrence[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((occurrence, index) => occurrence === right[index]);
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label} не может быть пустым.`);
}

function assertDate(value: Date, message: string): void {
  if (Number.isNaN(value.getTime())) throw new TypeError(message);
}
