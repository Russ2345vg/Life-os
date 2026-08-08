import {
  ActualResultSummary,
  DECISION_PRIORITY,
  Decision,
  DecisionCancelReason,
  DecisionTitle,
  ExpectedResult,
  type DecisionKind,
  type DecisionPriority,
  type DecisionStatus,
} from '../../../domain/decision';
import type { DecisionRecord } from '../records/DecisionRecord';
import {
  assertRecordAndSchemaVersion,
  createNullableValueObject,
  createValueObject,
  readEntityId,
  readDayDate,
  readIsoDate,
  readNullableDayDate,
  readNullableIsoDate,
  readOptionalNullableIsoDate,
  readNullableNumber,
  readNullableString,
  readNumber,
  readOptionalNullableString,
  readOptionalString,
  readRecordArray,
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
      sphere: entity.sphere,
      price: entity.price,
      sacrifices: entity.sacrifices,
      priority: entity.priority,
      projectReference: entity.projectReference,
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
      deletedAt: toNullableIsoDate(entity.deletedAt),
      lastDeletedAt: toNullableIsoDate(entity.lastDeletedAt),
      restoredFromTrashAt: toNullableIsoDate(entity.restoredFromTrashAt),
      evidenceIds: entity.evidenceIds.map(String),
      rescheduleCount: entity.rescheduleCount,
      rescheduleHistory: entity.rescheduleHistory.map((entry) => ({
        previousPlannedDate: entry.previousPlannedDate.toString(),
        newPlannedDate: entry.newPlannedDate.toString(),
        reason: entry.reason,
        occurredAt: entry.occurredAt.toISOString(),
        sequence: entry.sequence,
      })),
      version: entity.version,
    };
  }

  public static fromRecord(record: DecisionRecord): Decision {
    assertRecordAndSchemaVersion(record);
    return Decision.rehydrate({
      id: readEntityId(record, 'id'),
      title: createValueObject(record, 'title', DecisionTitle.create),
      reason: readNullableString(record, 'reason'),
      sphere: readOptionalNullableString(record, 'sphere'),
      price: readOptionalNullableString(record, 'price'),
      sacrifices: readOptionalNullableString(record, 'sacrifices'),
      priority: readOptionalString(
        record,
        'priority',
        DECISION_PRIORITY.normal,
      ) as DecisionPriority,
      projectReference: readOptionalNullableString(record, 'projectReference'),
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
      deletedAt: readOptionalNullableIsoDate(record, 'deletedAt'),
      lastDeletedAt: readOptionalNullableIsoDate(record, 'lastDeletedAt'),
      restoredFromTrashAt: readOptionalNullableIsoDate(record, 'restoredFromTrashAt'),
      evidenceIds: readStringArray(record, 'evidenceIds').map((value) =>
        readEntityId({ evidenceId: value }, 'evidenceId'),
      ),
      rescheduleCount: readNumber(record, 'rescheduleCount'),
      rescheduleHistory: readRescheduleHistory(record),
      version: readNumber(record, 'version'),
    });
  }
}

function readRescheduleHistory(record: DecisionRecord) {
  if (record.rescheduleHistory === undefined) {
    return [];
  }

  return readRecordArray({ rescheduleHistory: record.rescheduleHistory }, 'rescheduleHistory').map(
    (entry) => ({
      previousPlannedDate: readDayDate(entry, 'previousPlannedDate'),
      newPlannedDate: readDayDate(entry, 'newPlannedDate'),
      reason: readString(entry, 'reason'),
      occurredAt: readIsoDate(entry, 'occurredAt'),
      sequence: readNumber(entry, 'sequence'),
    }),
  );
}
