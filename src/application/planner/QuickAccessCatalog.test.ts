import { describe, expect, it } from 'vitest';
import {
  ActionCancelReason,
  ActionExpectedResult,
  DayDate,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
  Sphere,
} from '../../domain';
import {
  readQuickAccessCatalog,
  searchQuickAccess,
  type QuickAccessRecord,
} from './QuickAccessCatalog';

const now = new Date('2026-09-25T10:00:00Z');
const action = (id: string, title: string) =>
  LifeAction.createDraft({
    id: EntityId.create(id),
    title: LifeActionTitle.create(title),
    createdAt: now,
    eventId: EntityId.create(`event-${id}`),
  });
const record = (id: string, title: string, context = ''): QuickAccessRecord => ({
  kind: 'action',
  id,
  title,
  context,
  status: 'draft',
  date: null,
  recurring: false,
  canSchedule: true,
  canClearDate: true,
});
describe('quick access search', () => {
  it('normalizes ё, whitespace and case, requires every term and searches visible context', () => {
    const records = [
      record('a', 'Подготовить отчёт', 'Работа · Проект'),
      record('b', 'Отчёт домой'),
    ];
    expect(searchQuickAccess(records, '  ОТЧЕТ   работа ').items.map((r) => r.id)).toEqual(['a']);
    expect(searchQuickAccess(records, 'отчет отпуск').total).toBe(0);
  });
  it('ranks exact, prefix, title substring and context, then uses stable ids', () => {
    const records = [
      record('d', 'Альфа', 'Проект'),
      record('c', 'Мой проект'),
      record('b', 'Проект новый'),
      record('z', 'Проект'),
      record('a', 'Проект'),
    ];
    expect(searchQuickAccess(records, 'проект').items.map((r) => r.id)).toEqual([
      'a',
      'z',
      'b',
      'c',
      'd',
    ]);
  });
  it('limits results while preserving the full count and deterministic empty query', () => {
    const records = Array.from({ length: 42 }, (_, i) => record(`a${i}`, `Задача ${i}`));
    expect(searchQuickAccess(records, '').items).toHaveLength(30);
    expect(searchQuickAccess(records, '').total).toBe(42);
    expect(searchQuickAccess([...records].reverse(), '')).toEqual(searchQuickAccess(records, ''));
  });
});
describe('quick access catalog', () => {
  it('uses the current goal hierarchy after a move, not the action snapshot', async () => {
    const sphere = Sphere.create({ id: EntityId.create('s'), name: 'Новая сфера', now });
    const direction = Direction.create({
      id: EntityId.create('new'),
      name: 'Новое направление',
      sphereId: sphere.id,
      now,
    });
    const old = Direction.create({ id: EntityId.create('old'), name: 'Старое направление', now });
    const goal = Goal.create({
      id: EntityId.create('g'),
      title: 'Цель',
      directionId: direction.id,
      now,
    });
    const task = LifeAction.createDraft({
      id: EntityId.create('a'),
      title: LifeActionTitle.create('Задача'),
      goalId: goal.id,
      directionId: old.id,
      createdAt: now,
      eventId: EntityId.create('event-a'),
    });
    const records = await readQuickAccessCatalog({
      plannerCatalog: { actions: async () => [task] },
      getGoals: { execute: async () => [goal] },
      getDirections: { execute: async () => [old, direction] },
      getSpheres: { execute: async () => ({ active: [sphere], archived: [] }) },
    });
    expect(records.find((r) => r.kind === 'action')?.context).toBe(
      'Новая сфера · Новое направление · Цель',
    );
    expect(searchQuickAccess(records, 'Задача старое').total).toBe(0);
  });
  it('hides archived and terminal actions and respects date capabilities', async () => {
    const draft = action('draft', 'Черновик');
    const ready = action('ready', 'Готово');
    const started = action('started', 'В работе');
    for (const a of [ready, started])
      a.makeReady({
        expectedResult: ActionExpectedResult.create('Результат'),
        plannedDate: DayDate.create('2026-09-25'),
        occurredAt: now,
        eventId: EntityId.create(`ready-${a.id}`),
      });
    started.markInProgress(now, EntityId.create('start'));
    const archived = action('archived', 'Архив');
    archived.complete(null, now, EntityId.create('archive-complete'));
    archived.archive(now, EntityId.create('archive'));
    const completed = action('completed', 'Выполнено');
    completed.complete(null, now, EntityId.create('complete'));
    const cancelled = action('cancelled', 'Отменено');
    cancelled.cancel(now, EntityId.create('cancel'), ActionCancelReason.create('Не нужно'));
    const goal = Goal.create({ id: EntityId.create('g'), title: 'Цель', now });
    const archivedGoal = goal.archive(now);
    const direction = Direction.create({
      id: EntityId.create('d'),
      name: 'Направление',
      now,
    }).archive(now);
    const sphere = Sphere.create({ id: EntityId.create('s'), name: 'Сфера', now }).archive(now);
    const records = await readQuickAccessCatalog({
      plannerCatalog: {
        actions: async () => [draft, ready, started, archived, completed, cancelled],
      },
      getGoals: { execute: async () => [archivedGoal] },
      getDirections: { execute: async () => [direction] },
      getSpheres: { execute: async () => ({ active: [], archived: [sphere] }) },
    });
    expect(records.map((r) => r.id)).toEqual(['draft', 'ready', 'started']);
    expect(records.map((r) => [r.canSchedule, r.canClearDate])).toEqual([
      [true, true],
      [true, false],
      [false, false],
    ]);
  });
  it('uses all readers, builds visible hierarchy and exposes real occurrence ids once', async () => {
    const sphere = Sphere.create({ id: EntityId.create('s'), name: 'Работа', now });
    const direction = Direction.create({
      id: EntityId.create('d'),
      name: 'Развитие',
      sphereId: sphere.id,
      now,
    });
    const goal = Goal.create({
      id: EntityId.create('g'),
      title: 'Запустить проект',
      directionId: direction.id,
      now,
    });
    const first = action('first', 'Практика');
    const later = action('later', 'Практика');
    for (const [a, date] of [
      [first, '2026-09-25'],
      [later, '2026-09-26'],
    ] as const) {
      a.setPlanningMetadata({
        occurrence: { ruleId: 'series', slot: date, originalDate: date, ruleRevision: 1 },
      });
    }
    const records = await readQuickAccessCatalog({
      plannerCatalog: { actions: async () => [later, first] },
      getGoals: { execute: async () => [goal] },
      getDirections: { execute: async () => [direction] },
      getSpheres: { execute: async () => ({ active: [sphere], archived: [] }) },
    });
    expect(records.filter((r) => r.kind === 'action').map((r) => r.id)).toEqual(['first']);
    expect(records.find((r) => r.id === 'g')?.context).toBe('Работа · Развитие');
    expect(records.find((r) => r.id === 'first')).toMatchObject({
      recurring: true,
      canSchedule: true,
      canClearDate: true,
    });
  });
  it('does not return a misleading partial catalog when a source fails', async () => {
    await expect(
      readQuickAccessCatalog({
        plannerCatalog: { actions: async () => [action('a', 'Действие')] },
        getGoals: {
          execute: async () => {
            throw new Error('offline');
          },
        },
        getDirections: { execute: async () => [] },
        getSpheres: { execute: async () => ({ active: [], archived: [] }) },
      }),
    ).rejects.toThrow('offline');
  });
});
