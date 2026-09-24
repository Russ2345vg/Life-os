import { describe, expect, it } from 'vitest';
import { taskScenario, addScenarioAction, removeScenarioAction } from './TaskScenario';

const empty = () =>
  taskScenario({
    id: 'scenario',
    title: '  Дома  ',
    actionIds: [],
    date: null,
    archived: false,
    updatedAt: '2026-09-24T00:00:00.000Z',
    version: 1,
    schemaVersion: 1,
  });
describe('TaskScenario', () => {
  it('collects existing IDs one at a time, preserving order and limiting to three', () => {
    let value = empty();
    expect(value.title).toBe('Дома');
    for (const id of ['a', 'b', 'c']) value = addScenarioAction(value, id, value.updatedAt);
    expect(value.actionIds).toEqual(['a', 'b', 'c']);
    expect(addScenarioAction(value, 'b', value.updatedAt)).toBe(value);
    expect(() => addScenarioAction(value, 'd', value.updatedAt)).toThrow('трёх');
    expect(removeScenarioAction(value, 'b', value.updatedAt).actionIds).toEqual(['a', 'c']);
    expect(value.actionIds).toEqual(['a', 'b', 'c']);
  });
  it('rejects invalid persisted values instead of silently losing links', () => {
    for (const patch of [
      { title: ' ' },
      { actionIds: ['a', 'a'] },
      { actionIds: [''] },
      { actionIds: ['a', 'b', 'c', 'd'] },
      { date: '2026-02-30' },
      { archived: 'false' },
      { version: 0 },
      { updatedAt: 'bad' },
    ])
      expect(() => taskScenario({ ...empty(), ...patch } as ReturnType<typeof empty>)).toThrow();
  });
});
