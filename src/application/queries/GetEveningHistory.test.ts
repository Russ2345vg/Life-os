import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EVENING_MODE_REASON,
  EVENING_STAGE_SKIP_REASON,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  OpenLoopReference,
  OpenLoopResolution,
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  REFLECTION_SIGNAL_TYPE,
  ReflectionQuestion,
  ReflectionResult,
  ReflectionSignal,
  TOMORROW_PLANNING_QUALITY,
  TOMORROW_PLAN_STATUS,
  TomorrowPlan,
  type EveningCycleMode,
  type EveningCycleState,
} from '../../domain';
import { PREPARATION_AREA } from '../../domain/preparation';
import type { EveningHistoryReader, EveningHistorySourceData } from '../ports/EveningHistoryReader';
import { EVENING_HISTORY_RANGE_KIND, GetEveningHistory } from './GetEveningHistory';
import { GetEveningHistorySummary } from './GetEveningHistorySummary';

const NORMAL_DATE = DayDate.create('2026-08-20');
const QUICK_DATE = DayDate.create('2026-08-18');
const EMERGENCY_DATE = DayDate.create('2026-08-17');

describe('E10.1 GetEveningHistory', () => {
  it('строит полную read-model NORMAL и считает длительность через полночь', async () => {
    const normal = completedNormalCycle();
    const history = queryWith({
      cycles: [normal],
      tomorrowPlans: [tomorrowPlanFor(normal)],
      preparationPlans: [preparationPlanFor(normal)],
    });

    const result = await history.execute({
      kind: EVENING_HISTORY_RANGE_KIND.custom,
      startDate: NORMAL_DATE,
      endDate: NORMAL_DATE,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      dayId: 'day-2026-08-20',
      dateKey: '2026-08-20',
      completion: EVENING_CYCLE_COMPLETION.completed,
      mode: EVENING_CYCLE_MODE.normal,
      startedAt: '2026-08-20T14:50:00.000Z',
      completedAt: '2026-08-20T15:20:00.000Z',
      durationMs: 30 * 60 * 1_000,
      resolutionCounts: { COMPLETE: 1, CARRY_FORWARD: 1, REVISE: 0, DROP: 1 },
      reflectionAnswerCount: 1,
      hasTomorrowPlan: true,
      tomorrowPlanStatus: TOMORROW_PLAN_STATUS.completed,
      tomorrowPlanningQuality: TOMORROW_PLANNING_QUALITY.full,
      primaryDecision: 'primary-decision',
      hasFirstAction: true,
      firstActionId: 'first-action',
      preparationState: PREPARATION_PLAN_STATUS.completed,
      preparationItems: { total: 2, completed: 1, skipped: 1, pending: 0 },
    });
    expect(result.items[0]!.reflectionAnswers[0]).toMatchObject({
      kind: REFLECTION_QUESTION_KIND.mainDecisionFailureReason,
      answer: 'ENERGY_LOW',
    });
    expect(result.items[0]!.signals).toEqual([
      expect.objectContaining({ type: REFLECTION_SIGNAL_TYPE.energyLow }),
    ]);
    expect(result.items[0]!.structuredReasons).toEqual([
      expect.objectContaining({ resolution: OPEN_LOOP_RESOLUTION.carryForward }),
      expect.objectContaining({ resolution: OPEN_LOOP_RESOLUTION.drop }),
    ]);
  });

  it('возвращает QUICK, EMERGENCY и начатый незавершённый цикл', async () => {
    const quick = simpleCompletedCycle(QUICK_DATE, EVENING_CYCLE_MODE.quick, [
      EVENING_CYCLE_STATE.reflecting,
    ]);
    const emergency = skippedCycle(EMERGENCY_DATE, EVENING_CYCLE_MODE.emergency);
    const unfinished = unfinishedCycle(DayDate.create('2026-08-19'));
    const history = queryWith({
      cycles: [quick, emergency, unfinished],
      tomorrowPlans: [],
      preparationPlans: [],
    });

    const result = await history.execute({
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      endDate: NORMAL_DATE,
    });

    expect(result.range).toEqual({
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      startDate: '2026-08-14',
      endDate: '2026-08-20',
      dayCount: 7,
    });
    expect(result.items.map((item) => item.mode)).toEqual([
      EVENING_CYCLE_MODE.normal,
      EVENING_CYCLE_MODE.quick,
      EVENING_CYCLE_MODE.emergency,
    ]);
    expect(result.items[0]).toMatchObject({
      state: EVENING_CYCLE_STATE.windingDown,
      completion: null,
      completedAt: null,
      durationMs: null,
    });
    expect(result.items[1]!.skippedStages).toEqual([
      expect.objectContaining({
        stage: EVENING_CYCLE_STATE.reflecting,
        reason: EVENING_STAGE_SKIP_REASON.quickMode,
      }),
    ]);
    expect(result.items[2]).toMatchObject({
      completion: EVENING_CYCLE_COMPLETION.skipped,
      durationMs: null,
      preparationState: 'NOT_CREATED',
    });
  });

  it('поддерживает 30 дней и произвольный включительный диапазон дат', async () => {
    const oldCycle = simpleCompletedCycle(DayDate.create('2026-07-25'), EVENING_CYCLE_MODE.normal);
    const quick = simpleCompletedCycle(QUICK_DATE, EVENING_CYCLE_MODE.quick);
    const history = queryWith({
      cycles: [oldCycle, quick],
      tomorrowPlans: [],
      preparationPlans: [],
    });

    const last30Days = await history.execute({
      kind: EVENING_HISTORY_RANGE_KIND.last30Days,
      endDate: NORMAL_DATE,
    });
    const custom = await history.execute({
      kind: EVENING_HISTORY_RANGE_KIND.custom,
      startDate: QUICK_DATE,
      endDate: DayDate.create('2026-08-19'),
    });

    expect(last30Days.range.startDate).toBe('2026-07-22');
    expect(last30Days.items.map((item) => item.dateKey)).toEqual(['2026-08-18', '2026-07-25']);
    expect(custom.range.dayCount).toBe(2);
    expect(custom.items.map((item) => item.dateKey)).toEqual(['2026-08-18']);
  });

  it('агрегирует режимы, исходы, Reflection, TomorrowPlan и Preparation одним query', async () => {
    const normal = completedNormalCycle();
    const history = queryWith({
      cycles: [
        normal,
        simpleCompletedCycle(QUICK_DATE, EVENING_CYCLE_MODE.quick, [EVENING_CYCLE_STATE.preparing]),
        skippedCycle(EMERGENCY_DATE, EVENING_CYCLE_MODE.emergency),
      ],
      tomorrowPlans: [tomorrowPlanFor(normal)],
      preparationPlans: [preparationPlanFor(normal)],
    });
    const summary = await new GetEveningHistorySummary(history).execute({
      kind: EVENING_HISTORY_RANGE_KIND.last7Days,
      endDate: NORMAL_DATE,
    });

    expect(summary).toMatchObject({
      cycleCount: 3,
      completedCount: 2,
      skippedCount: 1,
      modeCounts: { NORMAL: 1, QUICK: 1, EMERGENCY: 1 },
      resolutionCounts: { COMPLETE: 1, CARRY_FORWARD: 1, REVISE: 0, DROP: 1 },
      reflectionAnswerCount: 1,
      signalCount: 1,
      tomorrowPlanCount: 1,
      primaryDecisionCount: 1,
      firstActionCount: 1,
      preparationCounts: { NOT_CREATED: 2, IN_PROGRESS: 0, COMPLETED: 1 },
      skippedStageCount: 1,
    });
    expect(summary.averageDurationMs).toBe(22.5 * 60 * 1_000);
  });

  it('отклоняет перевёрнутый произвольный диапазон', async () => {
    const history = queryWith({ cycles: [], tomorrowPlans: [], preparationPlans: [] });

    await expect(
      history.execute({
        kind: EVENING_HISTORY_RANGE_KIND.custom,
        startDate: NORMAL_DATE,
        endDate: QUICK_DATE,
      }),
    ).rejects.toMatchObject({ code: 'evening_history.invalid_date_range' });
  });
});

class StubEveningHistoryReader implements EveningHistoryReader {
  public constructor(private readonly source: EveningHistorySourceData) {}

  public async read(): Promise<EveningHistorySourceData> {
    return this.source;
  }
}

function queryWith(source: EveningHistorySourceData): GetEveningHistory {
  return new GetEveningHistory(new StubEveningHistoryReader(source));
}

function completedNormalCycle(): EveningCycle {
  const id = EntityId.create('cycle-2026-08-20');
  const question = ReflectionQuestion.create({
    id: 'failure-reason',
    kind: REFLECTION_QUESTION_KIND.mainDecisionFailureReason,
    signal: REFLECTION_DAY_SIGNAL.failure,
    type: REFLECTION_QUESTION_TYPE.singleChoice,
    prompt: 'Что помешало?',
    context: 'Главное решение',
    required: true,
    sourceEntityIds: [EntityId.create('primary-decision')],
    options: [
      { value: 'ENERGY_LOW', label: 'Мало энергии' },
      { value: 'OTHER', label: 'Другое' },
    ],
  });
  const references = [
    openLoopReference(OPEN_LOOP_ENTITY_TYPE.decision, 'complete-entity'),
    openLoopReference(OPEN_LOOP_ENTITY_TYPE.lifeAction, 'carry-entity'),
    openLoopReference(OPEN_LOOP_ENTITY_TYPE.actionSession, 'drop-entity'),
  ];
  return EveningCycle.rehydrate({
    id,
    dayId: EntityId.create('day-2026-08-20'),
    dateKey: NORMAL_DATE,
    state: EVENING_CYCLE_STATE.completed,
    mode: EVENING_CYCLE_MODE.normal,
    modeReason: null,
    completion: EVENING_CYCLE_COMPLETION.completed,
    startedAt: new Date('2026-08-20T23:50:00.000+09:00'),
    updatedAt: new Date('2026-08-21T00:20:00.000+09:00'),
    completedAt: new Date('2026-08-21T00:20:00.000+09:00'),
    openLoopReferences: references,
    openLoopResolutions: [
      openLoopResolution(OPEN_LOOP_ENTITY_TYPE.decision, 'complete-entity', 'COMPLETE', null),
      openLoopResolution(
        OPEN_LOOP_ENTITY_TYPE.lifeAction,
        'carry-entity',
        'CARRY_FORWARD',
        'Перенос из-за внешнего срока',
      ),
      openLoopResolution(
        OPEN_LOOP_ENTITY_TYPE.actionSession,
        'drop-entity',
        'DROP',
        'Больше не актуально',
      ),
    ],
    reflectionQuestions: [question],
    reflectionResults: [
      ReflectionResult.answer(id, question, 'ENERGY_LOW', new Date('2026-08-21T00:05:00+09:00')),
    ],
    reflectionSignals: [
      ReflectionSignal.create({
        type: REFLECTION_SIGNAL_TYPE.energyLow,
        sourceEntityId: EntityId.create('primary-decision'),
        cycleId: id,
        createdAt: new Date('2026-08-21T00:05:00+09:00'),
      }),
    ],
    version: 12,
  });
}

function simpleCompletedCycle(
  date: DayDate,
  mode: EveningCycleMode,
  skippedStages: readonly EveningCycleState[] = [],
): EveningCycle {
  const dateKey = date.toString();
  const start = new Date(`${dateKey}T21:00:00.000Z`);
  const completed = new Date(start.getTime() + 15 * 60 * 1_000);
  return EveningCycle.rehydrate({
    id: EntityId.create(`cycle-${dateKey}`),
    dayId: EntityId.create(`day-${dateKey}`),
    dateKey: date,
    state: EVENING_CYCLE_STATE.completed,
    mode,
    modeReason: mode === EVENING_CYCLE_MODE.normal ? null : EVENING_MODE_REASON.lateNight,
    completion: EVENING_CYCLE_COMPLETION.completed,
    skippedStages: skippedStages.map((stage) => ({
      stage,
      reason:
        mode === EVENING_CYCLE_MODE.quick
          ? EVENING_STAGE_SKIP_REASON.quickMode
          : EVENING_STAGE_SKIP_REASON.emergencyMode,
      skippedAt: completed,
    })),
    startedAt: start,
    updatedAt: completed,
    completedAt: completed,
    version: 5,
  });
}

function skippedCycle(date: DayDate, mode: EveningCycleMode): EveningCycle {
  const completed = new Date(`${date.toString()}T22:00:00.000Z`);
  return EveningCycle.rehydrate({
    id: EntityId.create(`cycle-${date.toString()}`),
    dayId: EntityId.create(`day-${date.toString()}`),
    dateKey: date,
    state: EVENING_CYCLE_STATE.completed,
    mode,
    modeReason: EVENING_MODE_REASON.interrupted,
    completion: EVENING_CYCLE_COMPLETION.skipped,
    startedAt: null,
    updatedAt: completed,
    completedAt: completed,
    version: 2,
  });
}

function unfinishedCycle(date: DayDate): EveningCycle {
  const started = new Date(`${date.toString()}T21:00:00.000Z`);
  return EveningCycle.rehydrate({
    id: EntityId.create(`cycle-${date.toString()}`),
    dayId: EntityId.create(`day-${date.toString()}`),
    dateKey: date,
    state: EVENING_CYCLE_STATE.windingDown,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: started,
    updatedAt: started,
    completedAt: null,
    version: 2,
  });
}

function openLoopReference(entityType: string, entityId: string): OpenLoopReference {
  return OpenLoopReference.create({
    entityType: entityType as typeof OPEN_LOOP_ENTITY_TYPE.decision,
    entityId: EntityId.create(entityId),
    requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
    sourceVersion: 1,
  });
}

function openLoopResolution(
  entityType: string,
  entityId: string,
  resolution: 'COMPLETE' | 'CARRY_FORWARD' | 'DROP',
  note: string | null,
): OpenLoopResolution {
  return OpenLoopResolution.create({
    entityType: entityType as typeof OPEN_LOOP_ENTITY_TYPE.decision,
    entityId: EntityId.create(entityId),
    resolution,
    resolvedAt: new Date('2026-08-21T00:00:00.000+09:00'),
    note,
  });
}

function tomorrowPlanFor(cycle: EveningCycle): TomorrowPlan {
  return TomorrowPlan.rehydrate({
    id: EntityId.create('tomorrow-plan'),
    cycleId: cycle.id,
    sourceDayId: cycle.dayId,
    targetDayId: EntityId.create('day-2026-08-21'),
    targetDateKey: DayDate.create('2026-08-21'),
    directionId: null,
    vector: 'Сфокусироваться',
    primaryDecisionId: EntityId.create('primary-decision'),
    minimumOutcome: 'Минимальный результат',
    targetOutcome: null,
    stretchOutcome: null,
    firstActionId: EntityId.create('first-action'),
    supportingDecisionIds: [],
    status: TOMORROW_PLAN_STATUS.completed,
    planningQuality: TOMORROW_PLANNING_QUALITY.full,
    createdAt: new Date('2026-08-21T00:06:00.000+09:00'),
    updatedAt: new Date('2026-08-21T00:10:00.000+09:00'),
    completedAt: new Date('2026-08-21T00:10:00.000+09:00'),
    version: 4,
  });
}

function preparationPlanFor(cycle: EveningCycle): PreparationPlan {
  const id = EntityId.create('preparation-plan');
  const completedItem = PreparationItem.rehydrate({
    id: EntityId.create('preparation-completed'),
    planId: id,
    key: 'first-action:ready',
    area: PREPARATION_AREA.sleepEnvironment,
    category: PREPARATION_CATEGORY.physical,
    title: 'Подготовить рабочее место',
    sourceType: PREPARATION_SOURCE_TYPE.firstAction,
    sourceId: EntityId.create('first-action'),
    required: true,
    status: PREPARATION_ITEM_STATUS.completed,
    active: true,
    completedAt: new Date('2026-08-21T00:12:00.000+09:00'),
    skippedAt: null,
    skipReason: null,
  });
  const skippedItem = PreparationItem.rehydrate({
    id: EntityId.create('preparation-skipped'),
    planId: id,
    key: 'reflection:note',
    area: PREPARATION_AREA.tomorrowStart,
    category: PREPARATION_CATEGORY.cognitive,
    title: 'Записать уточнение',
    sourceType: PREPARATION_SOURCE_TYPE.reflection,
    sourceId: null,
    required: false,
    status: PREPARATION_ITEM_STATUS.skipped,
    active: true,
    completedAt: null,
    skippedAt: new Date('2026-08-21T00:13:00.000+09:00'),
    skipReason: 'Не требуется',
  });
  return PreparationPlan.rehydrate({
    id,
    cycleId: cycle.id,
    tomorrowPlanId: EntityId.create('tomorrow-plan'),
    targetDayId: EntityId.create('day-2026-08-21'),
    sourceVersion: 4,
    generationSignature: 'signature-v4',
    items: [completedItem, skippedItem],
    status: PREPARATION_PLAN_STATUS.completed,
    createdAt: new Date('2026-08-21T00:11:00.000+09:00'),
    updatedAt: new Date('2026-08-21T00:15:00.000+09:00'),
    completedAt: new Date('2026-08-21T00:15:00.000+09:00'),
    version: 3,
  });
}
