import { describe, expect, it } from 'vitest';
import { DayDate, EntityId } from '..';
import { TOMORROW_PLAN_STATUS, TomorrowPlan } from './TomorrowPlan';

const NOW = new Date('2026-08-14T12:00:00.000Z');

describe('TomorrowPlan', () => {
  it('сохраняет уровни плана и становится готовым только с обязательным минимумом', () => {
    const plan = createPlan();
    plan.assignPrimaryDecision(EntityId.create('decision-main'), NOW);
    plan.setOutcomes('Рабочая модель', 'Модель и интеграция', 'Модель, UI и тесты', NOW);
    expect(plan.isReady).toBe(false);

    plan.assignFirstAction(EntityId.create('action-first'), NOW);
    expect(plan.isReady).toBe(true);
    plan.complete(NOW);
    expect(plan.status).toBe(TOMORROW_PLAN_STATUS.completed);
  });

  it('ограничивает вечерний фокус двумя дополнительными Решениями и исключает главное', () => {
    const plan = createPlan();
    const primary = EntityId.create('decision-main');
    plan.assignPrimaryDecision(primary, NOW);
    plan.setSupportingDecisions(
      [primary, EntityId.create('decision-2'), EntityId.create('decision-3')],
      NOW,
    );
    expect(plan.supportingDecisionIds.map(String)).toEqual(['decision-2', 'decision-3']);
    expect(() =>
      plan.setSupportingDecisions(
        [
          EntityId.create('decision-2'),
          EntityId.create('decision-3'),
          EntityId.create('decision-4'),
        ],
        NOW,
      ),
    ).toThrowError(/не более двух/);
  });

  it('повторное сохранение тех же данных идемпотентно', () => {
    const plan = createPlan();
    const version = plan.version;
    expect(plan.setDirection(null, NOW)).toBe(false);
    expect(plan.version).toBe(version);
  });
  it('позволяет скорректировать primaryDecision и firstAction после перехода в PREPARING', () => {
    const plan = createPlan();
    plan.assignPrimaryDecision(EntityId.create('decision-main'), NOW);
    plan.setOutcomes('Рабочий минимум', null, null, NOW);
    plan.assignFirstAction(EntityId.create('action-first'), NOW);
    plan.complete(NOW);
    const completedAt = plan.completedAt;

    plan.assignPrimaryDecision(EntityId.create('decision-updated'), NOW);
    plan.assignFirstAction(EntityId.create('action-updated'), NOW);

    expect(plan.status).toBe(TOMORROW_PLAN_STATUS.completed);
    expect(plan.primaryDecisionId?.toString()).toBe('decision-updated');
    expect(plan.firstActionId?.toString()).toBe('action-updated');
    expect(plan.completedAt).toEqual(completedAt);
  });
});

function createPlan(): TomorrowPlan {
  return TomorrowPlan.create({
    id: EntityId.create('plan-1'),
    cycleId: EntityId.create('cycle-1'),
    sourceDayId: EntityId.create('day-source'),
    targetDayId: EntityId.create('day-target'),
    targetDateKey: DayDate.create('2026-08-15'),
    createdAt: NOW,
  });
}
