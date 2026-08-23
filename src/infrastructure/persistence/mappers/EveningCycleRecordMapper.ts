import {
  EveningCycle,
  OpenLoopReference,
  OpenLoopResolution,
  ReflectionCorrection,
  ReflectionQuestion,
  ReflectionResult,
  ReflectionSignal,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  isEveningCycleMode,
  isEveningCycleCompletion,
  isEveningModeReason,
  isEveningStageSkipReason,
  isEveningCycleState,
  isOpenLoopEntityType,
  isOpenLoopRequirement,
  isOpenLoopResolutionKind,
  isReflectionDaySignal,
  isReflectionQuestionKind,
  isReflectionQuestionType,
  isReflectionResultStatus,
  isReflectionSignalType,
} from '../../../domain';
import {
  assertRecordAndSchemaVersion,
  invalidRecord,
  readDayDate,
  readBoolean,
  readEntityId,
  readIsoDate,
  readNullableIsoDate,
  readNumber,
  readNullableNumber,
  readOptionalNullableString,
  readString,
  readStringArray,
  type UnknownRecord,
} from './RecordMapperSupport';
import type { EveningCycleRecord } from '../records/EveningCycleRecord';
import { EntityId } from '../../../domain/shared/EntityId';

export class EveningCycleRecordMapper {
  public static toRecord(cycle: EveningCycle): EveningCycleRecord {
    return {
      schemaVersion: 1,
      id: cycle.id.toString(),
      dayId: cycle.dayId.toString(),
      dateKey: cycle.dateKey.toString(),
      state: cycle.state,
      mode: cycle.mode,
      modeReason: cycle.modeReason,
      completion: cycle.completion,
      skippedStages: cycle.skippedStages.map((item) => ({
        stage: item.stage,
        reason: item.reason,
        skippedAt: item.skippedAt.toISOString(),
      })),
      startedAt: cycle.startedAt?.toISOString() ?? null,
      updatedAt: cycle.updatedAt.toISOString(),
      completedAt: cycle.completedAt?.toISOString() ?? null,
      decisionIds: cycle.decisionIds.map((id) => id.toString()),
      lifeActionIds: cycle.lifeActionIds.map((id) => id.toString()),
      openLoopReferences: cycle.openLoopReferences.map((reference) => ({
        entityType: reference.entityType,
        entityId: reference.entityId.toString(),
        requirement: reference.requirement,
        sourceVersion: reference.sourceVersion,
      })),
      openLoopResolutions: cycle.openLoopResolutions.map((resolution) => ({
        entityType: resolution.entityType,
        entityId: resolution.entityId.toString(),
        resolution: resolution.resolution,
        resolvedAt: resolution.resolvedAt.toISOString(),
        note: resolution.note,
      })),
      reflectionQuestions: cycle.reflectionQuestions.map((question) => ({
        id: question.id,
        kind: question.kind,
        signal: question.signal,
        type: question.type,
        prompt: question.prompt,
        context: question.context,
        required: question.required,
        sourceEntityIds: question.sourceEntityIds.map((id) => id.toString()),
        options: question.options.map((option) => ({ ...option })),
      })),
      reflectionResults: cycle.reflectionResults.map((result) => ({
        cycleId: result.cycleId.toString(),
        questionId: result.questionId,
        questionType: result.questionType,
        sourceEntityIds: result.sourceEntityIds.map((id) => id.toString()),
        status: result.status,
        answer: Array.isArray(result.answer) ? [...result.answer] : result.answer,
        answeredAt: result.answeredAt.toISOString(),
      })),
      reflectionSignals: cycle.reflectionSignals.map((signal) => ({
        type: signal.type,
        sourceEntityId: signal.sourceEntityId.toString(),
        cycleId: signal.cycleId.toString(),
        createdAt: signal.createdAt.toISOString(),
      })),
      reflectionCorrections: cycle.reflectionCorrections.map((correction) => ({
        id: correction.id.toString(),
        cycleId: correction.cycleId.toString(),
        sourceQuestionId: correction.sourceQuestionId,
        sourceEntityIds: correction.sourceEntityIds.map((id) => id.toString()),
        observation: correction.observation,
        action: correction.action,
        createdAt: correction.createdAt.toISOString(),
      })),
      version: cycle.version,
    };
  }

  public static fromRecord(value: unknown): EveningCycle {
    assertRecordAndSchemaVersion(value);
    const record: UnknownRecord = value;
    const state = readString(record, 'state');
    const rawMode = readString(record, 'mode');
    const mode = rawMode === 'SKIPPED' ? EVENING_CYCLE_MODE.normal : rawMode;
    if (!isEveningCycleState(state)) {
      throw invalidRecord('Поле state содержит неизвестное состояние вечернего цикла.');
    }
    if (!isEveningCycleMode(mode)) {
      throw invalidRecord('Поле mode содержит неизвестный режим вечернего цикла.');
    }
    const rawModeReason = readOptionalNullableString(record, 'modeReason');
    if (rawModeReason !== null && !isEveningModeReason(rawModeReason)) {
      throw invalidRecord('Поле modeReason содержит неизвестную причину режима.');
    }
    const rawCompletion =
      record.completion === undefined
        ? rawMode === 'SKIPPED'
          ? EVENING_CYCLE_COMPLETION.skipped
          : EVENING_CYCLE_COMPLETION.completed
        : readString(record, 'completion');
    if (!isEveningCycleCompletion(rawCompletion)) {
      throw invalidRecord('Поле completion содержит неизвестный результат вечернего цикла.');
    }
    return EveningCycle.rehydrate({
      id: readEntityId(record, 'id'),
      dayId: readEntityId(record, 'dayId'),
      dateKey: readDayDate(record, 'dateKey'),
      state,
      mode,
      modeReason: rawModeReason,
      completion: rawCompletion,
      skippedStages: readSkippedStages(record.skippedStages),
      startedAt: readNullableIsoDate(record, 'startedAt'),
      updatedAt: readIsoDate(record, 'updatedAt'),
      completedAt: readNullableIsoDate(record, 'completedAt'),
      decisionIds: readStringArray(record, 'decisionIds').map(EntityId.create),
      lifeActionIds: readStringArray(record, 'lifeActionIds').map(EntityId.create),
      openLoopReferences: readOpenLoopReferences(record.openLoopReferences),
      openLoopResolutions: readOpenLoopResolutions(record.openLoopResolutions),
      reflectionQuestions: readReflectionQuestions(record.reflectionQuestions),
      reflectionResults: readReflectionResults(record.reflectionResults),
      reflectionSignals: readReflectionSignals(record.reflectionSignals),
      reflectionCorrections: readReflectionCorrections(record.reflectionCorrections),
      version: readNumber(record, 'version'),
    });
  }
}

function readSkippedStages(value: unknown) {
  return optionalRecordArray(value, 'skippedStages').map((record) => {
    const stage = readString(record, 'stage');
    const reason = readString(record, 'reason');
    if (!isEveningCycleState(stage) || !isEveningStageSkipReason(reason)) {
      throw invalidRecord('Факт пропуска этапа вечернего цикла некорректен.');
    }
    return Object.freeze({ stage, reason, skippedAt: readIsoDate(record, 'skippedAt') });
  });
}

function readOpenLoopReferences(value: unknown): readonly OpenLoopReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalidRecord('Поле openLoopReferences должно быть массивом.');
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw invalidRecord('Ссылка незавершённого элемента некорректна.');
    }
    const record = item as UnknownRecord;
    const entityType = readString(record, 'entityType');
    const requirement = readString(record, 'requirement');
    if (!isOpenLoopEntityType(entityType) || !isOpenLoopRequirement(requirement)) {
      throw invalidRecord('Ссылка незавершённого элемента содержит неизвестные значения.');
    }
    return OpenLoopReference.create({
      entityType,
      entityId: readEntityId(record, 'entityId'),
      requirement,
      sourceVersion:
        record.sourceVersion === undefined ? null : readNullableNumber(record, 'sourceVersion'),
    });
  });
}

function readOpenLoopResolutions(value: unknown): readonly OpenLoopResolution[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalidRecord('Поле openLoopResolutions должно быть массивом.');
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw invalidRecord('Результат разбора незавершённого элемента некорректен.');
    }
    const record = item as UnknownRecord;
    const entityType = readString(record, 'entityType');
    const resolution = readString(record, 'resolution');
    if (
      !isOpenLoopEntityType(entityType) ||
      !isOpenLoopResolutionKind(resolution) ||
      resolution === 'REVISE'
    ) {
      throw invalidRecord('Результат разбора содержит неизвестные значения.');
    }
    return OpenLoopResolution.create({
      entityType,
      entityId: readEntityId(record, 'entityId'),
      resolution,
      resolvedAt: readIsoDate(record, 'resolvedAt'),
      note: readOptionalNullableString(record, 'note'),
    });
  });
}

function readReflectionQuestions(value: unknown): readonly ReflectionQuestion[] {
  return optionalRecordArray(value, 'reflectionQuestions').map((record) => {
    const kind = readString(record, 'kind');
    const signal = readString(record, 'signal');
    const type = readString(record, 'type');
    if (
      !isReflectionQuestionKind(kind) ||
      !isReflectionDaySignal(signal) ||
      !isReflectionQuestionType(type)
    ) {
      throw invalidRecord('Вопрос осмысления содержит неизвестные значения.');
    }
    const rawOptions = record.options;
    if (!Array.isArray(rawOptions)) throw invalidRecord('Варианты вопроса должны быть массивом.');
    const options = rawOptions.map((value) => {
      if (typeof value !== 'object' || value === null) {
        throw invalidRecord('Вариант вопроса некорректен.');
      }
      const option = value as UnknownRecord;
      return { value: readString(option, 'value'), label: readString(option, 'label') };
    });
    return ReflectionQuestion.create({
      id: readString(record, 'id'),
      kind,
      signal,
      type,
      prompt: readString(record, 'prompt'),
      context: readString(record, 'context'),
      required: readBoolean(record, 'required'),
      sourceEntityIds: readStringArray(record, 'sourceEntityIds').map(EntityId.create),
      options,
    });
  });
}

function readReflectionResults(value: unknown): readonly ReflectionResult[] {
  return optionalRecordArray(value, 'reflectionResults').map((record) => {
    const questionType = readString(record, 'questionType');
    const status = readString(record, 'status');
    if (!isReflectionQuestionType(questionType) || !isReflectionResultStatus(status)) {
      throw invalidRecord('Результат осмысления содержит неизвестные значения.');
    }
    const answer = readReflectionAnswer(record.answer);
    return ReflectionResult.rehydrate({
      cycleId: readEntityId(record, 'cycleId'),
      questionId: readString(record, 'questionId'),
      questionType,
      sourceEntityIds: readStringArray(record, 'sourceEntityIds').map(EntityId.create),
      status,
      answer,
      answeredAt: readIsoDate(record, 'answeredAt'),
    });
  });
}

function readReflectionSignals(value: unknown): readonly ReflectionSignal[] {
  return optionalRecordArray(value, 'reflectionSignals').map((record) => {
    const type = readString(record, 'type');
    if (!isReflectionSignalType(type)) throw invalidRecord('Тип сигнала осмысления неизвестен.');
    return ReflectionSignal.create({
      type,
      sourceEntityId: readEntityId(record, 'sourceEntityId'),
      cycleId: readEntityId(record, 'cycleId'),
      createdAt: readIsoDate(record, 'createdAt'),
    });
  });
}

function readReflectionCorrections(value: unknown): readonly ReflectionCorrection[] {
  return optionalRecordArray(value, 'reflectionCorrections').map((record) =>
    ReflectionCorrection.create({
      id: readEntityId(record, 'id'),
      cycleId: readEntityId(record, 'cycleId'),
      sourceQuestionId: readString(record, 'sourceQuestionId'),
      sourceEntityIds: readStringArray(record, 'sourceEntityIds').map(EntityId.create),
      observation: readString(record, 'observation'),
      action: readString(record, 'action'),
      createdAt: readIsoDate(record, 'createdAt'),
    }),
  );
}

function optionalRecordArray(value: unknown, field: string): readonly UnknownRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalidRecord(`Поле ${field} должно быть массивом.`);
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw invalidRecord(`Элемент ${field} некорректен.`);
    }
    return item as UnknownRecord;
  });
}

function readReflectionAnswer(value: unknown): string | readonly string[] | null {
  if (value === null || typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw invalidRecord('Ответ осмысления некорректен.');
}
