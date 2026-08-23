import {
  isRecommendationApplicationStatus,
  isRecommendationApplicationTargetType,
  type RecommendationApplication,
} from '../../../application';
import type { RecommendationApplicationRecord } from '../records/RecommendationApplicationRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readIsoDate,
  readNullableIsoDate,
  readNullableString,
  readNumber,
  readString,
  toNullableIsoDate,
} from './RecordMapperSupport';

export class RecommendationApplicationRecordMapper {
  public static toRecord(application: RecommendationApplication): RecommendationApplicationRecord {
    return {
      schemaVersion: 1,
      id: application.recommendationId,
      status: application.status,
      targetType: application.targetType,
      targetId: application.targetId,
      resultMessage: application.resultMessage,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
      appliedAt: toNullableIsoDate(application.appliedAt),
      dismissedAt: toNullableIsoDate(application.dismissedAt),
      version: application.version,
    };
  }

  public static fromRecord(value: unknown): RecommendationApplication {
    assertRecordAndSchemaVersion(value);
    const status = readString(value, 'status');
    const targetType = readNullableString(value, 'targetType');
    if (!isRecommendationApplicationStatus(status)) {
      throw invalidRecord('Неизвестный статус применения рекомендации.');
    }
    if (targetType !== null && !isRecommendationApplicationTargetType(targetType)) {
      throw invalidRecord('Неизвестный тип цели рекомендации.');
    }
    return Object.freeze({
      recommendationId: readString(value, 'id'),
      status,
      targetType,
      targetId: readNullableString(value, 'targetId'),
      resultMessage: readNullableString(value, 'resultMessage'),
      createdAt: readIsoDate(value, 'createdAt'),
      updatedAt: readIsoDate(value, 'updatedAt'),
      appliedAt: readNullableIsoDate(value, 'appliedAt'),
      dismissedAt: readNullableIsoDate(value, 'dismissedAt'),
      version: readNumber(value, 'version'),
    });
  }
}
