import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  DAY_STATUS,
  DECISION_KIND,
  Day,
  DayDate,
  EntityId,
  SESSION_COMPLETION_KIND,
  type LifeAction,
} from '../../domain';
import type { EveningReviewSnapshot } from '../../application';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { EveningReviewPanelView } from './EveningReviewPanel';
import {
  buildCompleteCurrentDayInput,
  canCompleteAction,
  createInitialEveningActionForms,
  createInitialTomorrowDecisionForms,
  getEveningReviewReadiness,
  updateEveningActionForm,
  validateEveningReviewSubmission,
  type EveningActionForms,
  type TomorrowDecisionForm,
} from './EveningReviewPanelState';

const TODAY = DayDate.create('2026-08-05');
const TOMORROW = DayDate.create('2026-08-06');
const NOOP = () => undefined;

function renderPanel(
  snapshot: EveningReviewSnapshot,
  options: {
    readonly summary?: string;
    readonly actionForms?: EveningActionForms;
    readonly tomorrowForms?: readonly TomorrowDecisionForm[];
    readonly error?: string | null;
  } = {},
): string {
  return renderToStaticMarkup(
    EveningReviewPanelView({
      snapshot,
      summary: options.summary ?? '',
      actionForms: options.actionForms ?? createInitialEveningActionForms(snapshot),
      tomorrowForms: options.tomorrowForms ?? createInitialTomorrowDecisionForms(snapshot),
      isSubmitting: false,
      error: options.error ?? null,
      onClose: NOOP,
      onSummaryChange: NOOP,
      onActionKindChange: NOOP,
      onActionActualResultChange: NOOP,
      onActionDateChange: NOOP,
      onActionReasonChange: NOOP,
      onAddTomorrowDecision: NOOP,
      onUpdateTomorrowDecision: NOOP,
      onRemoveTomorrowDecision: NOOP,
      onSubmit: NOOP,
    }),
  );
}

describe('EveningReviewPanel', () => {
  it('показывает единый обзор решений, действий и рабочих сессий текущего дня', () => {
    const active = markLifeActionInProgress(createReadyLifeAction('active', TODAY));
    const completed = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('completed', TODAY)),
    );
    const snapshot = createSnapshot({
      decisions: [createPlannedDecision('today-main', TODAY, DECISION_KIND.main, 1)],
      lifeActions: [active, completed],
      actionSessions: [createCompletedSession(active)],
    });

    const markup = renderPanel(snapshot);

    expect(markup).toContain('Вечерний контроль и завершение дня');
    expect(markup).toContain('Единое состояние');
    expect(markup).toContain('Решение today-main');
    expect(markup).toContain('Действие active');
    expect(markup).toContain('Уже обработано:');
    expect(markup).toContain('Сессии');
    expect(markup).toContain('Завершить день');
  });

  it.each(['running', 'paused'] as const)(
    'явно блокирует завершение дня при %s-сессии',
    (status) => {
      const action = markLifeActionInProgress(createReadyLifeAction(`blocked-${status}`, TODAY));
      const session = ActionSession.start({
        id: id(`session-${status}`),
        lifeActionId: action.id,
        startedAt: new Date('2026-08-05T19:00:00.000+09:00'),
        eventId: id(`session-${status}-started`),
      });
      if (status === 'paused') {
        session.pause(new Date('2026-08-05T19:20:00.000+09:00'), id('session-paused'));
      }

      const markup = renderPanel(
        createSnapshot({ lifeActions: [action], unfinishedSession: session }),
      );

      expect(markup).toContain('блокирует завершение дня');
      expect(markup).toContain('disabled=""');
    },
  );

  it('требует явное решение по каждому незавершённому действию', () => {
    const action = createReadyLifeAction('unresolved', TODAY);
    const snapshot = createSnapshot({ lifeActions: [action] });

    expect(
      validateEveningReviewSubmission(
        snapshot,
        'Итог дня',
        createInitialEveningActionForms(snapshot),
        [mainTomorrowForm()],
      ),
    ).toBe('Обработайте действие «Действие unresolved»');
  });

  it('разрешает завершить действие только при начатом выполнении и завершённой сессии', () => {
    const ready = createReadyLifeAction('ready', TODAY);
    const inProgress = markLifeActionInProgress(createReadyLifeAction('progress', TODAY));
    const withoutEvidence = createSnapshot({ lifeActions: [ready, inProgress] });
    const withEvidence = createSnapshot({
      lifeActions: [inProgress],
      actionSessions: [createCompletedSession(inProgress)],
    });

    expect(canCompleteAction(ready, withoutEvidence)).toBe(false);
    expect(canCompleteAction(inProgress, withoutEvidence)).toBe(false);
    expect(canCompleteAction(inProgress, withEvidence)).toBe(true);
    expect(renderPanel(withoutEvidence)).toContain(
      'Завершение доступно только после начатого действия и завершённой рабочей сессии.',
    );
  });

  it('собирает отдельные команды завершения, переноса и отмены без изменения истории', () => {
    const completing = markLifeActionInProgress(createReadyLifeAction('complete', TODAY));
    const moving = createReadyLifeAction('move', TODAY);
    const cancelling = createReadyLifeAction('cancel', TODAY);
    const snapshot = createSnapshot({
      lifeActions: [completing, moving, cancelling],
      actionSessions: [createCompletedSession(completing)],
    });
    let forms = createInitialEveningActionForms(snapshot);
    forms = updateEveningActionForm(forms, completing.id.toString(), {
      kind: 'complete',
      actualResult: 'Фактический результат',
    });
    forms = updateEveningActionForm(forms, moving.id.toString(), {
      kind: 'reschedule',
      newPlannedDate: TOMORROW.toString(),
    });
    forms = updateEveningActionForm(forms, cancelling.id.toString(), {
      kind: 'cancel',
      reason: 'Потеряло актуальность',
    });

    const input = buildCompleteCurrentDayInput(snapshot, 'Итог дня', forms, [mainTomorrowForm()]);

    expect(input.actionResolutions.map((resolution) => resolution.kind)).toEqual([
      'complete',
      'reschedule',
      'cancel',
    ]);
    expect(input.summary).toBe('Итог дня');
    expect(input.tomorrowDecisions).toEqual([
      {
        kind: DECISION_KIND.main,
        title: 'Главное решение на завтра',
        expectedResult: 'Проверяемый результат',
      },
    ]);
    expect(completing.status).not.toBe('completed');
    expect(moving.plannedDate?.equals(TODAY)).toBe(true);
    expect(cancelling.status).not.toBe('cancelled');
  });

  it('требует итог дня и хотя бы одно главное решение на завтра', () => {
    const snapshot = createSnapshot();

    expect(validateEveningReviewSubmission(snapshot, ' ', {}, [mainTomorrowForm()])).toBe(
      'Запишите итог дня',
    );
    expect(validateEveningReviewSubmission(snapshot, 'Итог', {}, [])).toBe(
      'Подготовьте хотя бы одно главное решение на завтра',
    );
  });

  it('держит кнопку завершения заблокированной и показывает ближайшее обязательное действие', () => {
    const snapshot = createSnapshot();

    const markup = renderPanel(snapshot);

    expect(markup).toContain('data-completion-ready="false"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Осталось выполнить');
    expect(markup).toContain('Запишите итог дня');
    expect(markup).toContain('Условия завершения дня');
    expect(markup).toContain('Итог заполнен');
  });

  it('активирует завершение только после выполнения всех обязательных условий', () => {
    const snapshot = createSnapshot();
    const readiness = getEveningReviewReadiness(snapshot, 'Итог дня', {}, [mainTomorrowForm()]);
    const markup = renderPanel(snapshot, {
      summary: 'Итог дня',
      tomorrowForms: [mainTomorrowForm()],
    });

    expect(readiness.canComplete).toBe(true);
    expect(readiness.blockingMessage).toBeNull();
    expect(markup).toContain('data-completion-ready="true"');
    expect(markup).not.toContain('data-completion-ready="true" disabled=""');
    expect(markup).toContain('Всё готово к завершению');
    expect(markup).toContain('aria-current="step"><span>5</span>Завершение');
  });

  it('сворачивает пустой день в одно компактное сообщение', () => {
    const markup = renderPanel(createSnapshot());

    expect(markup).toContain('Сегодня решений, действий и рабочих сессий не зафиксировано.');
    expect(markup).not.toContain('class="evening-review-metrics"');
  });

  it('явно показывает режим восстановления прошлого активного дня', () => {
    const snapshot = createSnapshot({ isRecoveryReview: true });
    const markup = renderPanel(snapshot);

    expect(markup).toContain('Восстановление и завершение прошлого дня');
    expect(markup).toContain('Решения для продолжения');
    expect(markup).toContain('Продолжение');
    expect(markup).toContain('Главное решение для продолжения готово');
  });

  it('не создаёт пустую форму, когда главное решение на завтра уже сохранено', () => {
    const snapshot = createSnapshot({
      tomorrowDecisions: [createPlannedDecision('tomorrow-main', TOMORROW, DECISION_KIND.main, 1)],
    });

    expect(createInitialTomorrowDecisionForms(snapshot)).toEqual([]);
    expect(validateEveningReviewSubmission(snapshot, 'Итог', {}, [])).toBeNull();
    expect(renderPanel(snapshot)).toContain('Решение tomorrow-main');
  });
});

function createSnapshot(overrides: Partial<EveningReviewSnapshot> = {}): EveningReviewSnapshot {
  return {
    day: overrides.day ?? createOpenDay(),
    currentDate: TODAY,
    tomorrowDate: TOMORROW,
    isRecoveryReview: overrides.isRecoveryReview ?? false,
    decisions: overrides.decisions ?? [],
    lifeActions: overrides.lifeActions ?? [],
    actionSessions: overrides.actionSessions ?? [],
    unfinishedSession: overrides.unfinishedSession ?? null,
    tomorrowDecisions: overrides.tomorrowDecisions ?? [],
  };
}

function createOpenDay(): Day {
  const day = Day.openCurrent({
    id: id('evening-day'),
    currentDate: TODAY,
    occurredAt: new Date('2026-08-05T08:00:00.000+09:00'),
    createdEventId: id('evening-day-created'),
    openedEventId: id('evening-day-opened'),
  });
  expect(day.status).toBe(DAY_STATUS.open);
  return day;
}

function createCompletedSession(lifeAction: LifeAction): ActionSession {
  const session = ActionSession.start({
    id: id(`session-${lifeAction.id.toString()}`),
    lifeActionId: lifeAction.id,
    startedAt: new Date('2026-08-05T18:00:00.000+09:00'),
    eventId: id(`session-${lifeAction.id.toString()}-started`),
  });
  session.complete({
    completedAt: new Date('2026-08-05T19:00:00.000+09:00'),
    completionKind: SESSION_COMPLETION_KIND.completed,
    eventId: id(`session-${lifeAction.id.toString()}-completed`),
  });
  return session;
}

function mainTomorrowForm(): TomorrowDecisionForm {
  return {
    formId: 'tomorrow-main-form',
    kind: DECISION_KIND.main,
    title: 'Главное решение на завтра',
    expectedResult: 'Проверяемый результат',
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
