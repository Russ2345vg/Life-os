import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TomorrowPlanSnapshot } from '../../application';
import {
  ActionExpectedResult,
  Day,
  DayDate,
  Decision,
  DecisionTitle,
  DECISION_KIND,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_MODE,
  EVENING_MODE_REASON,
  ExpectedResult,
  LifeAction,
  LifeActionTitle,
  TOMORROW_PLAN_STATUS,
  TomorrowPlan,
} from '../../domain';
import { buildEveningKpis } from './EveningCommandCenterPresentation';
import { TomorrowCompleteSummary } from './TomorrowComposer';

const OCCURRED_AT = new Date('2026-09-02T20:00:00.000+09:00');
const TARGET_DATE = DayDate.create('2026-09-03');

describe('Evening Tomorrow saved state', () => {
  it('показывает компактный summary с реальными данными и одной выбранной границей', () => {
    const html = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot: createCompletedSnapshot(),
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Перейти к подготовке →',
      }),
    );

    expect(html).toContain('Завтра подготовлено');
    expect(html).toContain('У вас есть главное, граница результата и конкретный первый шаг.');
    expect(html).toContain('Выпустить сохранённое состояние');
    expect(html).toContain('LifeOS · Продукт');
    expect(html).toContain('Граница результата');
    expect(html).toContain('Норма');
    expect(html).toContain('Релиз готов к проверке');
    expect(html).toContain('Открыть итоговую проверку');
    expect(html).toContain('Проверить мобильную композицию');
    expect(html).not.toContain('Минимальный рабочий результат');
    expect(html).not.toContain('Расширенный результат');
    expect(html).not.toContain('tomorrow-outcome-boundaries');
    expect(html).not.toContain('Архитектура дня сохранена');
  });

  it('не показывает блок «Дополнительно», когда реальных дополнительных Решений нет', () => {
    const snapshot = createCompletedSnapshot();
    const html = renderToStaticMarkup(
      createElement(TomorrowCompleteSummary, {
        snapshot: { ...snapshot, supportingDecisions: [] },
        isQuick: false,
        onEdit: () => undefined,
        onContinue: () => undefined,
        actionLabel: 'Перейти к подготовке →',
      }),
    );

    expect(html).not.toContain('Дополнительно');
    expect(html).not.toContain('Дополнительные Решения не добавлены');
  });

  it('возвращает форму через edit и вызывает переход к следующему шагу только primary action', () => {
    const onEdit = vi.fn();
    const onContinue = vi.fn();
    const tree = TomorrowCompleteSummary({
      snapshot: createCompletedSnapshot(),
      isQuick: false,
      onEdit,
      onContinue,
      actionLabel: 'Перейти к подготовке →',
    });

    findButton(tree, 'Изменить план').props.onClick?.();
    expect(onEdit).toHaveBeenCalledWith('all');
    expect(onContinue).not.toHaveBeenCalled();

    findButton(tree, 'Перейти к подготовке →').props.onClick?.();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('помечает status card «Завтра» подготовленной сразу после save без смены структуры KPI', () => {
    const cycle = createPlanningTomorrowCycle();
    const kpis = buildEveningKpis(
      {
        cycle,
        day: Day.openCurrent({
          id: cycle.dayId,
          currentDate: cycle.dateKey,
          occurredAt: OCCURRED_AT,
          createdEventId: EntityId.create('saved-state-day-created'),
          openedEventId: EntityId.create('saved-state-day-opened'),
        }),
        currentDate: cycle.dateKey,
        tomorrowDate: TARGET_DATE,
        isRecoveryReview: false,
        decisions: [],
        lifeActions: [],
        actionSessions: [],
        unfinishedSession: null,
        tomorrowDecisions: [],
      },
      null,
      true,
    );

    expect(kpis.map((item) => item.label)).toEqual(['Осталось сегодня', 'Завтра', 'Режим']);
    expect(kpis.find((item) => item.label === 'Завтра')).toMatchObject({
      value: 'Подготовлено',
      tone: 'ready',
    });
    expect(cycle.state).toBe('PLANNING_TOMORROW');
  });
});

interface TestButtonProps {
  readonly children?: ReactNode;
  readonly onClick?: () => void;
}

function findButton(node: ReactNode, label: string): ReactElement<TestButtonProps> {
  let match: ReactElement<TestButtonProps> | null = null;

  function visit(current: ReactNode): void {
    if (
      match !== null ||
      current === null ||
      current === undefined ||
      typeof current === 'boolean'
    ) {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement<TestButtonProps>(current)) return;
    if (current.type === 'button' && textContent(current.props.children).includes(label)) {
      match = current;
      return;
    }
    visit(current.props.children);
  }

  visit(node);
  if (match === null) throw new Error(`Button not found: ${label}`);
  return match;
}

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (!isValidElement<{ readonly children?: ReactNode }>(node)) return '';
  return textContent(node.props.children);
}

function createCompletedSnapshot(): TomorrowPlanSnapshot {
  const primary = createDecision(
    'saved-state-primary',
    'Выпустить сохранённое состояние',
    DECISION_KIND.main,
    'LifeOS',
  );
  const supporting = createDecision(
    'saved-state-supporting',
    'Проверить мобильную композицию',
    DECISION_KIND.additional,
  );
  const firstAction = LifeAction.createDraft({
    id: EntityId.create('saved-state-first-action'),
    title: LifeActionTitle.create('Открыть итоговую проверку'),
    decisionId: primary.id,
    createdAt: OCCURRED_AT,
    eventId: EntityId.create('saved-state-first-action-created'),
  });
  firstAction.makeReady({
    expectedResult: ActionExpectedResult.create('Проверка запущена'),
    plannedDate: TARGET_DATE,
    occurredAt: OCCURRED_AT,
    eventId: EntityId.create('saved-state-first-action-ready'),
  });
  const plan = TomorrowPlan.rehydrate({
    id: EntityId.create('saved-state-plan'),
    cycleId: EntityId.create('saved-state-cycle'),
    sourceDayId: EntityId.create('saved-state-source-day'),
    targetDayId: EntityId.create('saved-state-target-day'),
    targetDateKey: TARGET_DATE,
    directionId: null,
    vector: 'Продукт',
    primaryDecisionId: primary.id,
    minimumOutcome: 'Минимальный рабочий результат',
    targetOutcome: 'Релиз готов к проверке',
    stretchOutcome: 'Расширенный результат',
    firstActionId: firstAction.id,
    supportingDecisionIds: [supporting.id],
    status: TOMORROW_PLAN_STATUS.completed,
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
    completedAt: OCCURRED_AT,
    version: 8,
  });

  return {
    plan,
    primaryDecision: primary,
    firstAction,
    supportingDecisions: [supporting],
    carriedDecisionCandidate: null,
    scopeTooLargeWarning: false,
    targetDecisionCount: 2,
    targetLifeActionCount: 1,
    targetDecisions: [primary, supporting],
    targetLifeActions: [firstAction],
    overloaded: false,
  };
}

function createDecision(
  id: string,
  title: string,
  kind: (typeof DECISION_KIND)[keyof typeof DECISION_KIND],
  projectReference?: string,
): Decision {
  const decision = Decision.createDraft({
    id: EntityId.create(id),
    title: DecisionTitle.create(title),
    kind,
    ...(kind === DECISION_KIND.main
      ? { expectedResult: ExpectedResult.create('Сохранённое состояние принято') }
      : {}),
    ...(projectReference === undefined ? {} : { projectReference }),
    occurredAt: OCCURRED_AT,
    eventId: EntityId.create(`${id}-created`),
  });
  decision.plan({
    plannedDate: TARGET_DATE,
    kind,
    ...(kind === DECISION_KIND.main
      ? { order: 1, expectedResult: ExpectedResult.create('Сохранённое состояние принято') }
      : {}),
    occurredAt: OCCURRED_AT,
    eventId: EntityId.create(`${id}-planned`),
  });
  return decision;
}

function createPlanningTomorrowCycle(): EveningCycle {
  const cycle = EveningCycle.create({
    id: EntityId.create('saved-state-evening-cycle'),
    dayId: EntityId.create('saved-state-evening-day'),
    dateKey: DayDate.create('2026-09-02'),
    occurredAt: OCCURRED_AT,
  });
  cycle.switchMode(EVENING_CYCLE_MODE.quick, EVENING_MODE_REASON.userSelected, OCCURRED_AT);
  cycle.start(OCCURRED_AT);
  cycle.beginResolving(OCCURRED_AT);
  cycle.completeResolving(OCCURRED_AT);
  cycle.skipReflection(OCCURRED_AT);
  return cycle;
}
