import { describe, expect, it } from 'vitest';
import { assertActionHierarchy } from './ActionHierarchy';

describe('LifeAction parent relations', () => {
  it('accepts independent roots and one level of children', () => {
    expect(() =>
      assertActionHierarchy([
        { id: 'root', parentActionId: null },
        { id: 'child-1', parentActionId: 'root' },
        { id: 'child-2', parentActionId: 'root' },
        { id: 'other' },
      ]),
    ).not.toThrow();
  });

  it.each([
    [[{ id: 'self', parentActionId: 'self' }], 'life_action.self_parent'],
    [[{ id: 'child', parentActionId: 'missing' }], 'life_action.parent_missing'],
    [
      [
        { id: 'root' },
        { id: 'child', parentActionId: 'root' },
        { id: 'grandchild', parentActionId: 'child' },
      ],
      'life_action.hierarchy_depth',
    ],
    [
      [
        { id: 'a', parentActionId: 'b' },
        { id: 'b', parentActionId: 'a' },
      ],
      'life_action.hierarchy_depth',
    ],
  ] as const)('rejects invalid hierarchy with %s', (actions, code) => {
    expect(() => assertActionHierarchy(actions)).toThrowError(expect.objectContaining({ code }));
  });
});
