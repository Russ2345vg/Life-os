import {
  ActualResultSummary,
  Decision,
  DecisionCancelReason,
  DecisionTitle,
  ExpectedResult,
  type DecisionKind,
  type DecisionStatus,
} from '../../../domain/decision';
import type { DecisionRecord } from '../records/DecisionRecord';
import {
  assertRecordAndSchemaVersion,
  createNullableValueObject,
  createValueObject,
  readEntityId,
  readIsoDate,
  readNullableDayDate,
  readNullableIsoDate,
  readNullableNumber,
  readNullableString,
  readNumber,
  readString,
  readStringArray,
  toNullableIsoDate,
} from './RecordMapperSupport';

export class DecisionRecordMapper {
  public static toRecord(entity: Decision): DecisionRecord {
    return {
      schemaVersion: 1,
      id: entity.id.toString(),
      title: entity.title.toString(),
      reason: entity.reason,
      expectedResult: entity.expectedResult?.toString() ?? null,
      actualResultSummary: entity.actualResultSummary?.toString() ?? null,
      status: entity.status,
      kind: entity.kind,
      plannedDate: entity.plannedDate?.toString() ?? null,
      order: entity.order,
      createdAt: entity.createdAt.toISOString(),
      plannedAt: toNullableIsoDate(entity.plannedAt),
      startedAt: toNullableIsoDate(entity.startedAt),
      confirmedAt: toNullableIsoDate(entity.confirmedAt),
      cancelledAt: toNullableIsoDate(entity.cancelledAt),
      cancelReason: entity.cancelReason?.toString() ?? null,
      archivedAt: toNullableIsoDate(entity.archivedAt),
      evidenceIds: entity.evidenceIds.map(String),
      rescheduleCount: entity.rescheduleCount,
      version: entity.version,
    };
  }

  public static fromRecord(record: DecisionRecord): Decision {
    assertRecordAndSchemaVersion(record);
    return Decision.rehydrate({
      id: readEntityId(record, 'id'),
      title: createValueObject(record, 'title', DecisionTitle.create),
      reason: readNullableString(record, 'reason'),
      expectedResult: createNullableValueObject(record, 'expectedResult', ExpectedResult.create),
      actualResultSummary: createNullableValueObject(
        record,
        'actualResultSummary',
        ActualResultSummary.create,
      ),
      status: readString(record, 'status') as DecisionStatus,
      kind: readString(record, 'kind') as DecisionKind,
      plannedDate: readNullableDayDate(record, 'plannedDate'),
      order: readNullableNumber(record, 'order'),
      createdAt: readIsoDate(record, 'createdAt'),
      plannedAt: readNullableIsoDate(record, 'plannedAt'),
      startedAt: readNullableIsoDate(record, 'startedAt'),
      confirmedAt: readNullableIsoDate(record, 'confirmedAt'),
      cancelledAt: readNullableIsoDate(record, 'cancelledAt'),
      cancelReason: createNullableValueObject(record, 'cancelReason', DecisionCancelReason.create),
      archivedAt: readNullableIsoDate(record, 'archivedAt'),
      evidenceIds: readStringArray(record, 'evidenceIds').map((value) =>
        readEntityId({ evidenceId: value }, 'evidenceId'),
      ),
      rescheduleCount: readNumber(record, 'rescheduleCount'),
      version: readNumber(record, 'version'),
    });
  }
}
