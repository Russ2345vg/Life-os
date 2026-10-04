import {
  validateSleepObservation,
  type SleepObservation,
  type WakeObservationSource,
} from '../../../domain/sleep/SleepObservation';
import type { SleepObservationRecord } from '../records/SleepObservationRecord';
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
    const observation: SleepObservation = {
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

function readWakeSource(record: UnknownRecord): WakeObservationSource | null {
  const value = readNullableString(record, 'wakeSource');
  if (value === null || value === 'ALARM_QR' || value === 'ALARM_EMERGENCY' || value === 'MANUAL')
    return value;
  throw invalidRecord('Поле wakeSource содержит неподдерживаемое значение.');
}
