import { resolveGoalNeed, resolveActionNeed } from './resolveEntityNeed';
import { describe, expect, it } from 'vitest';
import { Direction, EntityId, Goal, LifeAction, LifeActionTitle } from '..';

const now = new Date('2026-09-27T12:00:00Z');
const direction = (need?: string | null) =>
  Direction.create({
    id: EntityId.create('direction'),
    name: 'Здоровье',
    ...(need === undefined ? {} : { need }),
    now,
  });
const goal = (need?: string | null) =>
  Goal.create({
    id: EntityId.create('goal'),
    title: 'Больше сил',
    ...(need === undefined ? {} : { need }),
    now,
  });
const action = (need?: string | null) =>
  LifeAction.createDraft({
    id: EntityId.create('action'),
    title: LifeActionTitle.create('Прогуляться'),
    ...(need === undefined ? {} : { need }),
    createdAt: now,
    eventId: EntityId.create('created'),
  });

describe('own entity needs', () => {
  it('trims own needs and defaults old entities to null', () => {
    expect(direction('  Энергия  ').need).toBe('Энергия');
    expect(goal('  Самостоятельность  ').need).toBe('Самостоятельность');
    expect(action('  Отдых  ').need).toBe('Отдых');
    expect([direction().need, goal().need, action().need]).toEqual([null, null, null]);
  });
  it('preserves omitted values and clears own text explicitly', () => {
    const d = direction('Энергия');
    expect(d.update({ name: d.name }, now).need).toBe('Энергия');
    expect(d.update({ name: d.name, need: '' }, now).need).toBeNull();
    const g = goal('Самостоятельность');
    expect(g.update({ title: g.title }, now).need).toBe('Самостоятельность');
    expect(g.update({ title: g.title, need: null }, now).need).toBeNull();
    const a = action('Отдых');
    expect(a.updateDraftDetails(a.title, a.description)).toBe(false);
    expect(a.need).toBe('Отдых');
    expect(a.updateDraftDetails(a.title, a.description, '')).toBe(true);
    expect(a.need).toBeNull();
  });
  it('rejects an oversized need at each owner', () => {
    const text = 'x'.repeat(501);
    expect(() => direction(text)).toThrow('500');
    expect(() => goal(text)).toThrow('500');
    expect(() => action(text)).toThrow('500');
  });
});

describe('need inheritance', () => {
  it('resolves own, goal, then direction dynamically and returns to inheritance after clearing', () => {
    const d = direction('Энергия');
    const g = Goal.create({
      id: EntityId.create('goal'),
      title: 'Больше сил',
      directionId: d.id,
      now,
    });
    const a = LifeAction.createDraft({
      id: EntityId.create('action'),
      title: LifeActionTitle.create('Прогуляться'),
      goalId: g.id,
      createdAt: now,
      eventId: EntityId.create('event'),
    });
    expect(resolveGoalNeed(g, [d])).toEqual({ text: 'Энергия', source: 'direction' });
    expect(resolveActionNeed(a, [g], [d])).toEqual({ text: 'Энергия', source: 'direction' });
    const edited = g.update({ title: g.title, need: 'Отдых' }, now);
    expect(resolveActionNeed(a, [edited], [d])).toEqual({ text: 'Отдых', source: 'goal' });
    a.updateDraftDetails(a.title, a.description, 'Свобода');
    expect(resolveActionNeed(a, [edited], [d])).toEqual({ text: 'Свобода', source: 'own' });
    a.updateDraftDetails(a.title, a.description, null);
    expect(resolveActionNeed(a, [edited], [d])).toEqual({ text: 'Отдых', source: 'goal' });
    expect(
      resolveActionNeed(a, [g], [d.update({ name: d.name, need: 'Спокойствие' }, now)]),
    ).toEqual({ text: 'Спокойствие', source: 'direction' });
    expect(a.need).toBeNull();
  });
  it('handles standalone actions, empty needs and missing linked parents', () => {
    const d = direction('Энергия');
    const a = LifeAction.createDraft({
      id: EntityId.create('action'),
      title: LifeActionTitle.create('Прогуляться'),
      directionId: d.id,
      createdAt: now,
      eventId: EntityId.create('event'),
    });
    expect(resolveActionNeed(a, [], [d])).toEqual({ text: 'Энергия', source: 'direction' });
    a.setGoal(EntityId.create('missing'));
    expect(resolveActionNeed(a, [], [d])).toBeNull();
    expect(resolveGoalNeed(goal(), [])).toBeNull();
  });
});
