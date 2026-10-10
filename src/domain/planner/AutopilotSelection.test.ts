import { describe, expect, it } from 'vitest';
import { DayDate, Direction, EntityId, Goal } from '../index';
import {
  createLifeActionDraft,
  createReadyLifeAction,
  softDeleteLifeAction,
  completeLifeAction,
} from '../../test/helpers/LifeActionTestFactory';
import {
  selectAutopilotCandidates,
  resolveAutopilotWishes,
  type AutopilotCatalog,
} from './AutopilotSelection';
import type { ContributionLink } from './ProgressContribution';

const now = new Date('2026-10-10T00:00:00Z');
const investments = Direction.create({
  id: EntityId.create('investments'),
  name: 'Инвестиции',
  now,
});
const order = Direction.create({ id: EntityId.create('order'), name: 'Порядок', now });
const goal = Goal.create({
  id: EntityId.create('g'),
  title: 'Портфель',
  directionId: investments.id,
  status: 'active',
  now,
});
function action(id: string, day: string | null = null, ruleId: string | null = null) {
  const item = createLifeActionDraft(id);
  if (day) item.setPlan(DayDate.create(day), false);
  if (ruleId)
    item.setPlanningMetadata({
      occurrence: { ruleId, originalDate: day!, slot: day!, ruleRevision: 1, manualDate: false },
    });
  return item;
}
function catalog(
  actions: AutopilotCatalog['actions'],
  links: readonly ContributionLink[] = [],
): AutopilotCatalog {
  return { actions, goals: [goal], directions: [investments, order], links };
}
function link(
  id: string,
  sourceType: 'action' | 'rule',
  sourceId: string,
  extra: Partial<ContributionLink> = {},
): ContributionLink {
  return {
    id,
    sourceType,
    sourceId,
    goalId: 'g',
    mode: 'fixed',
    amount: 1,
    effectiveFrom: '2026-01-01',
    removed: false,
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    version: 1,
    ...extra,
  };
}
describe('preference-driven autopilot selection', () => {
  it('selects undated and overdue actions through direct direction goal and active contribution links', () => {
    const direct = action('direct');
    direct.setContext(null, investments.id, null);
    const byGoal = action('goal');
    byGoal.setGoal(goal.id);
    const household = action('household', '2026-10-09');
    household.setContext(null, order.id, null);
    const linked = action('linked');
    const removed = action('removed');
    const futureLink = action('future-link');
    const groups = selectAutopilotCandidates(
      '2026-10-10',
      catalog(
        [direct, byGoal, household, linked, removed, futureLink, action('unrelated')],
        [
          link('l', 'action', 'linked'),
          link('r', 'action', 'removed', { removed: true }),
          link('f', 'action', 'future-link', { effectiveFrom: '2026-10-11' }),
        ],
      ),
      { kind: 'direction', id: 'investments' },
      [{ kind: 'direction', id: 'order' }],
    );
    expect(groups.focus).toEqual(['direct', 'goal', 'linked']);
    expect(groups.wishes[0]?.actionIds).toEqual(['household']);
  });
  it('selects one occurrence per series and never future completed or deleted actions', () => {
    const actions = [
      action('old', '2026-10-07', 'r'),
      action('latest', '2026-10-09', 'r'),
      action('today', '2026-10-10', 'r'),
      action('future', '2026-10-11', 'r'),
      softDeleteLifeAction(action('deleted')),
      completeLifeAction(createReadyLifeAction('completed', DayDate.create('2026-10-10'))),
    ];
    const groups = selectAutopilotCandidates(
      '2026-10-10',
      catalog(actions, [link('rule-link', 'rule', 'r')]),
      { kind: 'goal', id: 'g' },
      [],
    );
    expect(groups.focus).toEqual(['today']);
    expect(groups.excluded.map((item) => item.actionId)).toEqual(
      expect.arrayContaining(['old', 'latest', 'future', 'deleted', 'completed']),
    );
    expect(
      selectAutopilotCandidates(
        '2026-10-10',
        catalog(
          actions.filter((item) => item.id.toString() !== 'today'),
          [link('rule-link', 'rule', 'r')],
        ),
        { kind: 'goal', id: 'g' },
        [],
      ).focus,
    ).toEqual(['latest']);
  });
  it('keeps fallback limited to today and rejects unavailable focus', () => {
    const data = catalog([
      action('undated'),
      action('today', '2026-10-10'),
      action('future', '2026-10-11'),
    ]);
    expect(selectAutopilotCandidates('2026-10-10', data, null, []).todayFallback).toEqual([
      'today',
    ]);
    expect(() =>
      selectAutopilotCandidates('2026-10-10', data, { kind: 'goal', id: 'missing' }, []),
    ).toThrow();
  });
  it('normalizes punctuation case and ё while requiring visible resolution for unknown or ambiguous text', () => {
    const duplicate = Goal.create({
      id: EntityId.create('other'),
      title: 'Порядок',
      status: 'active',
      now,
    });
    const data = { ...catalog([]), goals: [goal, duplicate] };
    expect(resolveAutopilotWishes('ПОРТФЁЛЬ!', data, []).matches).toEqual([
      { kind: 'goal', id: 'g' },
    ]);
    const wishes = resolveAutopilotWishes('Порядок; неизвестное', data, []);
    expect(wishes.unresolved).toHaveLength(2);
    expect(wishes.unresolved[0]?.candidates).toHaveLength(2);
    expect(wishes.unresolved[1]?.candidates).toEqual([]);
    expect(
      resolveAutopilotWishes('Порядок', data, [{ kind: 'direction', id: 'order' }]).matches,
    ).toEqual([{ kind: 'direction', id: 'order' }]);
    expect(
      resolveAutopilotWishes('Порядок', data, [{ kind: 'direction', id: 'order' }]).unresolved,
    ).toEqual([]);
  });
  it('does not truncate matches at the end of a large imported catalog', () => {
    const items = Array.from({ length: 10000 }, (_, i) => action(`a${i}`));
    items[9999]!.setGoal(goal.id);
    expect(
      selectAutopilotCandidates('2026-10-10', catalog(items), { kind: 'goal', id: 'g' }, []).focus,
    ).toEqual(['a9999']);
  });
});
