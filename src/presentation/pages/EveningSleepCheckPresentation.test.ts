import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  RELAXATION_PRACTICE,
  RelaxationSnapshot,
  SleepCheckSnapshot,
} from '../../domain';
import { buildEveningSleepCheckModel } from './EveningSleepCheckPresentation';

describe('EveningSleepCheckPresentation', () => {
  it('показывает AFTER gate, затем ровно один вопрос с progress 1/3–3/3', () => {
    const cycle = sleepCycle();
    expect(buildEveningSleepCheckModel(cycle, false)).toMatchObject({ phase: 'after-ratings' });
    cycle.setAfterRelaxationRatings(4, 5, at('22:31:00'));
    expect(buildEveningSleepCheckModel(cycle, false)).toMatchObject({
      phase: 'question',
      progress: '1 / 3',
      question: { id: 'CALM_MIND', prompt: 'Голова спокойна?' },
    });
    cycle.answerSleepCheckQuestion('CALM_MIND', 'YES', at('22:32:00'));
    expect(buildEveningSleepCheckModel(cycle, false)).toMatchObject({
      phase: 'question',
      progress: '2 / 3',
      question: { id: 'HOLDING_THOUGHT' },
    });
  });

  it('инвертирует HOLDING_THOUGHT, предлагает фиксированное действие и один retry', () => {
    const cycle = sleepCycle();
    cycle.setAfterRelaxationRatings(4, 4, at('22:31:00'));
    cycle.answerSleepCheckQuestion('CALM_MIND', 'YES', at('22:32:00'));
    cycle.answerSleepCheckQuestion('HOLDING_THOUGHT', 'YES', at('22:33:00'));
    cycle.answerSleepCheckQuestion('READY_FOR_SLEEP', 'NO', at('22:34:00'));
    expect(buildEveningSleepCheckModel(cycle, false)).toMatchObject({
      phase: 'corrective-action',
      correctiveAction: { questionId: 'HOLDING_THOUGHT', action: 'CAPTURE_THOUGHT' },
    });
    cycle.chooseSleepCheckCorrectiveAction('HOLDING_THOUGHT', 'CAPTURE_THOUGHT', at('22:35:00'));
    cycle.completeSleepCheckCorrectiveAction(
      'HOLDING_THOUGHT',
      'Оставить на завтра',
      at('22:36:00'),
    );
    expect(buildEveningSleepCheckModel(cycle, false)).toMatchObject({
      phase: 'retry',
      question: { id: 'HOLDING_THOUGHT' },
    });
    cycle.retrySleepCheckQuestion('HOLDING_THOUGHT', 'YES', at('22:37:00'));
    expect(buildEveningSleepCheckModel(cycle, false)).toMatchObject({
      phase: 'summary',
      calm: { before: 2, after: 4 },
      sleepReadiness: { before: 3, after: 4 },
      completedActionLabel: 'Оставить одну мысль на завтра',
    });
  });

  it('не фабрикует legacy history', () => {
    const cycle = EveningCycle.rehydrate({
      id: EntityId.create('legacy'),
      dayId: EntityId.create('legacy-day'),
      dateKey: DayDate.create('2026-08-30'),
      state: EVENING_CYCLE_STATE.shutdown,
      mode: EVENING_CYCLE_MODE.normal,
      startedAt: at('20:00:00'),
      updatedAt: at('23:00:00'),
      completedAt: null,
      version: 1,
    });
    expect(buildEveningSleepCheckModel(cycle, true)).toMatchObject({
      phase: 'legacy',
      readOnly: true,
      legacyMessage: 'Проверка сна не записывалась для этого вечера',
    });
  });
});

function sleepCycle(): EveningCycle {
  const snapshot = SleepCheckSnapshot.start({
    calmBefore: 2,
    sleepReadinessBefore: 3,
    occurredAt: at('22:00:00'),
  });
  snapshot.startCheck(at('22:30:00'));
  const relaxation = RelaxationSnapshot.start({
    defaultPractice: RELAXATION_PRACTICE.reading,
    practiceDurationMinutes: 15,
    screenFreeDurationMinutes: 25,
    occurredAt: at('21:00:00'),
  });
  relaxation.completeDrink(at('21:05:00'));
  relaxation.completeHygiene(at('21:06:00'));
  relaxation.completePractice(at('21:20:00'));
  relaxation.skipScreenFree(at('21:25:00'));
  return EveningCycle.rehydrate({
    id: EntityId.create('sleep-cycle'),
    dayId: EntityId.create('sleep-day'),
    dateKey: DayDate.create('2026-08-30'),
    state: EVENING_CYCLE_STATE.sleepCheck,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: at('20:00:00'),
    updatedAt: at('22:30:00'),
    completedAt: null,
    relaxation,
    sleepCheck: snapshot,
    version: 1,
  });
}

function at(time: string): Date {
  return new Date(`2026-08-30T${time}.000+09:00`);
}
