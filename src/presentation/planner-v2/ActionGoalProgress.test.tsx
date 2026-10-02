import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import { createGoalProgressReader } from '../../application/planner/GoalContributions';
import type { PlanningServices } from '../../application/planner/PlanningServices';
import type { PlanningState } from '../../application/ports/PlanningRepository';
import type { ProgressContribution } from '../../domain/planner/ProgressContribution';
import { ActionGoalProgress } from './ActionGoalProgress';
import { PlanningProvider } from './PlanningContext';

const now = new Date('2026-10-02T10:00:00Z');
const goal = Goal.create({
  id: EntityId.create('reading-goal'),
  title: 'Прочитать книги',
  status: 'active',
  measurement: {
    mode: 'count',
    target: 66,
    unit: 'книг',
    start: null,
    direction: 'at_least',
    cycle: null,
  },
  now,
});
const action = LifeAction.createDraft({
  id: EntityId.create('reading-action'),
  title: LifeActionTitle.create('Читать'),
  goalId: goal.id,
  createdAt: now,
  eventId: EntityId.create('reading-created'),
});

function fact(id: string, amount: number | null): ProgressContribution {
  return {
    id,
    goalId: goal.id.toString(),
    amount,
    source: id.startsWith('initial:') ? 'initial' : 'manual',
    actionId: null,
    completionKey: null,
    linkId: null,
    effectiveDate: '2026-10-02',
    occurredAt: now.toISOString(),
    voided: false,
    reason: 'Тестовое значение',
    version: 1,
    schemaVersion: 1,
    updatedAt: now.toISOString(),
  };
}

function render(
  contributions: ProgressContribution[],
  options: { linkedOnly?: boolean; pending?: boolean; goalOverride?: Goal } = {},
) {
  const linkedAction = options.linkedOnly
    ? LifeAction.createDraft({
        id: action.id,
        title: action.title,
        createdAt: now,
        eventId: EntityId.create('reading-linked-created'),
      })
    : action;
  const state: PlanningState = {
    goals: [options.goalOverride ?? goal],
    actions: [linkedAction],
    periods: [],
    memberships: [],
    decisions: [],
    links: options.linkedOnly
      ? [
          {
            id: 'link:action:reading-action:reading-goal',
            sourceType: 'action',
            sourceId: action.id.toString(),
            goalId: goal.id.toString(),
            mode: 'fixed',
            amount: 1,
            removed: false,
            effectiveFrom: now.toISOString(),
            version: 1,
            schemaVersion: 1,
            updatedAt: now.toISOString(),
          },
        ]
      : [],
    contributions: options.pending ? [...contributions, fact('pending', null)] : contributions,
    rules: [],
    legacyFocus: [],
    journal: [],
  };
  return renderToStaticMarkup(
    <PlanningProvider
      value={{
        progress: createGoalProgressReader(state),
        today: '2026-10-02',
        services: {} as PlanningServices,
        state,
        refresh: async () => {},
        refreshWithOutcome: async () => ({ status: 'ready' }),
        error: null,
        refreshing: false,
      }}
    >
      <ActionGoalProgress action={linkedAction} />
    </PlanningProvider>,
  );
}

describe('ActionGoalProgress', () => {
  it('shows the current measurable goal value on an action row', () => {
    expect(render([fact('initial:reading-goal', 0), fact('twenty', 20)])).toContain(
      'Цель: 20 из 66 книг',
    );
  });

  it('shows an explicitly linked measurable goal even without an ordinary goal link', () => {
    expect(
      render([fact('initial:reading-goal', 0), fact('twenty', 20)], { linkedOnly: true }),
    ).toContain('Цель: 20 из 66 книг');
  });

  it('does not present an incomplete number as final during sync', () => {
    expect(render([fact('twenty', 20)])).toContain('Цель: данные синхронизируются');
    expect(render([fact('twenty', 20)])).not.toContain('20 из 66');
  });

  it('marks pending contributions next to a known value', () => {
    expect(
      render([fact('initial:reading-goal', 0), fact('twenty', 20)], { pending: true }),
    ).toContain('ожидают значения: 1');
  });

  it('shows the older metric goal format used by existing goals', () => {
    const legacy = Goal.create({
      id: goal.id,
      title: goal.title,
      status: 'active',
      progress: { type: 'metric', current: 20, target: 66, unit: 'раз' },
      now,
    });
    expect(render([], { goalOverride: legacy })).toContain('Цель: 20 из 66 раз');
  });
});
