import type { CreateDecisionForDate, GetDecisionsForDate } from '../../application';
import { DECISION_KIND, type DayDate, type Decision, type DecisionKind } from '../../domain';

type DecisionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly decisions: readonly Decision[] };

export interface DecisionFormState {
  readonly kind: DecisionKind;
  readonly title: string;
  readonly expectedResult: string;
}

type DecisionSubmissionResult =
  | { readonly ok: true; readonly decisions: readonly Decision[] }
  | { readonly ok: false; readonly message: string };

export interface TodayPageState {
  readonly decisions: DecisionsState;
  readonly isFormOpen: boolean;
  readonly isSaving: boolean;
  readonly form: DecisionFormState;
  readonly formError: string | null;
}

export type TodayPageAction =
  | { readonly type: 'load_started' }
  | { readonly type: 'load_succeeded'; readonly decisions: readonly Decision[] }
  | { readonly type: 'load_failed' }
  | { readonly type: 'open_form' }
  | { readonly type: 'close_form' }
  | { readonly type: 'kind_changed'; readonly kind: DecisionKind }
  | { readonly type: 'title_changed'; readonly title: string }
  | { readonly type: 'expected_result_changed'; readonly expectedResult: string }
  | { readonly type: 'save_started' }
  | { readonly type: 'save_failed'; readonly message: string }
  | { readonly type: 'save_succeeded' };

export const INITIAL_TODAY_PAGE_STATE: TodayPageState = {
  decisions: { status: 'loading' },
  isFormOpen: false,
  isSaving: false,
  form: createEmptyForm(),
  formError: null,
};

export function todayPageReducer(state: TodayPageState, action: TodayPageAction): TodayPageState {
  switch (action.type) {
    case 'load_started':
      return { ...state, decisions: { status: 'loading' } };
    case 'load_succeeded':
      return { ...state, decisions: { status: 'ready', decisions: action.decisions } };
    case 'load_failed':
      return { ...state, decisions: { status: 'error' } };
    case 'open_form':
      return { ...state, isFormOpen: true, formError: null };
    case 'close_form':
      return { ...state, isFormOpen: false, formError: null };
    case 'kind_changed':
      return { ...state, form: { ...state.form, kind: action.kind }, formError: null };
    case 'title_changed':
      return { ...state, form: { ...state.form, title: action.title }, formError: null };
    case 'expected_result_changed':
      return {
        ...state,
        form: { ...state.form, expectedResult: action.expectedResult },
        formError: null,
      };
    case 'save_started':
      return { ...state, isSaving: true, formError: null };
    case 'save_failed':
      return { ...state, isSaving: false, formError: action.message };
    case 'save_succeeded':
      return {
        ...state,
        isSaving: false,
        isFormOpen: false,
        form: createEmptyForm(),
        formError: null,
      };
  }
}

export function validateDecisionForm(form: DecisionFormState): string | null {
  if (form.title.trim().length === 0) {
    return 'Введите название решения';
  }

  if (form.kind === DECISION_KIND.main && form.expectedResult.trim().length === 0) {
    return 'Укажите ожидаемый результат';
  }

  return null;
}

export async function createDecisionAndReload(input: {
  readonly currentDate: DayDate;
  readonly form: DecisionFormState;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly getDecisionsForDate: Pick<GetDecisionsForDate, 'execute'>;
}): Promise<DecisionSubmissionResult> {
  const result = await input.createDecisionForDate.execute({
    title: input.form.title,
    kind: input.form.kind,
    plannedDate: input.currentDate,
    ...(input.form.expectedResult.trim().length === 0
      ? {}
      : { expectedResult: input.form.expectedResult }),
  });

  if (!result.ok) {
    return { ok: false, message: decisionErrorMessage(result.error.code) };
  }

  return {
    ok: true,
    decisions: await input.getDecisionsForDate.execute(input.currentDate),
  };
}

function decisionErrorMessage(code: string): string {
  switch (code) {
    case 'decision.main_limit_reached':
      return 'На сегодня уже назначены три главных решения';
    case 'decision_title.invalid':
      return 'Введите название решения';
    case 'decision.main_requires_expected_result':
      return 'Укажите ожидаемый результат';
    default:
      return 'Не удалось создать решение';
  }
}

function createEmptyForm(): DecisionFormState {
  return { kind: DECISION_KIND.main, title: '', expectedResult: '' };
}
