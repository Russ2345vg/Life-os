import { DECISION_KIND, DECISION_STATUS, type DayDate, type Decision } from '../../domain';
import {
  createDecisionCreationForm,
  createEmptyDecisionCreationErrors,
  type DecisionCreationFormErrors,
  type DecisionCreationFormState,
} from './DecisionCreationFormState';

export const TOMORROW_PLAN_CAPACITY = 3;

type PlanningMode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly decision: Decision };

export interface TomorrowPlanningState {
  readonly mode: PlanningMode;
  readonly form: DecisionCreationFormState;
  readonly errors: DecisionCreationFormErrors;
  readonly isSaving: boolean;
  readonly deleteCandidate: Decision | null;
  readonly isDeleting: boolean;
  readonly deleteError: string | null;
  readonly notice: string | null;
}

export type TomorrowPlanningEvent =
  | { readonly type: 'form_changed'; readonly form: DecisionCreationFormState }
  | { readonly type: 'create_requested'; readonly plannedDate: DayDate }
  | { readonly type: 'edit_requested'; readonly decision: Decision; readonly plannedDate: DayDate }
  | { readonly type: 'save_started' }
  | { readonly type: 'save_failed'; readonly errors: DecisionCreationFormErrors }
  | { readonly type: 'create_succeeded'; readonly plannedDate: DayDate }
  | { readonly type: 'edit_succeeded'; readonly plannedDate: DayDate }
  | { readonly type: 'delete_requested'; readonly decision: Decision }
  | { readonly type: 'delete_cancelled' }
  | { readonly type: 'delete_started' }
  | { readonly type: 'delete_failed'; readonly message: string }
  | { readonly type: 'delete_succeeded'; readonly plannedDate: DayDate }
  | { readonly type: 'plan_saved' }
  | { readonly type: 'notice_cleared' };

export function createTomorrowPlanningState(plannedDate: DayDate): TomorrowPlanningState {
  return {
    mode: { kind: 'create' },
    form: createDecisionCreationForm(plannedDate),
    errors: createEmptyDecisionCreationErrors(),
    isSaving: false,
    deleteCandidate: null,
    isDeleting: false,
    deleteError: null,
    notice: null,
  };
}

export function tomorrowPlanningReducer(
  state: TomorrowPlanningState,
  event: TomorrowPlanningEvent,
): TomorrowPlanningState {
  switch (event.type) {
    case 'form_changed':
      return {
        ...state,
        form: event.form,
        errors: createEmptyDecisionCreationErrors(),
        notice: null,
      };
    case 'create_requested':
      return {
        ...state,
        mode: { kind: 'create' },
        form: createDecisionCreationForm(event.plannedDate),
        errors: createEmptyDecisionCreationErrors(),
        notice: null,
      };
    case 'edit_requested':
      return {
        ...state,
        mode: { kind: 'edit', decision: event.decision },
        form: formFromDecision(event.decision, event.plannedDate),
        errors: createEmptyDecisionCreationErrors(),
        notice: null,
      };
    case 'save_started':
      return { ...state, isSaving: true, errors: createEmptyDecisionCreationErrors() };
    case 'save_failed':
      return { ...state, isSaving: false, errors: event.errors };
    case 'create_succeeded':
      return {
        ...state,
        mode: { kind: 'create' },
        form: createDecisionCreationForm(event.plannedDate),
        errors: createEmptyDecisionCreationErrors(),
        isSaving: false,
        notice: 'Решение добавлено',
      };
    case 'edit_succeeded':
      return {
        ...state,
        mode: { kind: 'create' },
        form: createDecisionCreationForm(event.plannedDate),
        errors: createEmptyDecisionCreationErrors(),
        isSaving: false,
        notice: 'Изменения сохранены',
      };
    case 'delete_requested':
      return { ...state, deleteCandidate: event.decision, deleteError: null, notice: null };
    case 'delete_cancelled':
      return { ...state, deleteCandidate: null, deleteError: null };
    case 'delete_started':
      return { ...state, isDeleting: true, deleteError: null };
    case 'delete_failed':
      return { ...state, isDeleting: false, deleteError: event.message };
    case 'delete_succeeded':
      return {
        ...state,
        mode: { kind: 'create' },
        form: createDecisionCreationForm(event.plannedDate),
        deleteCandidate: null,
        isDeleting: false,
        deleteError: null,
        notice: 'Решение удалено из плана',
      };
    case 'plan_saved':
      return { ...state, notice: 'План на завтра сохранён' };
    case 'notice_cleared':
      return { ...state, notice: null };
  }
}

export interface TomorrowPlanPresentation {
  readonly decisions: readonly Decision[];
  readonly count: number;
  readonly hasMain: boolean;
  readonly progress: number;
  readonly status: 'Добавьте главное Решение' | 'План формируется' | 'План готов';
}

export function createTomorrowPlanPresentation(
  decisions: readonly Decision[],
): TomorrowPlanPresentation {
  const activeDecisions = decisions
    .filter(isPlanningDecision)
    .sort(comparePlanningDecisions)
    .slice(0, TOMORROW_PLAN_CAPACITY);
  const count = activeDecisions.length;
  const hasMain = activeDecisions.some((decision) => decision.kind === DECISION_KIND.main);

  return {
    decisions: activeDecisions,
    count,
    hasMain,
    progress: (count / TOMORROW_PLAN_CAPACITY) * 100,
    status: !hasMain
      ? 'Добавьте главное Решение'
      : count === TOMORROW_PLAN_CAPACITY
        ? 'План готов'
        : 'План формируется',
  };
}

function formFromDecision(decision: Decision, plannedDate: DayDate): DecisionCreationFormState {
  return {
    kind: decision.kind,
    plannedDate: plannedDate.toString(),
    title: decision.title.toString(),
    reason: decision.reason ?? '',
    expectedResult: decision.expectedResult?.toString() ?? '',
    sphereId: decision.sphereId?.toString() ?? '',
    price: decision.price ?? '',
    sacrifices: decision.sacrifices ?? '',
    priority: decision.priority,
    projectReference: decision.projectReference ?? '',
    projectId: decision.projectId?.toString() ?? '',
  };
}

function isPlanningDecision(decision: Decision): boolean {
  return (
    !decision.isArchived() && !decision.isDeleted() && decision.status !== DECISION_STATUS.cancelled
  );
}

function comparePlanningDecisions(left: Decision, right: Decision): number {
  if (left.kind !== right.kind) {
    return left.kind === DECISION_KIND.main ? -1 : 1;
  }

  if (left.order !== right.order) {
    return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}
