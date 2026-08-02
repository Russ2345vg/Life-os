import {
  ActionSession,
  PauseInterval,
  SessionResultNote,
  type ActionSessionStatus,
  type SessionCompletionKind,
} from '../../../domain/action-session';
import { DomainError } from '../../../shared/errors/DomainError';
import type { ActionSessionRecord } from '../records/ActionSessionRecord';
import {
  assertRecordAndSchemaVersion,
  createNullableValueObject,
  invalidRecord,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableString,
  readNumber,
  readRecordArray,
  readString,
  toNullableIsoDate,
} from './RecordMapperSupport';

export class ActionSessionRecordMapper {
  public static toRecord(entity: ActionSession): ActionSessionRecord {
    return {
      schemaVersion: 1,
      id: entity.id.toString(),
      lifeActionId: entity.lifeActionId.toString(),
      status: entity.status,
      startedAt: entity.startedAt.toISOString(),
      pausedAt: toNullableIsoDate(entity.pausedAt),
      completedAt: toNullableIsoDate(entity.completedAt),
      completionKind: entity.completionKind,
      resultNote: entity.resultNote?.toString() ?? null,
      pauseIntervals: entity.pauseIntervals.map((interval) => ({
        startedAt: interval.startedAt.toISOString(),
        endedAt: interval.endedAt.toISOString(),
      })),
      version: entity.version,
    };
  }

  public static fromRecord(record: ActionSessionRecord): ActionSession {
    assertRecordAndSchemaVersion(record);
    const pauseIntervals = readRecordArray(record, 'pauseIntervals').map((interval) => {
      try {
        return PauseInterval.create(
          readIsoDate(interval, 'startedAt'),
          readIsoDate(interval, 'endedAt'),
        );
      } catch (error: unknown) {
        if (error instanceof DomainError && error.code === 'persistence.invalid_date') {
          throw error;
        }
        throw invalidRecord('Поле pauseIntervals содержит некорректный интервал.', error);
      }
    });

    const completionKind = readNullableString(record, 'completionKind');
    return ActionSession.rehydrate({
      id: readEntityId(record, 'id'),
      lifeActionId: readEntityId(record, 'lifeActionId'),
      status: readString(record, 'status') as ActionSessionStatus,
      startedAt: readIsoDate(record, 'startedAt'),
      pausedAt: readNullableIsoDate(record, 'pausedAt'),
      completedAt: readNullableIsoDate(record, 'completedAt'),
      completionKind: completionKind as SessionCompletionKind | null,
      resultNote: createNullableValueObject(record, 'resultNote', SessionResultNote.create),
      pauseIntervals,
      version: readNumber(record, 'version'),
    });
  }
}
