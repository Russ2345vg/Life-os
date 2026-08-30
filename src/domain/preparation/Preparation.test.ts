import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import {
  PREPARATION_AREA,
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  type PreparationRequirement,
} from './Preparation';

const NOW = new Date('2026-08-14T14:00:00.000Z');
const LATER = new Date('2026-08-14T14:15:00.000Z');

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

  it('сохраняет область среды при создании, синхронизации и восстановлении пункта', () => {
    const plan = createPlan();
    const sleepRequirement: PreparationRequirement = {
      key: 'ENVIRONMENT:SLEEP:DIM_LIGHTS',
      area: PREPARATION_AREA.sleepEnvironment,
      category: PREPARATION_CATEGORY.physical,
      title: 'Приглушить освещение',
      sourceType: PREPARATION_SOURCE_TYPE.rule,
      sourceId: null,
      required: false,
    };

    plan.synchronize([sleepRequirement], 1, 'source:sleep', NOW, sequence());

    expect(plan.activeItems[0]?.area).toBe(PREPARATION_AREA.sleepEnvironment);
    expect(
      PreparationItem.rehydrate({
        ...plan.activeItems[0]!.toData(),
        area: PREPARATION_AREA.tomorrowStart,
      }).area,
    ).toBe(PREPARATION_AREA.tomorrowStart);
  });

  it('завершает и сознательно пропускает пункты, блокируя переход только на PENDING REQUIRED', () => {
    const plan = createPlan();
    plan.synchronize(requirements(), 1, 'source:1', NOW, sequence());
    const [physical, requiredDigital, cognitive] = plan.activeItems;
    plan.configureRequiredCore(plan.activeItems.map((item) => item.key), NOW);

    plan.completeItem(physical!.id, NOW);
    expect(() => plan.complete(NOW)).toThrowError(
      expect.objectContaining({ code: 'preparation.required_items_pending' }),
    );
    plan.skipItem(requiredDigital!.id, NOW, 'Осознанно оставляю на утро');
    plan.skipItem(cognitive!.id, NOW);
    plan.complete(NOW);

    expect(plan.items[0]!.status).toBe(PREPARATION_ITEM_STATUS.completed);
    expect(plan.items[1]!.status).toBe(PREPARATION_ITEM_STATUS.skipped);
    expect(plan.items[1]!.skipReason).toBe('Осознанно оставляю на утро');
    expect(plan.completedAt).toEqual(NOW);
  });

  it('принимает ядро из трёх-шести активных неповторяющихся пунктов', () => {
    const plan = createPlan();
    plan.synchronize(environmentRequirements(7), 1, 'source:core', NOW, sequence());
    const keys = plan.activeItems.map((item) => item.key);

    expect(() => plan.configureRequiredCore(keys.slice(0, 2), NOW)).toThrow(
      expect.objectContaining({ code: 'preparation.invalid_required_core_size' }),
    );
    expect(() => plan.configureRequiredCore([...keys.slice(0, 3), 'missing'], NOW)).toThrow(
      expect.objectContaining({ code: 'preparation.required_core_item_not_found' }),
    );
    expect(() => plan.configureRequiredCore([keys[0]!, keys[0]!, keys[1]!], NOW)).toThrow(
      expect.objectContaining({ code: 'preparation.duplicate_required_core_item' }),
    );
    expect(plan.configureRequiredCore(keys.slice(0, 3), NOW)).toBe(true);
    expect(plan.configureRequiredCore(keys.slice(0, 3), LATER)).toBe(false);
    expect(plan.requiredCoreKeys).toEqual(keys.slice(0, 3));
    expect(plan.coreConfigured).toBe(true);

    expect(plan.configureRequiredCore(keys.slice(0, 6), LATER)).toBe(true);
    expect(() => plan.configureRequiredCore(keys, LATER)).toThrow(
      expect.objectContaining({ code: 'preparation.invalid_required_core_size' }),
    );
  });

  it('не завершает незавершённый план без настроенного обязательного ядра', () => {
    const plan = createPlan();
    plan.synchronize(requirements(), 1, 'source:unconfigured', NOW, sequence());

    expect(() => plan.complete(NOW)).toThrow(
      expect.objectContaining({ code: 'preparation.required_core_not_configured' }),
    );
  });

  it('отклоняет восстановленное обязательное ядро меньше трёх пунктов', () => {
    const source = synchronizedPlan(3);

    expect(() =>
      rehydratePlan(source, source.items, source.activeItems.slice(0, 2).map((item) => item.key)),
    ).toThrow(
      expect.objectContaining({ code: 'preparation.invalid_required_core_size' }),
    );
  });

  it('отклоняет восстановленное обязательное ядро с повторяющимися пунктами', () => {
    const source = synchronizedPlan(3);
    const [first, second] = source.activeItems;

    expect(() =>
      rehydratePlan(source, source.items, [first!.key, first!.key, second!.key]),
    ).toThrow(
      expect.objectContaining({ code: 'preparation.duplicate_required_core_item' }),
    );
  });

  it('отклоняет восстановленное обязательное ядро с неактивным пунктом', () => {
    const source = synchronizedPlan(4);
    const keys = source.activeItems.map((item) => item.key);
    const items = source.items.map((item, index) => (index === 3 ? item.deactivate() : item));

    expect(() => rehydratePlan(source, items, [keys[0]!, keys[1]!, keys[3]!])).toThrow(
      expect.objectContaining({ code: 'preparation.required_core_item_not_found' }),
    );
  });

  it('normalizes required flags of a valid restored core before completion', () => {
    const source = synchronizedPlan(3);
    const restored = rehydratePlan(
      source,
      source.items.map((item) => item.withRequired(false)),
      source.activeItems.map((item) => item.key),
    );

    expect(restored.activeItems.every((item) => item.required)).toBe(true);
    expect(() => restored.complete(NOW)).toThrow(
      expect.objectContaining({ code: 'preparation.required_items_pending' }),
    );
  });

  it('keeps a completed legacy plan with a null restored core idempotent', () => {
    const source = synchronizedPlan(3);
    source.configureRequiredCore(source.activeItems.map((item) => item.key), NOW);
    for (const item of source.activeItems) source.skipItem(item.id, NOW);
    source.complete(NOW);
    const legacy = rehydratePlan(source, source.items, null);

    expect(legacy.coreConfigured).toBe(false);
    expect(legacy.complete(LATER)).toBe(false);
  });

  it('отклоняет неактивный пункт при настройке ядра', () => {
    const plan = createPlan();
    const allRequirements = environmentRequirements(7);
    plan.synchronize(allRequirements, 1, 'source:core:1', NOW, sequence());
    const keys = plan.activeItems.map((item) => item.key);
    plan.configureRequiredCore(keys.slice(0, 6), NOW);
    plan.synchronize(allRequirements.slice(0, 6), 2, 'source:core:2', LATER, sequence());

    expect(() => plan.configureRequiredCore([...keys.slice(0, 3), keys[6]!], LATER)).toThrow(
      expect.objectContaining({ code: 'preparation.required_core_item_not_found' }),
    );
  });

  it('сохраняет порядок и результаты выбранного ядра при повторной генерации', () => {
    const plan = createPlan();
    const allRequirements = environmentRequirements(5);
    plan.synchronize(allRequirements, 1, 'source:preserve:1', NOW, sequence());
    const [first, second, third] = plan.activeItems;
    plan.configureRequiredCore([first!.key, second!.key, third!.key], NOW);
    plan.completeItem(first!.id, LATER);
    plan.skipItem(second!.id, LATER, 'Сделаю утром');
    plan.configureRequiredCore(
      [first!.key, second!.key, plan.activeItems[3]!.key],
      new Date('2026-08-14T14:25:00.000Z'),
    );

    plan.synchronize(
      [allRequirements[3]!, allRequirements[0]!],
      2,
      'source:preserve:2',
      new Date('2026-08-14T14:30:00.000Z'),
      sequence(),
    );

    expect(plan.items.map((item) => item.key)).toEqual([
      allRequirements[3]!.key,
      allRequirements[0]!.key,
      allRequirements[1]!.key,
      allRequirements[2]!.key,
      allRequirements[4]!.key,
    ]);
    expect(plan.activeItems.map((item) => item.key)).toEqual([
      allRequirements[3]!.key,
      allRequirements[0]!.key,
      allRequirements[1]!.key,
    ]);
    expect(plan.items[1]).toMatchObject({
      id: first!.id,
      status: PREPARATION_ITEM_STATUS.completed,
      completedAt: LATER,
      skippedAt: null,
      skipReason: null,
    });
    expect(plan.items[2]).toMatchObject({
      id: second!.id,
      status: PREPARATION_ITEM_STATUS.skipped,
      completedAt: null,
      skippedAt: LATER,
      skipReason: 'Сделаю утром',
    });
  });

  it('сохраняет более пяти активных необязательных пунктов при синхронизации', () => {
    const plan = createPlan();
    const optionalRequirements = environmentRequirements(7);

    plan.synchronize(optionalRequirements, 1, 'source:optional:1', NOW, sequence());
    plan.synchronize(optionalRequirements, 2, 'source:optional:2', LATER, sequence());

    expect(plan.activeItems).toHaveLength(7);
    expect(plan.activeItems.every((item) => !item.required)).toBe(true);
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
      area: PREPARATION_AREA.sleepEnvironment,
      category: PREPARATION_CATEGORY.physical,
      title: 'Подготовить рабочее место',
      sourceType: PREPARATION_SOURCE_TYPE.firstAction,
      sourceId: id('action'),
      required: false,
    },
    {
      key: 'digital',
      area: PREPARATION_AREA.tomorrowStart,
      category: PREPARATION_CATEGORY.digital,
      title: 'Открыть проект',
      sourceType: PREPARATION_SOURCE_TYPE.project,
      sourceId: id('project'),
      required: true,
    },
    {
      key: 'cognitive',
      area: PREPARATION_AREA.tomorrowStart,
      category: PREPARATION_CATEGORY.cognitive,
      title: 'Подготовить информацию',
      sourceType: PREPARATION_SOURCE_TYPE.rule,
      sourceId: id('rule'),
      required: false,
    },
  ];
}

function environmentRequirements(count: number): readonly PreparationRequirement[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `environment:${index + 1}`,
    area:
      index === 0 ? PREPARATION_AREA.sleepEnvironment : PREPARATION_AREA.tomorrowStart,
    category: PREPARATION_CATEGORY.physical,
    title: `Пункт среды ${index + 1}`,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required: false,
  }));
}

function synchronizedPlan(count: number): PreparationPlan {
  const plan = createPlan();
  plan.synchronize(
    environmentRequirements(count),
    1,
    `source:rehydrate:${count}`,
    NOW,
    sequence(),
  );
  return plan;
}

function rehydratePlan(
  source: PreparationPlan,
  items: readonly PreparationItem[],
  requiredCoreKeys: readonly string[] | null,
): PreparationPlan {
  return PreparationPlan.rehydrate({
    id: source.id,
    cycleId: source.cycleId,
    tomorrowPlanId: source.tomorrowPlanId,
    targetDayId: source.targetDayId,
    sourceVersion: source.sourceVersion,
    generationSignature: source.generationSignature,
    createdAt: source.createdAt,
    items,
    requiredCoreKeys,
    status: source.status,
    updatedAt: source.updatedAt,
    completedAt: source.completedAt,
    version: source.version,
  });
}

function sequence(): () => EntityId {
  let value = 0;
  return () => id(`item-${(value += 1)}`);
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
