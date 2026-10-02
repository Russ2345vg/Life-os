import { expect, it } from 'vitest';
import { Direction, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import { buildNeedCatalog } from './needCatalogModel';

it('groups existing and starter needs without rewriting them and includes inherited links', () => {
  const now = new Date('2026-10-02T10:00:00Z');
  const direction = Direction.create({
    id: EntityId.create('direction-1'),
    name: 'Учёба',
    need: '  Свобода  ',
    now,
  });
  const goal = Goal.create({
    id: EntityId.create('goal-1'),
    title: 'Выучить язык',
    directionId: direction.id,
    status: 'active',
    now,
  });
  const action = LifeAction.createDraft({
    id: EntityId.create('action-1'),
    title: LifeActionTitle.create('Открыть учебник'),
    goalId: goal.id,
    createdAt: now,
    eventId: EntityId.create('event-1'),
  });
  const catalog = buildNeedCatalog({ directions: [direction], goals: [goal], actions: [action] });
  const freedom = catalog.find((entry) => entry.key === 'свобода');
  expect(catalog.find((entry) => entry.key === 'здоровье')).toBeDefined();
  expect(catalog.filter((entry) => entry.key === 'свобода')).toHaveLength(1);
  expect(freedom?.directions.map((item) => item.title)).toEqual(['Учёба']);
  expect(freedom?.goals.map((item) => item.title)).toEqual(['Выучить язык']);
  expect(freedom?.actions.map((item) => item.title)).toEqual(['Открыть учебник']);
  expect(goal.need).toBeNull();
  expect(action.need).toBeNull();
});

it('keeps an own need separate from the inherited parent need', () => {
  const now = new Date('2026-10-02T10:00:00Z');
  const direction = Direction.create({
    id: EntityId.create('direction-2'),
    name: 'Работа',
    need: 'Безопасность',
    now,
  });
  const goal = Goal.create({
    id: EntityId.create('goal-2'),
    title: 'Новый проект',
    directionId: direction.id,
    need: 'Развитие',
    status: 'active',
    now,
  });
  const catalog = buildNeedCatalog({ directions: [direction], goals: [goal], actions: [] });
  expect(catalog.find((entry) => entry.key === 'безопасность')?.goals).toHaveLength(0);
  expect(catalog.find((entry) => entry.key === 'развитие')?.goals).toHaveLength(1);
});

it('adds a saved custom need to the catalog with the current goal status', () => {
  const now = new Date('2026-10-02T10:00:00Z');
  const goal = Goal.create({
    id: EntityId.create('custom-goal'),
    title: 'Тихий вечер',
    need: 'Пространство для тишины',
    status: 'active',
    now,
  }).update({ title: 'Тихий вечер', status: 'achieved', stage: 'achieved' }, now);
  const catalog = buildNeedCatalog({ directions: [], goals: [goal], actions: [] });
  expect(catalog.find((entry) => entry.key === 'пространство для тишины')).toMatchObject({
    title: 'Пространство для тишины',
    starter: false,
    goals: [{ status: 'achieved', title: 'Тихий вечер' }],
  });
});
