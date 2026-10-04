import { WalkCapture } from '../../../domain';
import { isWalkReflectionStage } from '../../../domain/walk/WalkReflectionTemplate';
import type { WalkCaptureRecord } from '../records/WalkCaptureRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNumber,
  readString,
  readOptionalNullableEntityId,
} from './RecordMapperSupport';

export class WalkCaptureRecordMapper {
  public static toRecord(capture: WalkCapture): WalkCaptureRecord {
    return {
      resultActionId: capture.resultActionId?.toString() ?? null,
      schemaVersion: 1,
      id: capture.id.toString(),
      walkId: capture.walkId.toString(),
      type: capture.type,
      content: capture.content,
      ...(capture.promptStage === null ? {} : { promptStage: capture.promptStage }),
      capturedAt: capture.capturedAt.toISOString(),
      walkElapsedMs: capture.walkElapsedMs,
      status: capture.status,
      createdAt: capture.createdAt.toISOString(),
      updatedAt: capture.updatedAt.toISOString(),
      version: capture.version,
    };
  }

  public static fromRecord(value: unknown): WalkCapture {
    assertRecordAndSchemaVersion(value);
    const type = readString(value, 'type');
    const status = readString(value, 'status');
    if (type !== 'text' || (status !== 'pending' && status !== 'processed')) {
      throw invalidRecord('Неизвестный тип или статус сохранённой мысли.');
    }
    const promptStage = Object.hasOwn(value, 'promptStage') ? value.promptStage : null;
    if (promptStage !== null && !isWalkReflectionStage(promptStage))
      throw invalidRecord('Поле promptStage содержит неизвестный вопрос.');
    return WalkCapture.rehydrate({
      resultActionId: readOptionalNullableEntityId(value, 'resultActionId'),
      id: readEntityId(value, 'id'),
      walkId: readEntityId(value, 'walkId'),
      type,
      content: readString(value, 'content'),
      promptStage,
      capturedAt: readIsoDate(value, 'capturedAt'),
      walkElapsedMs: readNumber(value, 'walkElapsedMs'),
      status,
      createdAt: readIsoDate(value, 'createdAt'),
      updatedAt: readIsoDate(value, 'updatedAt'),
      version: readNumber(value, 'version'),
    });
  }
}
