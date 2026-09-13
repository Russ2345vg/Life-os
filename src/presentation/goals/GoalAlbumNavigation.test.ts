import { describe, expect, it } from 'vitest';
import { buildGoalAlbumRoute, parseGoalAlbumRoute } from './GoalAlbumNavigation';

describe('goal album navigation', () => {
  it('parses album, create, detail, and edit routes', () => {
    expect(parseGoalAlbumRoute('#/goals')).toEqual({ view: 'album' });
    expect(parseGoalAlbumRoute('#/goals/new')).toEqual({ view: 'create' });
    expect(parseGoalAlbumRoute('#/goals/goal%20one')).toEqual({
      view: 'detail',
      goalId: 'goal one',
    });
    expect(parseGoalAlbumRoute('#/goals/goal%20one/edit')).toEqual({
      view: 'edit',
      goalId: 'goal one',
    });
  });

  it('builds encoded goal album routes', () => {
    expect(buildGoalAlbumRoute({ view: 'album' })).toBe('#/goals');
    expect(buildGoalAlbumRoute({ view: 'create' })).toBe('#/goals/new');
    expect(buildGoalAlbumRoute({ view: 'detail', goalId: 'goal one' })).toBe('#/goals/goal%20one');
    expect(buildGoalAlbumRoute({ view: 'edit', goalId: 'goal one' })).toBe(
      '#/goals/goal%20one/edit',
    );
  });

  it('keeps the reserved new identifier as a detail route', () => {
    const hash = buildGoalAlbumRoute({ view: 'detail', goalId: 'new' });

    expect(hash).toBe('#/goals/%6E%65%77');
    expect(parseGoalAlbumRoute(hash)).toEqual({ view: 'detail', goalId: 'new' });
  });

  it('keeps the reserved new identifier encoded in an edit route', () => {
    const hash = buildGoalAlbumRoute({ view: 'edit', goalId: 'new' });

    expect(hash).toBe('#/goals/%6E%65%77/edit');
    expect(parseGoalAlbumRoute(hash)).toEqual({ view: 'edit', goalId: 'new' });
    expect(parseGoalAlbumRoute('#/goals/new/edit')).toBeNull();
  });

  it.each(['', '   '])('rejects a blank detail identifier in the route builder: %j', (goalId) => {
    expect(() => buildGoalAlbumRoute({ view: 'detail', goalId })).toThrow();
    expect(() => buildGoalAlbumRoute({ view: 'edit', goalId })).toThrow();
  });

  it.each([
    '#/goals/',
    '#/goals/one/two',
    '#/goals/goal-1?tab=details',
    '#/goals/%',
    '#/goals/%20',
  ])('rejects an invalid goal route: %s', (hash) => {
    expect(parseGoalAlbumRoute(hash)).toBeNull();
  });
});
