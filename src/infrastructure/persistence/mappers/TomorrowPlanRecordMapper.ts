import {
  TOMORROW_PLANNING_QUALITY,
  TomorrowPlan,
  isTomorrowPlanningQuality,
  isTomorrowPlanStatus,
} from '../../../domain';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNumber,
  readNullableString,
  readString,
  readStringArray,
  type UnknownRecord,
} from './RecordMapperSupport';
import { EntityId } from '../../../domain/shared/EntityId';
import type { TomorrowPlanRecord } from '../records/TomorrowPlanRecord';

export class TomorrowPlanRecordMapper {
  public static toRecord(plan: TomorrowPlan): TomorrowPlanRecord {
    return {
      schemaVersion: 1,
      id: plan.id.toString(),
      cycleId: plan.cycleId.toString(),
      sourceDayId: plan.sourceDayId.toString(),
      targetDayId: plan.targetDayId.toString(),
      targetDateKey: plan.targetDateKey.toString(),
      directionId: plan.directionId?.toString() ?? null,
      vector: plan.vector,
      primaryDecisionId: plan.primaryDecisionId?.toString() ?? null,
      minimumOutcome: plan.minimumOutcome,
      targetOutcome: plan.targetOutcome,
      stretchOutcome: plan.stretchOutcome,
      firstActionId: plan.firstActionId?.toString() ?? null,
      firstAttentionItem: plan.firstAttentionItem,
      planningQuality: plan.planningQuality,
      supportingDecisionIds: plan.supportingDecisionIds.map((id) => id.toString()),
      status: plan.status,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      completedAt: plan.completedAt?.toISOString() ?? null,
      version: plan.version,
    };
  }

  public static fromRecord(value: unknown): TomorrowPlan {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const status = readString(record, 'status');
    if (!isTomorrowPlanStatus(status)) {
      throw invalidRecord('Поле status содержит неизвестный статус плана завтра.');
    }
    const planningQuality =
      record.planningQuality === undefined
        ? TOMORROW_PLANNING_QUALITY.full
        : readString(record, 'planningQuality');
    if (!isTomorrowPlanningQuality(planningQuality)) {
      throw invalidRecord('Поле planningQuality содержит неизвестное качество плана.');
    }
    return TomorrowPlan.rehydrate({
      id: readEntityId(record, 'id'),
      cycleId: readEntityId(record, 'cycleId'),
      sourceDayId: readEntityId(record, 'sourceDayId'),
      targetDayId: readEntityId(record, 'targetDayId'),
      targetDateKey: readDayDate(record, 'targetDateKey'),
      directionId: optionalEntityId(record, 'directionId'),
      vector: readNullableString(record, 'vector'),
      primaryDecisionId: optionalEntityId(record, 'primaryDecisionId'),
      minimumOutcome: readNullableString(record, 'minimumOutcome'),
      targetOutcome: readNullableString(record, 'targetOutcome'),
      stretchOutcome: readNullableString(record, 'stretchOutcome'),
      firstActionId: optionalEntityId(record, 'firstActionId'),
      firstAttentionItem:
        record.firstAttentionItem === undefined
          ? null
          : readNullableString(record, 'firstAttentionItem'),
      planningQuality,
      supportingDecisionIds: readStringArray(record, 'supportingDecisionIds').map(EntityId.create),
      status,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      completedAt: readNullableIsoDate(record, 'completedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function optionalEntityId(record: UnknownRecord, field: string): EntityId | null {
  const value = readNullableString(record, field);
  return value === null ? null : EntityId.create(value);
}
