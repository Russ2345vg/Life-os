import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import {
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationPlan,
  type PreparationRequirement,
} from './Preparation';

const NOW = new Date('2026-08-14T14:00:00.000Z');

describe('PreparationPlan', () => {
  it('создаёт физические, цифровые и когнитивные обязательные и рекомендуемые пункты', () => {
    const plan = createPlan();
    plan.synchronize(requirements(), 1, 'source:1', NOW, sequence());

    expect(plan.activeItems.map((item) => item.category)).toEqual([
      PREPARATION_CATEGORY.physical,
      PREPARATION_CATEGORY.digital,
      PREPARATION_CATEGORY.cognitive,
    ]);
    expect(plan.activeItems.map((item) => item.required)).toEqual([false, true, false]);
  });

  it('завершает и сознательно пропускает пункты, блокируя переход только на PENDING REQUIRED', () => {
    const plan = createPlan();
    plan.synchronize(requirements(), 1, 'source:1', NOW, sequence());
    const [physical, requiredDigital] = plan.activeItems;

    plan.completeItem(physical!.id, NOW);
    expect(() => plan.complete(NOW)).toThrowError(
      expect.objectContaining({ code: 'preparation.required_items_pending' }),
    );
    plan.skipItem(requiredDigital!.id, NOW, 'Осознанно оставляю на утро');
    plan.complete(NOW);

    expect(plan.items[0]!.status).toBe(PREPARATION_ITEM_STATUS.completed);
    expect(plan.items[1]!.status).toBe(PREPARATION_ITEM_STATUS.skipped);
    expect(plan.items[1]!.skipReason).toBe('Осознанно оставляю на утро');
    expect(plan.completedAt).toEqual(NOW);
  });

  it('повторно синхронизируется без дублей и сохраняет выполненную историю устаревших пунктов', () => {
    const plan = createPlan();
    const ids = sequence();
    plan.synchronize(requirements(), 1, 'source:1', NOW, ids);
    const completed = plan.activeItems[0]!;
    plan.completeItem(completed.id, NOW);

    expect(plan.synchronize(requirements(), 1, 'source:1', NOW, ids)).toBe(false);
    plan.synchronize(requirements().slice(1), 2, 'source:2', NOW, ids);

    expect(plan.activeItems).toHaveLength(2);
    expect(plan.items.filter((item) => item.key === completed.key)).toHaveLength(1);
    expect(plan.items.find((item) => item.key === completed.key)).toMatchObject({
      active: false,
      status: PREPARATION_ITEM_STATUS.completed,
    });
  });
});

function createPlan(): PreparationPlan {
  return PreparationPlan.create({
    id: id('preparation'),
    cycleId: id('cycle'),
    tomorrowPlanId: id('tomorrow'),
    targetDayId: id('target-day'),
    sourceVersion: 1,
    generationSignature: 'UNINITIALIZED',
    createdAt: NOW,
  });
}

function requirements(): readonly PreparationRequirement[] {
  return [
    {
      key: 'physical',
      category: PREPARATION_CATEGORY.physical,
      title: 'Подготовить рабочее место',
      sourceType: PREPARATION_SOURCE_TYPE.firstAction,
      sourceId: id('action'),
      required: false,
    },
    {
      key: 'digital',
      category: PREPARATION_CATEGORY.digital,
      title: 'Открыть проект',
      sourceType: PREPARATION_SOURCE_TYPE.project,
      sourceId: id('project'),
      required: true,
    },
    {
      key: 'cognitive',
      category: PREPARATION_CATEGORY.cognitive,
      title: 'Подготовить информацию',
      sourceType: PREPARATION_SOURCE_TYPE.rule,
      sourceId: id('rule'),
      required: false,
    },
  ];
}

function sequence(): () => EntityId {
  let value = 0;
  return () => id(`item-${(value += 1)}`);
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
