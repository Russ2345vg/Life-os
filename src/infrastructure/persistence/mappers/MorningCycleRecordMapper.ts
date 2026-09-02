import {
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_SET_STATUS,
  MORNING_SHORTENED_ACTION,
  MorningCycle,
  MorningPhysicalExecution,
  isExerciseMeasurementType,
  isMorningCycleState,
  isMorningPhysicalStatus,
  isMorningStageStatus,
  isMorningShortenedModeState,
  type MorningCycleState,
  type MorningPhysicalSetExecution,
  type MorningPhysicalPlanItem,
  type MorningStageState,
  type MorningShortenedConfiguration,
  type MorningShortenedModeState,
} from '../../../domain';
import type {
  MorningCycleRecord,
  MorningPhysicalExecutionRecord,
  MorningPhysicalSetExecutionRecord,
} from '../records/MorningCycleRecord';
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
  readRecordArray,
  readString,
  type UnknownRecord,
} from './RecordMapperSupport';

export class MorningCycleRecordMapper {
  public static toRecord(cycle: MorningCycle): MorningCycleRecord {
    const physicalExecution = cycle.physicalExecution;
    return {
      schemaVersion: 1,
      id: cycle.id.toString(),
      dayId: cycle.dayId.toString(),
      dateKey: cycle.dateKey.toString(),
      state: cycle.state,
      startedAt: cycle.startedAt?.toISOString() ?? null,
      finishedAt: cycle.finishedAt?.toISOString() ?? null,
      startState:
        cycle.startState === null
          ? null
          : {
              energy: cycle.startState.energy,
              clarity: cycle.startState.clarity,
              mood: cycle.startState.mood,
              recordedAt: cycle.startState.recordedAt.toISOString(),
            },
      shortenedMode: cycle.shortenedMode,
      shortenedModeState: cycle.shortenedModeState,
      shortenedConfiguration: cycle.shortenedConfiguration,
      stageStates: cycle.stageStates.map((stage) => ({
        stageId: stage.stageId,
        status: stage.status,
        updatedAt: stage.updatedAt?.toISOString() ?? null,
      })),
      waterCompletedAt: cycle.waterCompletedAt?.toISOString() ?? null,
      waterAmountMl: cycle.waterAmountMl,
      physicalStatus: cycle.physicalStatus,
      physicalUpdatedAt: cycle.physicalUpdatedAt?.toISOString() ?? null,
      physicalPlanItems: cycle.physicalPlanItems.map((item) =>
        item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? {
              exerciseDefinitionId: item.exerciseDefinitionId.toString(),
              measurementType: item.measurementType,
              sets: item.sets,
              targetReps: item.targetReps,
            }
          : {
              exerciseDefinitionId: item.exerciseDefinitionId.toString(),
              measurementType: item.measurementType,
              sets: item.sets,
              targetDurationSeconds: item.targetDurationSeconds,
            },
      ),
      physicalExecution:
        physicalExecution === null ? null : toPhysicalExecutionRecord(physicalExecution),
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
    const physicalExecution = readOptionalPhysicalExecution(record);
    const shortenedModeState = readOptionalShortenedModeState(record);
    const shortenedConfiguration = readOptionalShortenedConfiguration(record);
    const startState = readOptionalStartState(record);
    try {
      return MorningCycle.rehydrate({
        id: readEntityId(record, 'id'),
        dayId: readEntityId(record, 'dayId'),
        dateKey: readDayDate(record, 'dateKey'),
        state: readOptionalState(record, startedAt),
        startedAt,
        finishedAt: readOptionalNullableDate(record, 'finishedAt'),
        startState,
        shortenedMode: readOptionalNullableBoolean(record, 'shortenedMode', false),
        ...(shortenedModeState === undefined ? {} : { shortenedModeState }),
        ...(shortenedConfiguration === undefined ? {} : { shortenedConfiguration }),
        stageStates: readOptionalStageStates(record),
        waterCompletedAt: readNullableIsoDate(record, 'waterCompletedAt'),
        waterAmountMl: readNullableNumber(record, 'waterAmountMl'),
        physicalStatus,
        physicalUpdatedAt: readNullableIsoDate(record, 'physicalUpdatedAt'),
        physicalPlanItems: readOptionalPhysicalPlanItems(record),
        physicalExecution,
        updatedAt: readIsoDate(record, 'updatedAt'),
        version: readNumber(record, 'version'),
      });
    } catch (error: unknown) {
      if (physicalExecution !== null) {
        throw invalidRecord('Поле physicalExecution содержит несогласованные данные.', error);
      }
      throw error;
    }
  }
}

function toPhysicalExecutionRecord(
  execution: MorningPhysicalExecution,
): MorningPhysicalExecutionRecord {
  return {
    startedAt: execution.startedAt.toISOString(),
    completedAt: execution.completedAt?.toISOString() ?? null,
    pausedAt: execution.pausedAt?.toISOString() ?? null,
    pauseIntervals: execution.pauseIntervals.map((interval) => ({
      startedAt: interval.startedAt.toISOString(),
      endedAt: interval.endedAt.toISOString(),
    })),
    activeSetIndex: execution.activeSetIndex,
    sets: execution.sets.map(toPhysicalSetExecutionRecord),
    suppressedSetIndexes: execution.suppressedSetIndexes,
    pendingRemainingSetStrategy: execution.pendingRemainingSetStrategy,
  };
}

function toPhysicalSetExecutionRecord(
  set: MorningPhysicalSetExecution,
): MorningPhysicalSetExecutionRecord {
  const common = {
    exerciseDefinitionId: set.exerciseDefinitionId.toString(),
    setNumber: set.setNumber,
    measurementType: set.measurementType,
  };
  if (set.status === MORNING_PHYSICAL_SET_STATUS.skipped) {
    return {
      ...common,
      status: set.status,
      resolvedAt: set.resolvedAt.toISOString(),
    };
  }
  if (set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
    return set.status === MORNING_PHYSICAL_SET_STATUS.pending
      ? {
          ...common,
          measurementType: set.measurementType,
          status: set.status,
          actualReps: null,
          resolvedAt: null,
        }
      : {
          ...common,
          measurementType: set.measurementType,
          status: set.status,
          actualReps: set.actualReps,
          resolvedAt: set.resolvedAt.toISOString(),
        };
  }
  return set.status === MORNING_PHYSICAL_SET_STATUS.pending
    ? {
        ...common,
        measurementType: set.measurementType,
        status: set.status,
        actualDurationSeconds: null,
        resolvedAt: null,
      }
    : {
        ...common,
        measurementType: set.measurementType,
        status: set.status,
        actualDurationSeconds: set.actualDurationSeconds,
        resolvedAt: set.resolvedAt.toISOString(),
      };
}

function readOptionalPhysicalExecution(record: UnknownRecord): MorningPhysicalExecution | null {
  if (!Object.hasOwn(record, 'physicalExecution') || record.physicalExecution === null) return null;
  if (typeof record.physicalExecution !== 'object' || Array.isArray(record.physicalExecution)) {
    throw invalidRecord('Поле physicalExecution должно быть объектом или null.');
  }
  const execution = record.physicalExecution as UnknownRecord;
  try {
    return MorningPhysicalExecution.rehydrate({
      startedAt: readIsoDate(execution, 'startedAt'),
      completedAt: readNullableIsoDate(execution, 'completedAt'),
      pausedAt: readNullableIsoDate(execution, 'pausedAt'),
      pauseIntervals: readRecordArray(execution, 'pauseIntervals').map((interval) => ({
        startedAt: readIsoDate(interval, 'startedAt'),
        endedAt: readIsoDate(interval, 'endedAt'),
      })),
      activeSetIndex: readNumber(execution, 'activeSetIndex'),
      sets: readRecordArray(execution, 'sets').map(readPhysicalSetExecution),
      suppressedSetIndexes: readOptionalNumberArray(execution, 'suppressedSetIndexes'),
      pendingRemainingSetStrategy: readOptionalRemainingSetStrategy(execution),
    });
  } catch (error: unknown) {
    throw invalidRecord('Поле physicalExecution содержит некорректные данные.', error);
  }
}

function readPhysicalSetExecution(set: UnknownRecord): MorningPhysicalSetExecution {
  const exerciseDefinitionId = readEntityId(set, 'exerciseDefinitionId');
  const setNumber = readNumber(set, 'setNumber');
  const measurementType = readString(set, 'measurementType');
  if (!isExerciseMeasurementType(measurementType)) {
    throw invalidRecord('Поле physicalExecution содержит неизвестный тип измерения.');
  }
  const status = readString(set, 'status');
  const common = { exerciseDefinitionId, setNumber, measurementType };
  if (status === MORNING_PHYSICAL_SET_STATUS.skipped) {
    if (Object.hasOwn(set, 'actualReps') || Object.hasOwn(set, 'actualDurationSeconds')) {
      throw invalidRecord('Пропущенный подход не должен содержать фактический результат.');
    }
    return {
      ...common,
      status,
      resolvedAt: readIsoDate(set, 'resolvedAt'),
    };
  }
  if (
    status !== MORNING_PHYSICAL_SET_STATUS.pending &&
    status !== MORNING_PHYSICAL_SET_STATUS.completed
  ) {
    throw invalidRecord('Поле physicalExecution содержит неизвестное состояние подхода.');
  }
  if (measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
    if (Object.hasOwn(set, 'actualDurationSeconds')) {
      throw invalidRecord('Подход содержит несовместимый фактический результат.');
    }
    return status === MORNING_PHYSICAL_SET_STATUS.pending
      ? {
          ...common,
          measurementType,
          status,
          actualReps: readNull(set, 'actualReps'),
          resolvedAt: readNull(set, 'resolvedAt'),
        }
      : {
          ...common,
          measurementType,
          status,
          actualReps: readNumber(set, 'actualReps'),
          resolvedAt: readIsoDate(set, 'resolvedAt'),
        };
  }
  if (Object.hasOwn(set, 'actualReps')) {
    throw invalidRecord('Подход содержит несовместимый фактический результат.');
  }
  return status === MORNING_PHYSICAL_SET_STATUS.pending
    ? {
        ...common,
        measurementType,
        status,
        actualDurationSeconds: readNull(set, 'actualDurationSeconds'),
        resolvedAt: readNull(set, 'resolvedAt'),
      }
    : {
        ...common,
        measurementType,
        status,
        actualDurationSeconds: readNumber(set, 'actualDurationSeconds'),
        resolvedAt: readIsoDate(set, 'resolvedAt'),
      };
}

function readNull(record: UnknownRecord, field: string): null {
  if (!Object.hasOwn(record, field) || record[field] !== null) {
    throw invalidRecord(`Поле ${field} должно содержать null.`);
  }
  return null;
}

function readOptionalPhysicalPlanItems(record: UnknownRecord): readonly MorningPhysicalPlanItem[] {
  if (!Object.hasOwn(record, 'physicalPlanItems') || record.physicalPlanItems === null) return [];
  if (!Array.isArray(record.physicalPlanItems)) {
    throw invalidRecord('Поле physicalPlanItems должно быть массивом объектов.');
  }

  return record.physicalPlanItems.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalidRecord('Поле physicalPlanItems должно быть массивом объектов.');
    }
    const item = value as UnknownRecord;
    const measurementType = readString(item, 'measurementType');
    if (!isExerciseMeasurementType(measurementType)) {
      throw invalidRecord('Поле physicalPlanItems содержит неизвестный тип измерения.');
    }
    const common = {
      exerciseDefinitionId: readEntityId(item, 'exerciseDefinitionId'),
      measurementType,
      sets: readNumber(item, 'sets'),
    };
    if (measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
      if (Object.hasOwn(item, 'targetDurationSeconds')) {
        throw invalidRecord('Поле physicalPlanItems содержит несовместимую цель.');
      }
      return { ...common, measurementType, targetReps: readNumber(item, 'targetReps') };
    }
    if (Object.hasOwn(item, 'targetReps')) {
      throw invalidRecord('Поле physicalPlanItems содержит несовместимую цель.');
    }
    return {
      ...common,
      measurementType,
      targetDurationSeconds: readNumber(item, 'targetDurationSeconds'),
    };
  });
}

function readOptionalStartState(record: UnknownRecord) {
  if (!Object.hasOwn(record, 'startState') || record.startState === null) return null;
  if (typeof record.startState !== 'object' || Array.isArray(record.startState)) {
    throw invalidRecord('Поле startState должно быть объектом или null.');
  }
  const state = record.startState as UnknownRecord;
  return {
    energy: readNumber(state, 'energy'),
    clarity: readNumber(state, 'clarity'),
    mood: readString(state, 'mood'),
    recordedAt: readIsoDate(state, 'recordedAt'),
  };
}

function readOptionalShortenedModeState(
  record: UnknownRecord,
): MorningShortenedModeState | undefined {
  if (!Object.hasOwn(record, 'shortenedModeState') || record.shortenedModeState === null) {
    return undefined;
  }
  const state = readString(record, 'shortenedModeState');
  if (!isMorningShortenedModeState(state)) {
    throw invalidRecord('Поле shortenedModeState содержит неизвестное состояние.');
  }
  return state;
}

function readOptionalShortenedConfiguration(
  record: UnknownRecord,
): MorningShortenedConfiguration | null | undefined {
  if (!Object.hasOwn(record, 'shortenedConfiguration')) return undefined;
  if (record.shortenedConfiguration === null) return null;
  if (
    typeof record.shortenedConfiguration !== 'object' ||
    Array.isArray(record.shortenedConfiguration)
  ) {
    throw invalidRecord('Поле shortenedConfiguration должно быть объектом или null.');
  }
  const configuration = record.shortenedConfiguration as UnknownRecord;
  const coldShower = readString(configuration, 'coldShower');
  const physical = readString(configuration, 'physical');
  const mirror = readString(configuration, 'mirror');
  if (
    (coldShower !== MORNING_SHORTENED_ACTION.keep &&
      coldShower !== MORNING_SHORTENED_ACTION.skip) ||
    (physical !== MORNING_SHORTENED_ACTION.keep &&
      physical !== MORNING_SHORTENED_ACTION.shorten &&
      physical !== MORNING_SHORTENED_ACTION.skip) ||
    (mirror !== MORNING_SHORTENED_ACTION.keep && mirror !== MORNING_SHORTENED_ACTION.skip)
  ) {
    throw invalidRecord('Поле shortenedConfiguration содержит неизвестное действие.');
  }
  return { coldShower, physical, mirror };
}

function readOptionalNumberArray(record: UnknownRecord, field: string): readonly number[] {
  if (!Object.hasOwn(record, field) || record[field] === null) return [];
  if (!Array.isArray(record[field])) throw invalidRecord(`Поле ${field} должно быть массивом.`);
  return record[field].map((value) => {
    if (typeof value !== 'number') throw invalidRecord(`Поле ${field} должно содержать числа.`);
    return value;
  });
}

function readOptionalRemainingSetStrategy(
  record: UnknownRecord,
): 'keep' | 'shorten' | 'skip' | null {
  if (
    !Object.hasOwn(record, 'pendingRemainingSetStrategy') ||
    record.pendingRemainingSetStrategy === null
  ) {
    return null;
  }
  const strategy = readString(record, 'pendingRemainingSetStrategy');
  if (strategy !== 'keep' && strategy !== 'shorten' && strategy !== 'skip') {
    throw invalidRecord('Поле pendingRemainingSetStrategy содержит неизвестное действие.');
  }
  return strategy;
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
