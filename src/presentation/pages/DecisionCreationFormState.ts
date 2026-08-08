import type { CreateDecisionForDate } from '../../application';
import {
  DayDate,
  DECISION_KIND,
  DECISION_PRIORITY,
  type Decision,
  type DecisionKind,
  type DecisionPriority,
} from '../../domain';

export interface DecisionCreationFormState {
  readonly kind: DecisionKind;
  readonly plannedDate: string;
  readonly title: string;
  readonly reason: string;
  readonly expectedResult: string;
  readonly sphere: string;
  readonly price: string;
  readonly sacrifices: string;
  readonly priority: DecisionPriority;
  readonly projectReference: string;
}

export interface DecisionCreationFormErrors {
  readonly kind: string | null;
  readonly plannedDate: string | null;
  readonly title: string | null;
  readonly reason: string | null;
  readonly expectedResult: string | null;
  readonly sphere: string | null;
  readonly price: string | null;
  readonly sacrifices: string | null;
  readonly priority: string | null;
  readonly projectReference: string | null;
  readonly form: string | null;
}

export type DecisionCreationValidation =
  | { readonly ok: true; readonly plannedDate: DayDate }
  | { readonly ok: false; readonly errors: DecisionCreationFormErrors };

export type DecisionCreationSubmissionResult =
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly errors: DecisionCreationFormErrors };

export function createDecisionCreationForm(plannedDate: DayDate): DecisionCreationFormState {
  return {
    kind: DECISION_KIND.main,
    plannedDate: plannedDate.toString(),
    title: '',
    reason: '',
    expectedResult: '',
    sphere: '',
    price: '',
    sacrifices: '',
    priority: DECISION_PRIORITY.normal,
    projectReference: '',
  };
}

export function createEmptyDecisionCreationErrors(): DecisionCreationFormErrors {
  return {
    kind: null,
    plannedDate: null,
    title: null,
    reason: null,
    expectedResult: null,
    sphere: null,
    price: null,
    sacrifices: null,
    priority: null,
    projectReference: null,
    form: null,
  };
}

export function validateDecisionCreationForm(
  form: DecisionCreationFormState,
  currentDate: DayDate,
): DecisionCreationValidation {
  let plannedDate: DayDate | null = null;
  let plannedDateError: string | null = null;

  try {
    plannedDate = DayDate.create(form.plannedDate);
    if (plannedDate.isBefore(currentDate)) {
      plannedDateError = 'Нельзя создать решение на прошедшую дату';
    }
  } catch {
    plannedDateError = 'Выберите корректную дату';
  }

  const errors: DecisionCreationFormErrors = {
    kind: Object.values(DECISION_KIND).includes(form.kind) ? null : 'Выберите вид решения',
    plannedDate: plannedDateError,
    title: validateRequiredText(form.title, 'Введите формулировку решения', 200),
    reason: validateOptionalText(form.reason, 1_000, 'Причина не может быть длиннее 1000 символов'),
    expectedResult:
      form.kind === DECISION_KIND.main
        ? validateRequiredText(
            form.expectedResult,
            'Укажите ожидаемый результат главного решения',
            1_000,
          )
        : validateOptionalText(
            form.expectedResult,
            1_000,
            'Ожидаемый результат не может быть длиннее 1000 символов',
          ),
    sphere: validateOptionalText(form.sphere, 120, 'Сфера не может быть длиннее 120 символов'),
    price: validateOptionalText(form.price, 500, 'Цена решения не может быть длиннее 500 символов'),
    sacrifices: validateOptionalText(
      form.sacrifices,
      1_000,
      'Жертвы не могут быть длиннее 1000 символов',
    ),
    priority: Object.values(DECISION_PRIORITY).includes(form.priority)
      ? null
      : 'Выберите приоритет решения',
    projectReference: validateOptionalText(
      form.projectReference,
      200,
      'Связь с проектом не может быть длиннее 200 символов',
    ),
    form: null,
  };

  if (hasDecisionCreationErrors(errors) || plannedDate === null) {
    return { ok: false, errors };
  }

  return { ok: true, plannedDate };
}

export async function submitDecisionCreation(input: {
  readonly form: DecisionCreationFormState;
  readonly currentDate: DayDate;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
}): Promise<DecisionCreationSubmissionResult> {
  const validation = validateDecisionCreationForm(input.form, input.currentDate);
  if (!validation.ok) {
    return validation;
  }

  const result = await input.createDecisionForDate.execute({
    title: input.form.title,
    kind: input.form.kind,
    plannedDate: validation.plannedDate,
    expectedResult: input.form.expectedResult,
    reason: input.form.reason,
    sphere: input.form.sphere,
    price: input.form.price,
    sacrifices: input.form.sacrifices,
    priority: input.form.priority,
    projectReference: input.form.projectReference,
  });

  if (!result.ok) {
    return { ok: false, errors: errorsForDecisionCreationCode(result.error.code) };
  }

  return { ok: true, decision: result.value };
}

export function hasDecisionCreationErrors(errors: DecisionCreationFormErrors): boolean {
  return Object.values(errors).some((value) => value !== null);
}

export function errorsForDecisionCreationCode(code: string): DecisionCreationFormErrors {
  const errors = createEmptyDecisionCreationErrors();

  switch (code) {
    case 'decision_title.invalid':
      return { ...errors, title: 'Введите корректную формулировку решения' };
    case 'decision.main_requires_expected_result':
      return { ...errors, expectedResult: 'Укажите ожидаемый результат главного решения' };
    case 'decision.invalid_reason':
      return { ...errors, reason: 'Проверьте причину решения' };
    case 'decision.invalid_sphere':
      return { ...errors, sphere: 'Проверьте сферу решения' };
    case 'decision.invalid_price':
      return { ...errors, price: 'Проверьте цену решения' };
    case 'decision.invalid_sacrifices':
      return { ...errors, sacrifices: 'Проверьте жертвы решения' };
    case 'decision.invalid_priority':
      return { ...errors, priority: 'Выберите приоритет решения' };
    case 'decision.invalid_project_reference':
      return { ...errors, projectReference: 'Проверьте связь с проектом' };
    case 'decision.planned_date_in_past':
      return { ...errors, plannedDate: 'Нельзя создать решение на прошедшую дату' };
    case 'decision.completed_day_is_immutable':
      return { ...errors, plannedDate: 'Завершённый день нельзя изменять' };
    case 'decision.duplicate_for_date':
      return { ...errors, title: 'Такое решение уже существует на выбранную дату' };
    case 'decision.main_limit_reached':
      return { ...errors, kind: 'На выбранную дату уже назначены три главных решения' };
    default:
      return { ...errors, form: 'Не удалось создать решение' };
  }
}

function validateRequiredText(
  value: string,
  emptyMessage: string,
  maximumLength: number,
): string | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return emptyMessage;
  }
  return normalized.length > maximumLength
    ? `Поле не может быть длиннее ${maximumLength} символов`
    : null;
}

function validateOptionalText(
  value: string,
  maximumLength: number,
  message: string,
): string | null {
  return value.trim().length > maximumLength ? message : null;
}
