import {
  Goal,
  MAX_GOAL_COVER_IMAGE_BYTES,
  isGoalHorizon,
  isGoalIntentionLevel,
  isGoalProgressType,
  isGoalQualitativeStage,
  isGoalStage,
  isGoalStatus,
  type GoalCoverImage,
  type GoalHorizon,
  type GoalIntentionLevel,
  type GoalProgress,
  type GoalProgressType,
} from '../../../domain';
import type { GoalRecord } from '../records/GoalRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableString,
  readNumber,
  readOptionalNullableEntityId,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class GoalRecordMapper {
  public static toRecord(goal: Goal): GoalRecord {
    return {
      schemaVersion: 1,
      id: goal.id.toString(),
      directionId: goal.directionId?.toString() ?? null,
      title: goal.title,
      description: goal.description,
      whyImportant: goal.whyImportant,
      whyNow: goal.whyNow,
      status: goal.status,
      stage: goal.stage,
      intentionLevel: goal.intentionLevel,
      horizon: goal.horizon,
      progressType: goal.progressType,
      progress: goal.progress,
      achievementCriteria: goal.achievementCriteria,
      nextProgress: goal.nextProgress,
      coverImage: goal.coverImage,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      archivedAt: goal.archivedAt?.toISOString() ?? null,
      version: goal.version,
    };
  }

  public static fromRecord(value: unknown): Goal {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const status = readString(record, 'status');
    if (!isGoalStatus(status)) throw invalidRecord('Неизвестное состояние цели.');
    const stage = readString(record, 'stage');
    if (!isGoalStage(stage)) throw invalidRecord('Неизвестная стадия цели.');
    const intentionLevel = readOptionalIntentionLevel(record);
    const horizon = readOptionalHorizon(record);
    const progressType = readOptionalProgressType(record);

    return Goal.rehydrate({
      id: readEntityId(record, 'id'),
      directionId: readOptionalNullableEntityId(record, 'directionId'),
      title: readString(record, 'title'),
      description: readNullableString(record, 'description'),
      whyImportant: readNullableString(record, 'whyImportant'),
      whyNow: readNullableString(record, 'whyNow'),
      status,
      stage,
      intentionLevel,
      horizon,
      progress: readProgress(record, progressType),
      achievementCriteria: readNullableString(record, 'achievementCriteria'),
      nextProgress: readNullableString(record, 'nextProgress'),
      coverImage: readCoverImage(record),
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      archivedAt: readNullableIsoDate(record, 'archivedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function readOptionalIntentionLevel(record: UnknownRecord): GoalIntentionLevel | null {
  const value = readNullableString(record, 'intentionLevel');
  if (value !== null && !isGoalIntentionLevel(value)) {
    throw invalidRecord('Неизвестный уровень намерения цели.');
  }
  return value;
}

function readOptionalHorizon(record: UnknownRecord): GoalHorizon | null {
  const value = readNullableString(record, 'horizon');
  if (value !== null && !isGoalHorizon(value)) {
    throw invalidRecord('Неизвестный горизонт цели.');
  }
  return value;
}

function readOptionalProgressType(record: UnknownRecord): GoalProgressType | null {
  const value = readNullableString(record, 'progressType');
  if (value !== null && !isGoalProgressType(value)) {
    throw invalidRecord('Неизвестный тип прогресса цели.');
  }
  return value;
}

function readProgress(
  record: UnknownRecord,
  progressType: GoalProgressType | null,
): GoalProgress | null {
  if (!Object.hasOwn(record, 'progress')) {
    throw invalidRecord('В записи отсутствует обязательное поле progress.');
  }
  const value = record.progress;
  if (progressType === null) {
    if (value !== null) throw invalidRecord('Прогресс без типа недопустим.');
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRecord('Поле progress должно содержать объект выбранного типа.');
  }
  const progress = value as UnknownRecord;
  const storedType = readString(progress, 'type');
  if (storedType !== progressType) {
    throw invalidRecord('Тип прогресса не совпадает с его данными.');
  }
  if (progressType === 'metric') {
    return {
      type: progressType,
      current: readNumber(progress, 'current'),
      target: readNumber(progress, 'target'),
      unit: readString(progress, 'unit'),
    };
  }
  if (progressType === 'milestones') {
    return {
      type: progressType,
      completed: readNumber(progress, 'completed'),
      total: readNumber(progress, 'total'),
    };
  }
  const qualitativeStage = readString(progress, 'stage');
  if (!isGoalQualitativeStage(qualitativeStage)) {
    throw invalidRecord('Неизвестная качественная стадия прогресса.');
  }
  return { type: progressType, stage: qualitativeStage };
}

function readCoverImage(record: UnknownRecord): GoalCoverImage | null {
  if (!Object.hasOwn(record, 'coverImage')) {
    throw invalidRecord('В записи отсутствует обязательное поле coverImage.');
  }
  const value = record.coverImage;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRecord('Поле coverImage должно содержать изображение или null.');
  }
  const image = value as UnknownRecord;
  const dataUrl = readString(image, 'dataUrl');
  const mimeType = readString(image, 'mimeType');
  const sizeBytes = readNumber(image, 'sizeBytes');
  if (
    !mimeType.startsWith('image/') ||
    !dataUrl.startsWith(`data:${mimeType};base64,`) ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_GOAL_COVER_IMAGE_BYTES
  ) {
    throw invalidRecord('Поле coverImage содержит недопустимое изображение.');
  }
  return { dataUrl, mimeType, sizeBytes };
}
