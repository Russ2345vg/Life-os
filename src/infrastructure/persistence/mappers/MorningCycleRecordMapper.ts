import { MorningCycle, isMorningPhysicalStatus } from '../../../domain';
import type { MorningCycleRecord } from '../records/MorningCycleRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableNumber,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class MorningCycleRecordMapper {
  public static toRecord(cycle: MorningCycle): MorningCycleRecord {
    return {
      schemaVersion: 1,
      id: cycle.id.toString(),
      dayId: cycle.dayId.toString(),
      dateKey: cycle.dateKey.toString(),
      startedAt: cycle.startedAt?.toISOString() ?? null,
      waterCompletedAt: cycle.waterCompletedAt?.toISOString() ?? null,
      waterAmountMl: cycle.waterAmountMl,
      physicalStatus: cycle.physicalStatus,
      physicalUpdatedAt: cycle.physicalUpdatedAt?.toISOString() ?? null,
      updatedAt: cycle.updatedAt.toISOString(),
      version: cycle.version,
    };
  }

  public static fromRecord(value: unknown): MorningCycle {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const physicalStatus = readString(record, 'physicalStatus');
    if (!isMorningPhysicalStatus(physicalStatus)) {
      throw invalidRecord('Поле physicalStatus содержит неизвестное состояние.');
    }
    return MorningCycle.rehydrate({
      id: readEntityId(record, 'id'),
      dayId: readEntityId(record, 'dayId'),
      dateKey: readDayDate(record, 'dateKey'),
      startedAt: readNullableIsoDate(record, 'startedAt'),
      waterCompletedAt: readNullableIsoDate(record, 'waterCompletedAt'),
      waterAmountMl: readNullableNumber(record, 'waterAmountMl'),
      physicalStatus,
      physicalUpdatedAt: readNullableIsoDate(record, 'physicalUpdatedAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}
