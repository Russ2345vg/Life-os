import type {
  CompleteCurrentDayInput,
  EveningLifeActionResolution,
  TomorrowDecisionDraft,
} from '../../application';
import {
  ACTION_SESSION_STATUS,
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type DecisionKind,
  EntityId,
  type LifeAction,
} from '../../domain';
import type { EveningReviewSnapshot } from '../../application';

export type EveningActionResolutionKind = '' | 'complete' | 'reschedule' | 'cancel';

export interface EveningActionResolutionForm {
  readonly kind: EveningActionResolutionKind;
  readonly actualResult: string;
  readonly newPlannedDate: string;
  readonly reason: string;
}

export interface TomorrowDecisionForm {
  readonly formId: string;
  readonly kind: DecisionKind;
  readonly title: string;
  readonly expectedResult: string;
}

export type EveningActionForms = Readonly<Record<string, EveningActionResolutionForm>>;

export interface EveningReviewReadiness {
  readonly sessionsComplete: boolean;
  readonly routineComplete: boolean;
  readonly actionsResolved: boolean;
  readonly summaryRecorded: boolean;
  readonly tomorrowPrepared: boolean;
  readonly canComplete: boolean;
  readonly blockingMessage: string | null;
}

export function createInitialEveningActionForms(
  snapshot: EveningReviewSnapshot,
): EveningActionForms {
  return Object.fromEntries(
    snapshot.lifeActions.filter(isUnfinishedAction).map((lifeAction) => [
      lifeAction.id.toString(),
      {
        kind: '',
        actualResult: '',
        newPlannedDate: snapshot.tomorrowDate.toString(),
        reason: '',
      } satisfies EveningActionResolutionForm,
    ]),
  );
}

export function createInitialTomorrowDecisionForms(
  snapshot: EveningReviewSnapshot,
): readonly TomorrowDecisionForm[] {
  return hasActiveMainDecision(snapshot)
    ? []
    : [createEmptyTomorrowDecisionForm('tomorrow-decision-1')];
}

export function createEmptyTomorrowDecisionForm(formId: string): TomorrowDecisionForm {
  return {
    formId,
    kind: DECISION_KIND.main,
    title: '',
    expectedResult: '',
  };
}

export function updateEveningActionForm(
  forms: EveningActionForms,
  actionId: string,
  patch: Partial<EveningActionResolutionForm>,
): EveningActionForms {
  const current = forms[actionId];
  if (current === undefined) {
    return forms;
  }

  return {
    ...forms,
    [actionId]: {
      ...current,
      ...patch,
    },
  };
}

export function canCompleteAction(
  lifeAction: LifeAction,
  snapshot: EveningReviewSnapshot,
): boolean {
  return (
    lifeAction.status === LIFE_ACTION_STATUS.inProgress &&
    snapshot.actionSessions.some(
      (session) =>
        session.lifeActionId.equals(lifeAction.id) &&
        session.status === ACTION_SESSION_STATUS.completed &&
        session.completionKind === SESSION_COMPLETION_KIND.completed,
    )
  );
}

export function validateEveningReviewSubmission(
  snapshot: EveningReviewSnapshot,
  summary: string,
  actionForms: EveningActionForms,
  tomorrowForms: readonly TomorrowDecisionForm[],
): string | null {
  return getEveningReviewReadiness(snapshot, summary, actionForms, tomorrowForms).blockingMessage;
}

export function getEveningReviewReadiness(
  snapshot: EveningReviewSnapshot,
  summary: string,
  actionForms: EveningActionForms,
  tomorrowForms: readonly TomorrowDecisionForm[],
): EveningReviewReadiness {
  const openLoopError =
    snapshot.openLoops !== undefined && snapshot.openLoops.remaining > 0
      ? `Разберите незавершённые элементы: осталось ${snapshot.openLoops.remaining}`
      : null;
  const sessionError = getSessionError(snapshot);
  const routineError = getRoutineError(snapshot);
  const actionError = getActionResolutionError(snapshot, actionForms);
  const summaryError = summary.trim().length === 0 ? 'Запишите итог дня' : null;
  const tomorrowError = getTomorrowDecisionError(snapshot, tomorrowForms);
  const blockingMessage =
    openLoopError ?? sessionError ?? routineError ?? actionError ?? summaryError ?? tomorrowError;

  return {
    sessionsComplete: sessionError === null,
    routineComplete: routineError === null,
    actionsResolved: actionError === null,
    summaryRecorded: summaryError === null,
    tomorrowPrepared: tomorrowError === null,
    canComplete: blockingMessage === null,
    blockingMessage,
  };
}

function getRoutineError(snapshot: EveningReviewSnapshot): string | null {
  return snapshot.routineSummary === undefined || snapshot.routineSummary.runningExecution === null
    ? null
    : 'Сначала завершите или прервите текущий блок распорядка';
}

function getSessionError(snapshot: EveningReviewSnapshot): string | null {
  if (snapshot.unfinishedSession === null) {
    return null;
  }

  return snapshot.unfinishedSession.status === ACTION_SESSION_STATUS.paused
    ? 'Сначала завершите приостановленную рабочую сессию'
    : 'Сначала завершите активную рабочую сессию';
}

function getActionResolutionError(
  snapshot: EveningReviewSnapshot,
  actionForms: EveningActionForms,
): string | null {
  for (const action of snapshot.lifeActions.filter(isUnfinishedAction)) {
    const form = actionForms[action.id.toString()];
    if (form === undefined || form.kind === '') {
      return `Обработайте действие «${action.title.toString()}»`;
    }

    if (form.kind === 'complete') {
      if (!canCompleteAction(action, snapshot)) {
        return `Действие «${action.title.toString()}» пока нельзя завершить`;
      }
      if (form.actualResult.trim().length === 0) {
        return `Укажите фактический результат действия «${action.title.toString()}»`;
      }
    }

    if (form.kind === 'reschedule' && form.newPlannedDate.trim().length === 0) {
      return `Выберите новую дату для действия «${action.title.toString()}»`;
    }
  }

  return null;
}

function getTomorrowDecisionError(
  snapshot: EveningReviewSnapshot,
  tomorrowForms: readonly TomorrowDecisionForm[],
): string | null {
  const activeMainCount = snapshot.tomorrowDecisions.filter(
    (decision) =>
      !decision.isArchived() &&
      !decision.isDeleted() &&
      decision.kind === DECISION_KIND.main &&
      (decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress),
  ).length;
  let newMainCount = 0;

  for (const form of tomorrowForms) {
    const hasAnyValue = form.title.trim().length > 0 || form.expectedResult.trim().length > 0;
    if (!hasAnyValue) {
      continue;
    }
    if (form.title.trim().length === 0) {
      return 'Введите название решения на завтра';
    }
    if (form.kind === DECISION_KIND.main) {
      newMainCount += 1;
      if (form.expectedResult.trim().length === 0) {
        return 'Для главного решения на завтра укажите ожидаемый результат';
      }
    }
  }

  if (activeMainCount + newMainCount === 0) {
    return snapshot.isRecoveryReview
      ? 'Подготовьте хотя бы одно главное решение для продолжения'
      : 'Подготовьте хотя бы одно главное решение на завтра';
  }

  if (activeMainCount + newMainCount > 3) {
    return snapshot.isRecoveryReview
      ? 'На дату продолжения можно подготовить не более трёх главных решений'
      : 'На завтра можно подготовить не более трёх главных решений';
  }

  return null;
}

export function buildCompleteCurrentDayInput(
  snapshot: EveningReviewSnapshot,
  summary: string,
  actionForms: EveningActionForms,
  tomorrowForms: readonly TomorrowDecisionForm[],
  sphereId: EntityId | null = null,
): CompleteCurrentDayInput {
  const actionResolutions = snapshot.lifeActions
    .filter(isUnfinishedAction)
    .map((lifeAction): EveningLifeActionResolution => {
      const form = actionForms[lifeAction.id.toString()];
      if (form === undefined || form.kind === '') {
        throw new Error('Вечерний контроль содержит необработанное действие.');
      }

      switch (form.kind) {
        case 'complete':
          return {
            kind: 'complete',
            lifeActionId: lifeAction.id,
            actualResult: form.actualResult,
          };
        case 'reschedule':
          return {
            kind: 'reschedule',
            lifeActionId: lifeAction.id,
            newPlannedDate: form.newPlannedDate,
          };
        case 'cancel':
          return {
            kind: 'cancel',
            lifeActionId: lifeAction.id,
            reason: form.reason,
          };
      }
    });
  const tomorrowDecisions = tomorrowForms
    .filter((form) => form.title.trim().length > 0 || form.expectedResult.trim().length > 0)
    .map((form): TomorrowDecisionDraft => ({
      title: form.title,
      kind: form.kind,
      ...(form.expectedResult.trim().length === 0 ? {} : { expectedResult: form.expectedResult }),
    }));

  return {
    summary,
    sphereId,
    actionResolutions,
    tomorrowDecisions,
  };
}

export function isUnfinishedAction(lifeAction: LifeAction): boolean {
  return (
    lifeAction.status === LIFE_ACTION_STATUS.ready ||
    lifeAction.status === LIFE_ACTION_STATUS.inProgress
  );
}

function hasActiveMainDecision(snapshot: EveningReviewSnapshot): boolean {
  return snapshot.tomorrowDecisions.some(
    (decision) =>
      !decision.isArchived() &&
      !decision.isDeleted() &&
      decision.kind === DECISION_KIND.main &&
      (decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress),
  );
}
