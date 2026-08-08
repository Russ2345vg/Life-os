import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineOccurrenceOverride,
  type RoutineOccurrenceOverrideType,
} from '../../../domain';
import type { RoutineOccurrenceOverrideRecord } from '../records/RoutineOccurrenceOverrideRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableDayDate,
  readNullableEntityId,
  readNullableString,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class RoutineOccurrenceOverrideRecordMapper {
  public static toRecord(override: RoutineOccurrenceOverride): RoutineOccurrenceOverrideRecord {
    return {
      schemaVersion: 1,
      id: override.id.toString(),
      routineBlockId: override.routineBlockId.toString(),
      occurrenceDate: override.occurrenceDate.toString(),
      occurrenceKey: occurrenceKey(
        override.routineBlockId.toString(),
        override.occurrenceDate.toString(),
      ),
      type: override.type,
      startTimeOverride: override.startTimeOverride,
      endTimeOverride: override.endTimeOverride,
      targetDate: override.targetDate?.toString() ?? null,
      targetStartTime: override.targetStartTime,
      replacementActionId: override.replacementActionId?.toString() ?? null,
      createdAt: override.createdAt.toISOString(),
      updatedAt: override.updatedAt.toISOString(),
      version: override.version,
    };
  }

  public static fromRecord(value: unknown): RoutineOccurrenceOverride {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const type = readString(record, 'type');
    if (!isOverrideType(type)) {
      throw invalidRecord('Поле type содержит неизвестный вид отклонения.');
    }
    const routineBlockId = readEntityId(record, 'routineBlockId');
    const occurrenceDate = readDayDate(record, 'occurrenceDate');
    if (
      readString(record, 'occurrenceKey') !==
      occurrenceKey(routineBlockId.toString(), occurrenceDate.toString())
    ) {
      throw invalidRecord('Составной ключ отклонения не соответствует его появлению.');
    }
    return RoutineOccurrenceOverride.rehydrate({
      id: readEntityId(record, 'id'),
      routineBlockId,
      occurrenceDate,
      type,
      ...(readNullableString(record, 'startTimeOverride') === null
        ? {}
        : { startTimeOverride: readNullableString(record, 'startTimeOverride')! }),
      ...(readNullableString(record, 'endTimeOverride') === null
        ? {}
        : { endTimeOverride: readNullableString(record, 'endTimeOverride')! }),
      ...(readNullableDayDate(record, 'targetDate') === null
        ? {}
        : { targetDate: readNullableDayDate(record, 'targetDate')! }),
      ...(readNullableString(record, 'targetStartTime') === null
        ? {}
        : { targetStartTime: readNullableString(record, 'targetStartTime')! }),
      ...(readNullableEntityId(record, 'replacementActionId') === null
        ? {}
        : { replacementActionId: readNullableEntityId(record, 'replacementActionId')! }),
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

export function occurrenceKey(routineBlockId: string, occurrenceDate: string): string {
  return `${routineBlockId}\u0000${occurrenceDate}`;
}

function isOverrideType(value: string): value is RoutineOccurrenceOverrideType {
  return Object.values(ROUTINE_OCCURRENCE_OVERRIDE_TYPE).some((type) => type === value);
}
