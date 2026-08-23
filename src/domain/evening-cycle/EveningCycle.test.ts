import { describe, expect, it } from 'vitest';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { EveningCycle } from './EveningCycle';
import { EVENING_CYCLE_MODE, EVENING_MODE_REASON } from './EveningCycleMode';
import { EVENING_CYCLE_STATE } from './EveningCycleState';
import {
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  ReflectionResult,
} from '../reflection';

const DATE = DayDate.create('2026-08-14');
const STARTED_AT = new Date('2026-08-14T23:55:00.000+09:00');
const AFTER_MIDNIGHT = new Date('2026-08-15T00:08:00.000+09:00');

describe('EveningCycle', () => {
  it('проходит единственный нормальный путь и сохраняет исходный жизненный день после полуночи', () => {
    const cycle = createCycle();

    cycle.start(STARTED_AT);
    cycle.beginResolving(STARTED_AT);
    cycle.completeResolving(STARTED_AT);
    finishReflection(cycle);
    cycle.completeReflection(STARTED_AT);
    cycle.completeTomorrowPlanning(STARTED_AT);
    cycle.completePreparation(STARTED_AT);
    cycle.complete(AFTER_MIDNIGHT, [id('decision')], [id('action')]);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(cycle.mode).toBe(EVENING_CYCLE_MODE.normal);
    expect(cycle.dateKey.equals(DATE)).toBe(true);
    expect(cycle.dayId.equals(id('day'))).toBe(true);
    expect(cycle.startedAt).toEqual(STARTED_AT);
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
    expect(cycle.decisionIds.map(String)).toEqual(['decision']);
    expect(cycle.lifeActionIds.map(String)).toEqual(['action']);
  });

  it('делает повторные start и complete идемпотентными', () => {
    const cycle = createCompletedCycle();
    const version = cycle.version;

    cycle.start(AFTER_MIDNIGHT);
    cycle.complete(AFTER_MIDNIGHT, [id('other')], [id('other-action')]);

    expect(cycle.version).toBe(version);
    expect(cycle.decisionIds).toHaveLength(0);
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
  });

  it('отклоняет переход REFLECTING → COMPLETED и возврат COMPLETED → REFLECTING', () => {
    const reflecting = createCycle();
    reflecting.start(STARTED_AT);
    reflecting.beginResolving(STARTED_AT);
    reflecting.completeResolving(STARTED_AT);

    expect(() => reflecting.complete(AFTER_MIDNIGHT)).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.invalid_transition' }),
    );

    const completed = createCompletedCycle();
    expect(() => completed.beginReflection(AFTER_MIDNIGHT)).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.invalid_transition' }),
    );
  });

  it.each([
    ['quick', EVENING_CYCLE_MODE.quick],
    ['emergency', EVENING_CYCLE_MODE.emergency],
    ['skip', EVENING_CYCLE_MODE.normal],
  ] as const)('фиксирует %s как режим того же завершённого цикла', (operation, mode) => {
    const cycle = createCycle();
    if (operation === 'quick') completeSpecialCycle(cycle, EVENING_CYCLE_MODE.quick);
    if (operation === 'emergency') completeSpecialCycle(cycle, EVENING_CYCLE_MODE.emergency);
    if (operation === 'skip') cycle.skip(AFTER_MIDNIGHT);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.completed);
    expect(cycle.mode).toBe(mode);
    expect(cycle.completedAt).toEqual(AFTER_MIDNIGHT);
    expect(cycle.startedAt === null).toBe(operation === 'skip');
  });

  it('защищает completedAt и обязательный startedAt при восстановлении', () => {
    expect(() =>
      EveningCycle.rehydrate({
        id: id('cycle'),
        dayId: id('day'),
        dateKey: DATE,
        state: EVENING_CYCLE_STATE.completed,
        mode: EVENING_CYCLE_MODE.normal,
        startedAt: null,
        updatedAt: AFTER_MIDNIGHT,
        completedAt: null,
        version: 1,
      }),
    ).toThrowError(DomainError);
  });
});

function createCycle(): EveningCycle {
  return EveningCycle.create({
    id: id('cycle'),
    dayId: id('day'),
    dateKey: DATE,
    occurredAt: STARTED_AT,
  });
}

function completeSpecialCycle(
  cycle: EveningCycle,
  mode: typeof EVENING_CYCLE_MODE.quick | typeof EVENING_CYCLE_MODE.emergency,
): void {
  cycle.start(STARTED_AT);
  cycle.switchMode(mode, EVENING_MODE_REASON.userSelected, STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  cycle.skipReflection(STARTED_AT);
  cycle.completeTomorrowPlanning(STARTED_AT);
  cycle.skipPreparation(STARTED_AT);
  cycle.complete(AFTER_MIDNIGHT);
}

function createCompletedCycle(): EveningCycle {
  const cycle = createCycle();
  cycle.start(STARTED_AT);
  cycle.beginResolving(STARTED_AT);
  cycle.completeResolving(STARTED_AT);
  finishReflection(cycle);
  cycle.completeReflection(STARTED_AT);
  cycle.completeTomorrowPlanning(STARTED_AT);
  cycle.completePreparation(STARTED_AT);
  cycle.complete(AFTER_MIDNIGHT);
  return cycle;
}

function finishReflection(cycle: EveningCycle): void {
  const question = ReflectionQuestion.create({
    id: 'GENERAL_LEARNING:test',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.optionalText,
    prompt: 'Какой вывод стоит сохранить?',
    context: 'Тестовый день завершён.',
    required: false,
    sourceEntityIds: [],
  });
  cycle.initializeReflection([question], STARTED_AT);
  cycle.recordReflectionResult(
    ReflectionResult.skip(cycle.id, question, STARTED_AT),
    null,
    STARTED_AT,
  );
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
