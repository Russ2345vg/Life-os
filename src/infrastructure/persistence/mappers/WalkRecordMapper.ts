import {
  MAX_WALK_PHOTO_BYTES,
  Walk,
  WALK_STATUS,
  isWalkMode,
  isWalkStatus,
  isWalkType,
  type WalkPhoto,
} from '../../../domain';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableNumber,
  readNullableString,
  readNumber,
  readOptionalNullableEntityId,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';
import type { WalkRecord } from '../records/WalkRecord';

export class WalkRecordMapper {
  public static toRecord(walk: Walk): WalkRecord {
    return {
      schemaVersion: 1,
      id: walk.id.toString(),
      date: walk.date.toString(),
      type: walk.type,
      sphereId: walk.sphereId?.toString() ?? null,
      status: walk.status,
      mode: walk.mode,
      startedAt: walk.startedAt?.toISOString() ?? null,
      endedAt: walk.endedAt?.toISOString() ?? null,
      timerTargetMinutes: walk.timerTargetMinutes,
      reflectionQuestion: walk.reflectionQuestion,
      result: walk.result,
      photo: walk.photo,
      createdAt: walk.createdAt.toISOString(),
      updatedAt: walk.updatedAt.toISOString(),
      version: walk.version,
    };
  }

  public static fromRecord(value: unknown): Walk {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const type = readString(record, 'type');
    if (!isWalkType(type)) {
      throw invalidRecord('Поле type содержит неизвестный тип прогулки.');
    }

    const status = Object.hasOwn(record, 'status')
      ? readString(record, 'status')
      : WALK_STATUS.planned;
    if (!isWalkStatus(status)) {
      throw invalidRecord('Поле status содержит неизвестное состояние прогулки.');
    }
    const mode = Object.hasOwn(record, 'mode') ? readNullableString(record, 'mode') : null;
    if (mode !== null && !isWalkMode(mode)) {
      throw invalidRecord('Поле mode содержит неизвестный режим прогулки.');
    }

    return Walk.rehydrate({
      id: readEntityId(record, 'id'),
      date: readDayDate(record, 'date'),
      type,
      sphereId: readOptionalNullableEntityId(record, 'sphereId'),
      status,
      mode,
      startedAt: Object.hasOwn(record, 'startedAt')
        ? readNullableIsoDate(record, 'startedAt')
        : null,
      endedAt: Object.hasOwn(record, 'endedAt') ? readNullableIsoDate(record, 'endedAt') : null,
      timerTargetMinutes: Object.hasOwn(record, 'timerTargetMinutes')
        ? readNullableNumber(record, 'timerTargetMinutes')
        : null,
      reflectionQuestion: Object.hasOwn(record, 'reflectionQuestion')
        ? readNullableString(record, 'reflectionQuestion')
        : null,
      result: Object.hasOwn(record, 'result') ? readNullableString(record, 'result') : null,
      photo: Object.hasOwn(record, 'photo') ? readPhoto(record.photo) : null,
      createdAt: readIsoDate(record, 'createdAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function readPhoto(value: unknown): WalkPhoto | null {
  if (value === null) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRecord('Поле photo должно содержать изображение или null.');
  }
  const photo = value as UnknownRecord;
  const dataUrl = readString(photo, 'dataUrl');
  const mimeType = readString(photo, 'mimeType');
  const sizeBytes = readNumber(photo, 'sizeBytes');
  if (
    !mimeType.startsWith('image/') ||
    !dataUrl.startsWith(`data:${mimeType};base64,`) ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_WALK_PHOTO_BYTES
  ) {
    throw invalidRecord('Поле photo содержит недопустимое изображение.');
  }
  return { dataUrl, mimeType, sizeBytes };
}
