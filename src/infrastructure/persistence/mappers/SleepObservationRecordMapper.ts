import {
  validateSleepObservation,
  type SleepObservation,
  type WakeObservationSource,
} from '../../../domain/sleep/SleepObservation';
import type { SleepObservationRecord } from '../records/SleepObservationRecord';
import {
  validateSleepMorningFeedback,
  type SleepMorningFeedback,
} from '../../../domain/sleep/SleepMorningFeedback';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readIsoDate,
  readNullableIsoDate,
  readNullableString,
  readString,
  toNullableIsoDate,
  type UnknownRecord,
} from './RecordMapperSupport';

export const SleepObservationRecordMapper = {
  toRecord(observation: SleepObservation): SleepObservationRecord {
    validateSleepObservation(observation);
    return {
      schemaVersion: 1,
      ...(observation.morningFeedback === undefined
        ? {}
        : {
            morningFeedback: {
              ...observation.morningFeedback,
              recordedAt: observation.morningFeedback.recordedAt.toISOString(),
            },
          }),
      id: observation.id,
      cycleDate: observation.cycleDate,
      nightCycleId: observation.nightCycleId,
      wentToBedAt: toNullableIsoDate(observation.wentToBedAt),
      wokeAt: toNullableIsoDate(observation.wokeAt),
      wakeSource: observation.wakeSource,
      wakeOccurrenceId: observation.wakeOccurrenceId,
      timeZone: observation.timeZone,
      confirmedAt: toNullableIsoDate(observation.confirmedAt),
      createdAt: observation.createdAt.toISOString(),
      updatedAt: observation.updatedAt.toISOString(),
    };
  },

  fromRecord(value: unknown): SleepObservation {
    assertRecordAndSchemaVersion(value);
    const morningFeedback = readMorningFeedback(value.morningFeedback);
    const observation: SleepObservation = {
      ...(morningFeedback === undefined ? {} : { morningFeedback }),
      id: readString(value, 'id'),
      cycleDate: readString(value, 'cycleDate'),
      nightCycleId: readNullableString(value, 'nightCycleId'),
      wentToBedAt: readNullableIsoDate(value, 'wentToBedAt'),
      wokeAt: readNullableIsoDate(value, 'wokeAt'),
      wakeSource: readWakeSource(value),
      wakeOccurrenceId: readNullableString(value, 'wakeOccurrenceId'),
      timeZone: readString(value, 'timeZone'),
      confirmedAt: readNullableIsoDate(value, 'confirmedAt'),
      createdAt: readIsoDate(value, 'createdAt'),
      updatedAt: readIsoDate(value, 'updatedAt'),
    };
    try {
      validateSleepObservation(observation);
    } catch (error: unknown) {
      throw invalidRecord('Запись наблюдения за сном некорректна.', error);
    }
    return observation;
  },
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMorningFeedback(value: unknown): SleepMorningFeedback | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const sleepQuality = value.sleepQuality;
    const energy = value.energy;
    if (
      sleepQuality !== null &&
      sleepQuality !== 'GOOD' &&
      sleepQuality !== 'OK' &&
      sleepQuality !== 'POOR'
    )
      return undefined;
    if (energy !== null && energy !== 'ENERGETIC' && energy !== 'OK' && energy !== 'TIRED')
      return undefined;
    const feedback: SleepMorningFeedback = {
      sleepQuality,
      energy,
      recordedAt: readIsoDate(value, 'recordedAt'),
    };
    validateSleepMorningFeedback(feedback);
    return feedback;
  } catch {
    return undefined;
  }
}

function readWakeSource(record: UnknownRecord): WakeObservationSource | null {
  const value = readNullableString(record, 'wakeSource');
  if (value === null || value === 'ALARM_QR' || value === 'ALARM_EMERGENCY' || value === 'MANUAL')
    return value;
  throw invalidRecord('Поле wakeSource содержит неподдерживаемое значение.');
}
