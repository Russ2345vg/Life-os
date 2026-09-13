import {
  ActionActualResult,
  ActionCancelReason,
  ActionExpectedResult,
  LifeAction,
  LifeActionTitle,
  type LifeActionStatus,
} from '../../../domain/life-action';
import type { LifeActionRecord } from '../records/LifeActionRecord';
import {
  assertRecordAndSchemaVersion,
  createNullableValueObject,
  createValueObject,
  readEntityId,
  readBoolean,
  readIsoDate,
  readNullableDayDate,
  readNullableEntityId,
  readNullableIsoDate,
  readNullableString,
  readOptionalNullableEntityId,
  readNumber,
  readString,
  toNullableIsoDate,
} from './RecordMapperSupport';

export class LifeActionRecordMapper {
  public static toRecord(entity: LifeAction): LifeActionRecord {
    return {
      schemaVersion: 1,
      id: entity.id.toString(),
      title: entity.title.toString(),
      description: entity.description,
      expectedResult: entity.expectedResult?.toString() ?? null,
      actualResult: entity.actualResult?.toString() ?? null,
      status: entity.status,
      decisionId: entity.decisionId?.toString() ?? null,
      sphereId: entity.sphereId?.toString() ?? null,
      goalId: entity.goalId?.toString() ?? null,
      isNext: entity.isNext,
      plannedDate: entity.plannedDate?.toString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      readyAt: toNullableIsoDate(entity.readyAt),
      startedAt: toNullableIsoDate(entity.startedAt),
      completedAt: toNullableIsoDate(entity.completedAt),
      cancelledAt: toNullableIsoDate(entity.cancelledAt),
      cancelReason: entity.cancelReason?.toString() ?? null,
      archivedAt: toNullableIsoDate(entity.archivedAt),
      rescheduleCount: entity.rescheduleCount,
      version: entity.version,
    };
  }

  public static fromRecord(record: LifeActionRecord): LifeAction {
    assertRecordAndSchemaVersion(record);
    return LifeAction.rehydrate({
      id: readEntityId(record, 'id'),
      title: createValueObject(record, 'title', LifeActionTitle.create),
      description: readNullableString(record, 'description'),
      expectedResult: createNullableValueObject(
        record,
        'expectedResult',
        ActionExpectedResult.create,
      ),
      actualResult: createNullableValueObject(record, 'actualResult', ActionActualResult.create),
      status: readString(record, 'status') as LifeActionStatus,
      decisionId: readNullableEntityId(record, 'decisionId'),
      sphereId: readOptionalNullableEntityId(record, 'sphereId'),
      goalId: readOptionalNullableEntityId(record, 'goalId'),
      isNext: record.isNext === undefined ? false : readBoolean(record, 'isNext'),
      plannedDate: readNullableDayDate(record, 'plannedDate'),
      createdAt: readIsoDate(record, 'createdAt'),
      readyAt: readNullableIsoDate(record, 'readyAt'),
      startedAt: readNullableIsoDate(record, 'startedAt'),
      completedAt: readNullableIsoDate(record, 'completedAt'),
      cancelledAt: readNullableIsoDate(record, 'cancelledAt'),
      cancelReason: createNullableValueObject(record, 'cancelReason', ActionCancelReason.create),
      archivedAt: readNullableIsoDate(record, 'archivedAt'),
      rescheduleCount: readNumber(record, 'rescheduleCount'),
      version: readNumber(record, 'version'),
    });
  }
}
