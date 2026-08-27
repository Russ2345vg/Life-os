import { WalkCapture } from '../../../domain';
import type { WalkCaptureRecord } from '../records/WalkCaptureRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNumber,
  readString,
} from './RecordMapperSupport';

export class WalkCaptureRecordMapper {
  public static toRecord(capture: WalkCapture): WalkCaptureRecord {
    return {
      schemaVersion: 1,
      id: capture.id.toString(),
      walkId: capture.walkId.toString(),
      type: capture.type,
      content: capture.content,
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
    return WalkCapture.rehydrate({
      id: readEntityId(value, 'id'),
      walkId: readEntityId(value, 'walkId'),
      type,
      content: readString(value, 'content'),
      capturedAt: readIsoDate(value, 'capturedAt'),
      walkElapsedMs: readNumber(value, 'walkElapsedMs'),
      status,
      createdAt: readIsoDate(value, 'createdAt'),
      updatedAt: readIsoDate(value, 'updatedAt'),
      version: readNumber(value, 'version'),
    });
  }
}
