import {
  PREPARATION_SNAPSHOT_STATUS,
  PREPARATION_COMPLETION_KIND,
  PREPARATION_ITEM_KIND,
  SLEEP_SCHEDULE_ID,
  SLEEP_EVENT_KIND,
  WAKE_RESULT_KIND,
  WAKE_OCCURRENCE_STATUS,
  type PreparationSnapshotStatus,
  type PreparationCompletionKind,
  type PreparationItemKind,
  type SleepScheduleState,
  type SleepEventKind,
  type WakeResultKind,
  type WakeOccurrenceStatus,
} from '../../../domain/sleep/SleepSchedule';
import { createDefaultPreparationCatalog } from '../../../domain/sleep/SleepSchedule';
import { DEFAULT_SLEEP_ALARM_SOUND } from '../../../domain/sleep/SleepSchedule';
import type { SleepScheduleRecord } from '../records/SleepScheduleRecord';
import {
  validateSleepPreparationTiming,
  type SleepPreparationTiming,
} from '../../../domain/sleep/SleepPreparationTiming';
import type {
  AndroidAlarmOutcome,
  AndroidAlarmReport,
} from '../../../domain/sleep/AndroidAlarmReport';
import {
  validateColdShowerEntry,
  type ColdShowerEntry,
  type ColdShowerStatus,
  type ColdShowerFeeling,
  type ColdShowerSkipReason,
} from '../../../domain/sleep/ColdShower';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readBoolean,
  readIsoDate,
  readOptionalNullableIsoDate,
  readOptionalNullableString,
  readNullableString,
  readNumber,
  readRecordArray,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class SleepScheduleRecordMapper {
  public static toRecord(state: SleepScheduleState): SleepScheduleRecord {
    if (state.preparationTiming !== undefined)
      validateSleepPreparationTiming(state.preparationTiming);
    return {
      schemaVersion: 1,
      ...(state.preparationTiming === undefined
        ? {}
        : { preparationTiming: { ...state.preparationTiming } }),
      id: SLEEP_SCHEDULE_ID,
      version: state.version,
      ...(state.androidAlarmReport === undefined
        ? {}
        : {
            androidAlarmReport: {
              source: state.androidAlarmReport.source,
              checkedAt: state.androidAlarmReport.checkedAt.toISOString(),
              scheduleKey: state.androidAlarmReport.scheduleKey,
              outcome: state.androidAlarmReport.outcome,
              acknowledgedSettingsVersion: state.androidAlarmReport.acknowledgedSettingsVersion,
              nextOccurrenceId: state.androidAlarmReport.nextOccurrenceId,
              nextScheduledAt: state.androidAlarmReport.nextScheduledAt?.toISOString() ?? null,
            },
          }),
      ...(state.coldShowerEntries === undefined
        ? {}
        : {
            coldShowerEntries: state.coldShowerEntries.map((entry) => ({
              ...entry,
              recordedAt: entry.recordedAt.toISOString(),
              updatedAt: entry.updatedAt.toISOString(),
            })),
          }),
      settings:
        state.settings === null
          ? null
          : {
              ...state.settings,
              updatedAt: state.settings.updatedAt.toISOString(),
            },
      preparationGroups: state.preparationGroups.map((group) => ({ ...group })),
      preparationItems: state.preparationItems.map((item) => ({ ...item })),
      nightCycles: state.nightCycles.map((cycle) => ({
        ...cycle,
        plannedSleepAt: cycle.plannedSleepAt.toISOString(),
        plannedWakeAt: cycle.plannedWakeAt.toISOString(),
        preparationItems: cycle.preparationItems.map((item) => ({ ...item })),
        preparationCompletedAt: cycle.preparationCompletedAt?.toISOString() ?? null,
        createdAt: cycle.createdAt.toISOString(),
      })),
      wakeOccurrences: state.wakeOccurrences.map((occurrence) => ({
        ...occurrence,
        scheduledAt: occurrence.scheduledAt.toISOString(),
        createdAt: occurrence.createdAt.toISOString(),
        updatedAt: occurrence.updatedAt.toISOString(),
      })),
      alarmExceptions: state.alarmExceptions.map((exception) => ({
        ...exception,
        createdAt: exception.createdAt.toISOString(),
      })),
      sleepEvents: state.sleepEvents.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      })),
      wakeResults: state.wakeResults.map((result) => ({
        ...result,
        recordedAt: result.recordedAt.toISOString(),
        waterCompletedAt: result.waterCompletedAt?.toISOString() ?? null,
      })),
    };
  }

  public static fromRecord(value: unknown): SleepScheduleState {
    assertRecordAndSchemaVersion(value);
    if (readString(value, 'id') !== SLEEP_SCHEDULE_ID) {
      throw invalidRecord('Запись расписания сна имеет неизвестный идентификатор.');
    }
    const settingsValue = value.settings;
    const settings =
      settingsValue === null ? null : readSettings(asRecord(settingsValue, 'settings'));
    const defaults = createDefaultPreparationCatalog();
    const androidAlarmReport = readAndroidAlarmReport(value.androidAlarmReport);
    const preparationTiming = readPreparationTiming(value.preparationTiming);
    const preparationGroups = Array.isArray(value.preparationGroups)
      ? readRecordArray(value, 'preparationGroups').map((group) => ({
          id: readString(group, 'id'),
          title: readString(group, 'title'),
          position: readInteger(group, 'position'),
        }))
      : defaults.preparationGroups;
    const preparationItems = Array.isArray(value.preparationItems)
      ? readRecordArray(value, 'preparationItems').map((item) => ({
          id: readString(item, 'id'),
          groupId: readString(item, 'groupId'),
          title: readString(item, 'title'),
          position: readInteger(item, 'position'),
          kind: readPreparationItemKind(item),
          enabled: readBoolean(item, 'enabled'),
        }))
      : defaults.preparationItems;
    return {
      id: SLEEP_SCHEDULE_ID,
      version: readInteger(value, 'version'),
      ...(preparationTiming === undefined ? {} : { preparationTiming }),
      ...(androidAlarmReport === undefined ? {} : { androidAlarmReport }),
      ...(value.coldShowerEntries === undefined
        ? {}
        : { coldShowerEntries: readColdShowerEntries(value) }),
      settings,
      preparationGroups,
      preparationItems,
      nightCycles: readRecordArray(value, 'nightCycles').map((cycle) => ({
        id: readString(cycle, 'id'),
        cycleDate: readString(cycle, 'cycleDate'),
        plannedSleepAt: readIsoDate(cycle, 'plannedSleepAt'),
        plannedWakeAt: readIsoDate(cycle, 'plannedWakeAt'),
        preparationItems: readRecordArray(cycle, 'preparationItems').map((item) => ({
          id: readString(item, 'id'),
          groupId: readString(item, 'groupId'),
          groupTitle: readString(item, 'groupTitle'),
          title: readString(item, 'title'),
          position: readInteger(item, 'position'),
          status: readPreparationStatus(item),
        })),
        preparationCompletionKind: readPreparationCompletionKind(cycle),
        preparationCompletedAt:
          cycle.preparationCompletedAt === undefined || cycle.preparationCompletedAt === null
            ? null
            : readIsoDate(cycle, 'preparationCompletedAt'),
        createdAt: readIsoDate(cycle, 'createdAt'),
      })),
      wakeOccurrences: readRecordArray(value, 'wakeOccurrences').map((occurrence) => ({
        id: readString(occurrence, 'id'),
        cycleDate: readString(occurrence, 'cycleDate'),
        scheduledAt: readIsoDate(occurrence, 'scheduledAt'),
        status: readWakeStatus(occurrence),
        createdAt: readIsoDate(occurrence, 'createdAt'),
        updatedAt: readIsoDate(occurrence, 'updatedAt'),
      })),
      alarmExceptions: readRecordArray(value, 'alarmExceptions').map((exception) => {
        if (readString(exception, 'kind') !== 'SKIP_ONCE') {
          throw invalidRecord('Запись содержит неизвестный тип исключения будильника.');
        }
        return {
          id: readString(exception, 'id'),
          occurrenceId: readString(exception, 'occurrenceId'),
          kind: 'SKIP_ONCE',
          createdAt: readIsoDate(exception, 'createdAt'),
        };
      }),
      sleepEvents: Array.isArray(value.sleepEvents)
        ? readRecordArray(value, 'sleepEvents').map((event) => ({
            id: readString(event, 'id'),
            cycleDate: readString(event, 'cycleDate'),
            kind: readSleepEventKind(event),
            occurredAt: readIsoDate(event, 'occurredAt'),
          }))
        : [],
      wakeResults: Array.isArray(value.wakeResults)
        ? readRecordArray(value, 'wakeResults').map((result) => ({
            id: readString(result, 'id'),
            occurrenceId: readString(result, 'occurrenceId'),
            cycleDate: readString(result, 'cycleDate'),
            kind: readWakeResultKind(result),
            recordedAt: readIsoDate(result, 'recordedAt'),
            emergencyReason: readOptionalNullableString(result, 'emergencyReason'),
            emergencyComment: readOptionalNullableString(result, 'emergencyComment'),
            waterCompletedAt: readOptionalNullableIsoDate(result, 'waterCompletedAt'),
          }))
        : [],
    };
  }
}

function readPreparationTiming(value: unknown): SleepPreparationTiming | undefined {
  if (value === undefined) return undefined;
  try {
    const record = asRecord(value, 'preparationTiming');
    const timing = {
      totalPreparationMinutes: readNumber(record, 'totalPreparationMinutes'),
      stretchingItemId: readNullableString(record, 'stretchingItemId'),
      stretchingMinutes: readNumber(record, 'stretchingMinutes'),
    };
    validateSleepPreparationTiming(timing);
    return timing;
  } catch {
    return undefined;
  }
}

function readAndroidAlarmReport(value: unknown): AndroidAlarmReport | undefined {
  if (value === undefined) return undefined;
  try {
    const record = asRecord(value, 'androidAlarmReport');
    if (readString(record, 'source') !== 'ANDROID') return undefined;
    const outcome = readString(record, 'outcome') as AndroidAlarmOutcome;
    if (
      !['CONFIRMED', 'DISABLED', 'PERMISSION_REQUIRED', 'ERROR', 'NOT_CONFIRMED'].includes(outcome)
    )
      return undefined;
    const scheduleKey = readString(record, 'scheduleKey');
    if (scheduleKey.length === 0) return undefined;
    const acknowledgedSettingsVersion =
      record.acknowledgedSettingsVersion === null
        ? null
        : readInteger(record, 'acknowledgedSettingsVersion');
    const nextOccurrenceId =
      record.nextOccurrenceId === null ? null : readString(record, 'nextOccurrenceId');
    const nextScheduledAt =
      record.nextScheduledAt === null ? null : readIsoDate(record, 'nextScheduledAt');
    if (
      outcome === 'CONFIRMED' &&
      (acknowledgedSettingsVersion === null || !nextOccurrenceId || nextScheduledAt === null)
    )
      return undefined;
    if (
      outcome === 'DISABLED' &&
      (acknowledgedSettingsVersion === null ||
        nextOccurrenceId !== null ||
        nextScheduledAt !== null)
    )
      return undefined;
    return {
      source: 'ANDROID',
      checkedAt: readIsoDate(record, 'checkedAt'),
      scheduleKey,
      outcome,
      acknowledgedSettingsVersion,
      nextOccurrenceId,
      nextScheduledAt,
    };
  } catch {
    // Optional device telemetry must never block loading the primary alarm settings.
    return undefined;
  }
}

function readColdShowerEntries(record: UnknownRecord): readonly ColdShowerEntry[] {
  const entries = readRecordArray(record, 'coldShowerEntries').map((item) => {
    const entry: ColdShowerEntry = {
      date: readString(item, 'date'),
      status: readString(item, 'status') as ColdShowerStatus,
      energy: item.energy === null ? null : readNumber(item, 'energy'),
      feeling: item.feeling === null ? null : (readString(item, 'feeling') as ColdShowerFeeling),
      skipReason:
        item.skipReason === null ? null : (readString(item, 'skipReason') as ColdShowerSkipReason),
      recordedAt: readIsoDate(item, 'recordedAt'),
      updatedAt: readIsoDate(item, 'updatedAt'),
    };
    validateColdShowerEntry(entry);
    return entry;
  });
  if (new Set(entries.map((entry) => entry.date)).size !== entries.length)
    throw invalidRecord('Запись содержит повторные отметки душа за один день.');
  return entries;
}

function readPreparationItemKind(record: UnknownRecord): PreparationItemKind {
  const kind = readString(record, 'kind');
  if (!Object.values(PREPARATION_ITEM_KIND).includes(kind as PreparationItemKind)) {
    throw invalidRecord('Запись содержит неизвестный тип пункта подготовки.');
  }
  return kind as PreparationItemKind;
}

function readPreparationCompletionKind(record: UnknownRecord): PreparationCompletionKind | null {
  const kind = record.preparationCompletionKind;
  if (kind === undefined || kind === null) return null;
  if (
    typeof kind !== 'string' ||
    !Object.values(PREPARATION_COMPLETION_KIND).includes(kind as PreparationCompletionKind)
  ) {
    throw invalidRecord('Запись содержит неизвестный вид завершения подготовки.');
  }
  return kind as PreparationCompletionKind;
}

function readSettings(record: UnknownRecord) {
  const alarmSoundValue = record.alarmSound;
  const alarmSound =
    alarmSoundValue === undefined
      ? DEFAULT_SLEEP_ALARM_SOUND
      : readAlarmSound(asRecord(alarmSoundValue, 'alarmSound'));
  return {
    bedtime: readString(record, 'bedtime'),
    ...(record.wakeOverride === undefined
      ? {}
      : {
          wakeOverride:
            record.wakeOverride === null
              ? null
              : {
                  cycleDate: readString(asRecord(record.wakeOverride, 'wakeOverride'), 'cycleDate'),
                  wakeTime: readString(asRecord(record.wakeOverride, 'wakeOverride'), 'wakeTime'),
                },
        }),
    wakeTime: readString(record, 'wakeTime'),
    timeZone: readString(record, 'timeZone'),
    enabled: readBoolean(record, 'enabled'),
    quietModeEnabled:
      record.quietModeEnabled === undefined ? false : readBoolean(record, 'quietModeEnabled'),
    alarmSound,
    version: readInteger(record, 'version'),
    updatedAt: readIsoDate(record, 'updatedAt'),
  };
}

function readSleepEventKind(record: UnknownRecord): SleepEventKind {
  const kind = readString(record, 'kind');
  if (!Object.values(SLEEP_EVENT_KIND).includes(kind as SleepEventKind)) {
    throw invalidRecord('Запись содержит неизвестный тип события сна.');
  }
  return kind as SleepEventKind;
}

function readWakeResultKind(record: UnknownRecord): WakeResultKind {
  const kind = readString(record, 'kind');
  if (!Object.values(WAKE_RESULT_KIND).includes(kind as WakeResultKind)) {
    throw invalidRecord('Запись содержит неизвестный результат пробуждения.');
  }
  return kind as WakeResultKind;
}

function readAlarmSound(record: UnknownRecord) {
  const uri = record.uri;
  if (uri !== null && typeof uri !== 'string') {
    throw invalidRecord('URI звука будильника должен быть строкой или null.');
  }
  return {
    uri,
    title: readString(record, 'title'),
  };
}

function readPreparationStatus(record: UnknownRecord): PreparationSnapshotStatus {
  const status = readString(record, 'status');
  if (!Object.values(PREPARATION_SNAPSHOT_STATUS).includes(status as PreparationSnapshotStatus)) {
    throw invalidRecord('Запись содержит неизвестный статус подготовки.');
  }
  return status as PreparationSnapshotStatus;
}

function readWakeStatus(record: UnknownRecord): WakeOccurrenceStatus {
  const status = readString(record, 'status');
  if (!Object.values(WAKE_OCCURRENCE_STATUS).includes(status as WakeOccurrenceStatus)) {
    throw invalidRecord('Запись содержит неизвестный статус сигнала подъёма.');
  }
  return status as WakeOccurrenceStatus;
}

function readInteger(record: UnknownRecord, field: string): number {
  const value = readNumber(record, field);
  if (!Number.isInteger(value) || value < 0) {
    throw invalidRecord(`Поле ${field} должно быть неотрицательным целым числом.`);
  }
  return value;
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRecord(`Поле ${field} должно быть объектом или null.`);
  }
  return value as UnknownRecord;
}
