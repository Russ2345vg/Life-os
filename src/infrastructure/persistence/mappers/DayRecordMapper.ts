import { Day } from '../../../domain/day/Day';
import type { DayStatus } from '../../../domain/day/DayStatus';
import type { DayRecord } from '../records/DayRecord';
import {
  assertRecordAndSchemaVersion,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableString,
  readNumber,
  readOptionalNullableEntityId,
  readString,
  toNullableIsoDate,
} from './RecordMapperSupport';

export class DayRecordMapper {
  public static toRecord(entity: Day): DayRecord {
    return {
      schemaVersion: 1,
      id: entity.id.toString(),
      date: entity.date.toString(),
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      plannedAt: toNullableIsoDate(entity.plannedAt),
      openedAt: toNullableIsoDate(entity.openedAt),
      firstActivityAt: toNullableIsoDate(entity.firstActivityAt),
      completedAt: toNullableIsoDate(entity.completedAt),
      summary: entity.summary,
      sphereId: entity.sphereId?.toString() ?? null,
      version: entity.version,
    };
  }

  public static fromRecord(record: DayRecord): Day {
    assertRecordAndSchemaVersion(record);
    return Day.rehydrate({
      id: readEntityId(record, 'id'),
      date: readDayDate(record, 'date'),
      status: readString(record, 'status') as DayStatus,
      createdAt: readIsoDate(record, 'createdAt'),
      plannedAt: readNullableIsoDate(record, 'plannedAt'),
      openedAt: readNullableIsoDate(record, 'openedAt'),
      firstActivityAt: readNullableIsoDate(record, 'firstActivityAt'),
      completedAt: readNullableIsoDate(record, 'completedAt'),
      summary: readNullableString(record, 'summary'),
      sphereId: readOptionalNullableEntityId(record, 'sphereId'),
      version: readNumber(record, 'version'),
    });
  }
}
