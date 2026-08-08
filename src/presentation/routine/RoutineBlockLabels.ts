import {
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
} from '../../domain';

export const ROUTINE_ASSIGNMENT_LABELS = {
  [ROUTINE_BLOCK_ASSIGNMENT.reminder]: 'Напоминание',
  [ROUTINE_BLOCK_ASSIGNMENT.existingAction]: 'Существующее действие',
  [ROUTINE_BLOCK_ASSIGNMENT.createAction]: 'Создать действие',
  [ROUTINE_BLOCK_ASSIGNMENT.eveningReview]: 'Вечерний контроль',
  [ROUTINE_BLOCK_ASSIGNMENT.walk]: 'Прогулка',
} as const;

export const ROUTINE_CATEGORY_LABELS = {
  [ROUTINE_BLOCK_CATEGORY.sleep]: 'Сон',
  [ROUTINE_BLOCK_CATEGORY.morning]: 'Утро',
  [ROUTINE_BLOCK_CATEGORY.work]: 'Работа',
  [ROUTINE_BLOCK_CATEGORY.rest]: 'Отдых',
  [ROUTINE_BLOCK_CATEGORY.meal]: 'Питание',
  [ROUTINE_BLOCK_CATEGORY.physical]: 'Физическая активность',
  [ROUTINE_BLOCK_CATEGORY.personal]: 'Личное',
  [ROUTINE_BLOCK_CATEGORY.other]: 'Другое',
} as const;

export const ROUTINE_RECURRENCE_LABELS = {
  [ROUTINE_BLOCK_RECURRENCE.none]: 'Не повторяется',
  [ROUTINE_BLOCK_RECURRENCE.daily]: 'Ежедневно',
  [ROUTINE_BLOCK_RECURRENCE.weekdays]: 'По будням',
  [ROUTINE_BLOCK_RECURRENCE.weekends]: 'По выходным',
  [ROUTINE_BLOCK_RECURRENCE.selectedWeekdays]: 'Выбранные дни недели',
} as const;
