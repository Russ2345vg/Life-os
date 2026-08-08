import {
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_RECURRENCE,
  type DayDate,
  type IsoWeekday,
  type RoutineBlock,
  type RoutineBlockCategory,
  type RoutineBlockAssignmentKind,
  type RoutineBlockRecurrenceKind,
} from '../../domain';

export interface RoutineBlockFormState {
  readonly anchorDate: string;
  readonly title: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly category: RoutineBlockCategory;
  readonly recurrence: RoutineBlockRecurrenceKind;
  readonly selectedWeekdays: readonly IsoWeekday[];
  readonly required: boolean;
  readonly assignmentKind: RoutineBlockAssignmentKind;
  readonly actionId: string;
}

export interface RoutineBlockFormErrors {
  readonly title?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly selectedWeekdays?: string;
  readonly actionId?: string;
}

export function createEmptyRoutineBlockForm(date: DayDate): RoutineBlockFormState {
  return {
    anchorDate: date.toString(),
    title: '',
    startTime: '',
    endTime: '',
    category: ROUTINE_BLOCK_CATEGORY.other,
    recurrence: ROUTINE_BLOCK_RECURRENCE.none,
    selectedWeekdays: [],
    required: false,
    assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.reminder,
    actionId: '',
  };
}

export function createRoutineBlockEditForm(block: RoutineBlock): RoutineBlockFormState {
  return {
    anchorDate: block.anchorDate.toString(),
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    category: block.category,
    recurrence: block.recurrence.kind,
    selectedWeekdays: [...block.recurrence.selectedWeekdays],
    required: block.required,
    assignmentKind: block.assignment.kind,
    actionId:
      block.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction
        ? block.assignment.actionId.toString()
        : '',
  };
}

export function validateRoutineBlockForm(form: RoutineBlockFormState): RoutineBlockFormErrors {
  const errors: {
    title?: string;
    startTime?: string;
    endTime?: string;
    selectedWeekdays?: string;
    actionId?: string;
  } = {};
  if (form.title.trim().length === 0) errors.title = 'Введите название блока.';
  if (form.startTime.length === 0) errors.startTime = 'Укажите время начала.';
  if (form.endTime.length === 0) errors.endTime = 'Укажите время окончания.';
  if (form.startTime.length > 0 && form.endTime.length > 0 && form.endTime <= form.startTime) {
    errors.endTime = 'Время окончания должно быть позже времени начала.';
  }
  if (
    form.recurrence === ROUTINE_BLOCK_RECURRENCE.selectedWeekdays &&
    form.selectedWeekdays.length === 0
  ) {
    errors.selectedWeekdays = 'Выберите хотя бы один день недели.';
  }
  if (
    form.assignmentKind === ROUTINE_BLOCK_ASSIGNMENT.existingAction &&
    form.actionId.length === 0
  ) {
    errors.actionId = 'Выберите незавершённое действие.';
  }
  return errors;
}

export function changeRoutineBlockAssignment(
  form: RoutineBlockFormState,
  assignmentKind: RoutineBlockAssignmentKind,
): RoutineBlockFormState {
  return {
    ...form,
    assignmentKind,
    actionId: assignmentKind === ROUTINE_BLOCK_ASSIGNMENT.existingAction ? form.actionId : '',
  };
}

export function hasRoutineBlockFormErrors(errors: RoutineBlockFormErrors): boolean {
  return Object.values(errors).some((value) => value !== undefined);
}
