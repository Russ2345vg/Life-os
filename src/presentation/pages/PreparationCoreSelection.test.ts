import { describe, expect, it } from 'vitest';
import {
  EntityId,
  PREPARATION_CATEGORY,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
} from '../../domain';
import { PREPARATION_AREA } from '../../domain/preparation';
import {
  canConfirmPreparationCore,
  createPreparationCoreSelectionDraft,
  togglePreparationCoreKey,
} from './PreparationCoreSelection';

describe('PreparationCoreSelection', () => {
  it('инициализирует ненастроенное ядро из четырёх рекомендаций', () => {
    const items = preparationItems();

    const draft = createPreparationCoreSelectionDraft(items, null, [
      'tomorrow-water',
      'sleep-bed',
      'tomorrow-clothes',
      'sleep-screens',
    ]);

    expect(draft.selectedKeys).toEqual([
      'sleep-screens',
      'sleep-bed',
      'tomorrow-clothes',
      'tomorrow-water',
    ]);
  });

  it('инициализирует настроенное ядро из сохранённых ключей', () => {
    const items = preparationItems();

    const draft = createPreparationCoreSelectionDraft(
      items,
      ['tomorrow-water', 'sleep-screens', 'sleep-bed'],
      ['tomorrow-clothes', 'sleep-screens', 'sleep-bed', 'tomorrow-water'],
    );

    expect(draft.selectedKeys).toEqual(['sleep-screens', 'sleep-bed', 'tomorrow-water']);
  });

  it('переключает ключи в порядке плана, а не порядке кликов', () => {
    const items = preparationItems();
    const initial = createPreparationCoreSelectionDraft(items, null, []);

    const afterWater = togglePreparationCoreKey(initial, 'tomorrow-water', items);
    const afterScreens = togglePreparationCoreKey(afterWater, 'sleep-screens', items);
    const afterClothes = togglePreparationCoreKey(afterScreens, 'tomorrow-clothes', items);

    expect(afterClothes.selectedKeys).toEqual([
      'sleep-screens',
      'tomorrow-clothes',
      'tomorrow-water',
    ]);
    expect(initial.selectedKeys).toEqual([]);
    expect(afterWater.selectedKeys).toEqual(['tomorrow-water']);
  });

  it('отказывается добавлять седьмой ключ и не меняет исходный draft', () => {
    const items = preparationItems(7);
    const selected = items.slice(0, 6).map((item) => item.key);
    const draft = createPreparationCoreSelectionDraft(items, selected, []);

    const toggled = togglePreparationCoreKey(draft, items[6]!.key, items);

    expect(toggled.selectedKeys).toEqual(selected);
    expect(draft.selectedKeys).toEqual(selected);
    expect(toggled).not.toBe(draft);
  });

  it('разрешает подтверждение только для трёх–шести уникальных активных ключей', () => {
    const items = preparationItems();

    expect(canConfirmPreparationCore({ selectedKeys: ['sleep-screens', 'sleep-bed'] }, items)).toBe(
      false,
    );
    expect(
      canConfirmPreparationCore(
        { selectedKeys: ['sleep-screens', 'sleep-bed', 'tomorrow-clothes'] },
        items,
      ),
    ).toBe(true);
    expect(
      canConfirmPreparationCore(
        {
          selectedKeys: [
            'sleep-screens',
            'sleep-bed',
            'tomorrow-clothes',
            'tomorrow-water',
            'tomorrow-alarm',
            'tomorrow-workspace',
          ],
        },
        items,
      ),
    ).toBe(true);
    expect(
      canConfirmPreparationCore(
        {
          selectedKeys: [
            'sleep-screens',
            'sleep-bed',
            'tomorrow-clothes',
            'tomorrow-water',
            'tomorrow-alarm',
            'tomorrow-workspace',
            'tomorrow-items',
          ],
        },
        items,
      ),
    ).toBe(false);
    expect(
      canConfirmPreparationCore(
        { selectedKeys: ['sleep-screens', 'sleep-screens', 'tomorrow-clothes'] },
        items,
      ),
    ).toBe(false);
    expect(
      canConfirmPreparationCore(
        { selectedKeys: ['sleep-screens', 'sleep-bed', 'inactive'] },
        items,
      ),
    ).toBe(false);
  });
});

function preparationItems(count = 7): readonly PreparationItem[] {
  const definitions = [
    ['sleep-screens', PREPARATION_AREA.sleepEnvironment],
    ['sleep-bed', PREPARATION_AREA.sleepEnvironment],
    ['tomorrow-clothes', PREPARATION_AREA.tomorrowStart],
    ['tomorrow-water', PREPARATION_AREA.tomorrowStart],
    ['tomorrow-alarm', PREPARATION_AREA.tomorrowStart],
    ['tomorrow-workspace', PREPARATION_AREA.tomorrowStart],
    ['tomorrow-items', PREPARATION_AREA.tomorrowStart],
    ['inactive', PREPARATION_AREA.tomorrowStart],
  ] as const;

  return definitions.slice(0, count).map(([key, area]) => {
    const item = PreparationItem.create({
      id: EntityId.create(`item-${key}`),
      planId: EntityId.create('preparation-plan'),
      key,
      area,
      category: PREPARATION_CATEGORY.physical,
      title: `Подготовить ${key}`,
      sourceType: PREPARATION_SOURCE_TYPE.rule,
      sourceId: null,
      required: false,
    });
    return key === 'inactive' ? item.deactivate() : item;
  });
}
