import { describe, expect, it } from 'vitest';
import { directionDependency } from './directionDeletionPolicy';

describe('Direction dependency classification', () => {
  const today = '2026-09-14';
  it.each([
    ['goal', { status: 'active' }, 'live'],
    ['goal', { status: 'future' }, 'live'],
    ['goal', { status: 'achieved' }, 'historical'],
    ['goal', { status: 'archived' }, 'historical'],
    ['project', { status: 'paused' }, 'live'],
    ['project', { status: 'completed' }, 'historical'],
    ['direction_indicator', { removed: false }, 'live'],
    ['direction_indicator', { removed: true }, 'historical'],
    ['day', { date: '2026-09-13', status: 'open' }, 'historical'],
    ['day', { date: today, status: 'completed' }, 'live'],
    ['tomorrow_plan', { targetDateKey: '2026-09-13', status: 'COMPLETED' }, 'historical'],
    ['tomorrow_plan', { targetDateKey: today, status: 'COMPLETED' }, 'live'],
    ['monthly_direction_focus', { month: '2026-08' }, 'historical'],
    ['monthly_direction_focus', { month: '2026-09' }, 'live'],
  ] as const)('%s with %j is %s', (entityType, record, relation) => {
    expect(
      directionDependency(entityType, { id: 'child', title: 'Linked', ...record }, today),
    ).toMatchObject({ relation, label: 'Linked' });
  });
  it('blocks unknown required references conservatively', () => {
    expect(directionDependency('walk', { id: 'walk-1' }, today).relation).toBe('live');
  });
});
