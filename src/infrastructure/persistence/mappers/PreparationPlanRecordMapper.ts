import {
  PreparationItem,
  PreparationPlan,
  isPreparationCategory,
  isPreparationItemStatus,
  isPreparationPlanStatus,
  isPreparationSourceType,
} from '../../../domain';
import { isPreparationArea, PREPARATION_AREA } from '../../../domain/preparation';
import type {
  PreparationItemRecord,
  PreparationPlanRecord,
} from '../records/PreparationPlanRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readBoolean,
  readEntityId,
  readIsoDate,
  readNullableEntityId,
  readNullableIsoDate,
  readNullableString,
  readNumber,
  readRecordArray,
  readString,
  readStringArray,
  type UnknownRecord,
} from './RecordMapperSupport';

export class PreparationPlanRecordMapper {
  public static toRecord(plan: PreparationPlan): PreparationPlanRecord {
    return {
      schemaVersion: 1,
      id: plan.id.toString(),
      cycleId: plan.cycleId.toString(),
      tomorrowPlanId: plan.tomorrowPlanId.toString(),
      targetDayId: plan.targetDayId.toString(),
      items: plan.items.map(toItemRecord),
      requiredCoreKeys: plan.requiredCoreKeys,
      sourceVersion: plan.sourceVersion,
      generationSignature: plan.generationSignature,
      status: plan.status,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      completedAt: plan.completedAt?.toISOString() ?? null,
      version: plan.version,
    };
  }

  public static fromRecord(value: unknown): PreparationPlan {
    assertRecordAndSchemaVersion(value);
    const status = readString(value, 'status');
    const requiredCoreKeys =
      !Object.hasOwn(value, 'requiredCoreKeys') || value.requiredCoreKeys === null
        ? null
        : readStringArray(value, 'requiredCoreKeys');
    if (!isPreparationPlanStatus(status)) throw invalidRecord('Неизвестный статус подготовки.');
    return PreparationPlan.rehydrate({
      id: readEntityId(value, 'id'),
      cycleId: readEntityId(value, 'cycleId'),
      tomorrowPlanId: readEntityId(value, 'tomorrowPlanId'),
      targetDayId: readEntityId(value, 'targetDayId'),
      items: readRecordArray(value, 'items').map(fromItemRecord),
      requiredCoreKeys,
      sourceVersion: readNumber(value, 'sourceVersion'),
      generationSignature: readString(value, 'generationSignature'),
      status,
      createdAt: readIsoDate(value, 'createdAt'),
      updatedAt: readIsoDate(value, 'updatedAt'),
      completedAt: readNullableIsoDate(value, 'completedAt'),
      version: readNumber(value, 'version'),
    });
  }
}

function toItemRecord(item: PreparationItem): PreparationItemRecord {
  return {
    id: item.id.toString(),
    planId: item.planId.toString(),
    key: item.key,
    area: item.area,
    category: item.category,
    title: item.title,
    sourceType: item.sourceType,
    sourceId: item.sourceId?.toString() ?? null,
    required: item.required,
    recommendedDurationMinutes: item.recommendedDurationMinutes,
    status: item.status,
    active: item.active,
    completedAt: item.completedAt?.toISOString() ?? null,
    skippedAt: item.skippedAt?.toISOString() ?? null,
    skipReason: item.skipReason,
  };
}

function fromItemRecord(record: UnknownRecord): PreparationItem {
  const area = Object.hasOwn(record, 'area')
    ? readString(record, 'area')
    : PREPARATION_AREA.tomorrowStart;
  const category = readString(record, 'category');
  const status = readString(record, 'status');
  const sourceType = readString(record, 'sourceType');
  if (!isPreparationArea(area)) throw invalidRecord('Неизвестная область подготовки.');
  if (!isPreparationCategory(category)) throw invalidRecord('Неизвестная категория подготовки.');
  if (!isPreparationItemStatus(status)) throw invalidRecord('Неизвестный статус пункта.');
  if (!isPreparationSourceType(sourceType)) throw invalidRecord('Неизвестный источник пункта.');
  return PreparationItem.rehydrate({
    id: readEntityId(record, 'id'),
    planId: readEntityId(record, 'planId'),
    key: readString(record, 'key'),
    area,
    category,
    title: readString(record, 'title'),
    sourceType,
    sourceId: readNullableEntityId(record, 'sourceId'),
    required: readBoolean(record, 'required'),
    recommendedDurationMinutes:
      Object.hasOwn(record, 'recommendedDurationMinutes') &&
      record.recommendedDurationMinutes !== null
        ? readNumber(record, 'recommendedDurationMinutes')
        : null,
    status,
    active: readBoolean(record, 'active'),
    completedAt: readNullableIsoDate(record, 'completedAt'),
    skippedAt: readNullableIsoDate(record, 'skippedAt'),
    skipReason: readNullableString(record, 'skipReason'),
  });
}
