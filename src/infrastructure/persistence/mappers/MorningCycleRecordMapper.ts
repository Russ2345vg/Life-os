import {
  MORNING_CYCLE_STATE,
  MorningCycle,
  isMorningCycleState,
  isMorningPhysicalStatus,
  isMorningStageStatus,
  type MorningCycleState,
  type MorningStageState,
} from '../../../domain';
import type { MorningCycleRecord } from '../records/MorningCycleRecord';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readBoolean,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNullableNumber,
  readNumber,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class MorningCycleRecordMapper {
  public static toRecord(cycle: MorningCycle): MorningCycleRecord {
    return {
      schemaVersion: 1,
      id: cycle.id.toString(),
      dayId: cycle.dayId.toString(),
      dateKey: cycle.dateKey.toString(),
      state: cycle.state,
      startedAt: cycle.startedAt?.toISOString() ?? null,
      finishedAt: cycle.finishedAt?.toISOString() ?? null,
      shortenedMode: cycle.shortenedMode,
      stageStates: cycle.stageStates.map((stage) => ({
        stageId: stage.stageId,
        status: stage.status,
        updatedAt: stage.updatedAt?.toISOString() ?? null,
      })),
      waterCompletedAt: cycle.waterCompletedAt?.toISOString() ?? null,
      waterAmountMl: cycle.waterAmountMl,
      physicalStatus: cycle.physicalStatus,
      physicalUpdatedAt: cycle.physicalUpdatedAt?.toISOString() ?? null,
      updatedAt: cycle.updatedAt.toISOString(),
      version: cycle.version,
    };
  }

  public static fromRecord(value: unknown): MorningCycle {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const physicalStatus = readString(record, 'physicalStatus');
    if (!isMorningPhysicalStatus(physicalStatus)) {
      throw invalidRecord('Поле physicalStatus содержит неизвестное состояние.');
    }
    const startedAt = readNullableIsoDate(record, 'startedAt');
    return MorningCycle.rehydrate({
      id: readEntityId(record, 'id'),
      dayId: readEntityId(record, 'dayId'),
      dateKey: readDayDate(record, 'dateKey'),
      state: readOptionalState(record, startedAt),
      startedAt,
      finishedAt: readOptionalNullableDate(record, 'finishedAt'),
      shortenedMode: readOptionalNullableBoolean(record, 'shortenedMode', false),
      stageStates: readOptionalStageStates(record),
      waterCompletedAt: readNullableIsoDate(record, 'waterCompletedAt'),
      waterAmountMl: readNullableNumber(record, 'waterAmountMl'),
      physicalStatus,
      physicalUpdatedAt: readNullableIsoDate(record, 'physicalUpdatedAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      version: readNumber(record, 'version'),
    });
  }
}

function readOptionalState(record: UnknownRecord, startedAt: Date | null): MorningCycleState {
  if (!Object.hasOwn(record, 'state') || record.state === null) {
    return startedAt === null ? MORNING_CYCLE_STATE.notStarted : MORNING_CYCLE_STATE.inProgress;
  }
  const state = readString(record, 'state');
  if (!isMorningCycleState(state)) {
    throw invalidRecord('Поле state содержит неизвестное состояние.');
  }
  return state;
}

function readOptionalNullableDate(record: UnknownRecord, field: string): Date | null {
  if (!Object.hasOwn(record, field)) return null;
  return readNullableIsoDate(record, field);
}

function readOptionalNullableBoolean(
  record: UnknownRecord,
  field: string,
  fallback: boolean,
): boolean {
  if (!Object.hasOwn(record, field) || record[field] === null) return fallback;
  return readBoolean(record, field);
}

function readOptionalStageStates(record: UnknownRecord): ReadonlyArray<MorningStageState> {
  if (!Object.hasOwn(record, 'stageStates') || record.stageStates === null) return [];
  if (!Array.isArray(record.stageStates)) {
    throw invalidRecord('Поле stageStates должно быть массивом объектов.');
  }

  return record.stageStates.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalidRecord('Поле stageStates должно быть массивом объектов.');
    }
    const stage = value as UnknownRecord;
    const status = readString(stage, 'status');
    if (!isMorningStageStatus(status)) {
      throw invalidRecord('Поле stageStates содержит неизвестное состояние этапа.');
    }
    return {
      stageId: readString(stage, 'stageId'),
      status,
      updatedAt: readNullableIsoDate(stage, 'updatedAt'),
    };
  });
}
