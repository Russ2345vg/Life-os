import {
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  durationMinutes,
  type DayDate,
  type EffectiveRoutineOccurrence,
  type RoutineOccurrenceOverrideType,
} from '../../domain';

export function deviationTitle(type: RoutineOccurrenceOverrideType): string {
  switch (type) {
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed:
      return 'Начать позже';
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped:
      return 'Пропустить появление';
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled:
      return 'Перенести появление';
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened:
      return 'Сократить появление';
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction:
      return 'Заменить действие';
  }
}

export function deviationLabel(occurrence: EffectiveRoutineOccurrence): string {
  switch (occurrence.deviationType) {
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.delayed:
      return `Начало перенесено с ${occurrence.originalStartTime}`;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.skipped:
      return `Пропущено · ${occurrence.originalStartTime}–${occurrence.originalEndTime} · ${occurrence.title}`;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled:
      return occurrence.isRescheduledSource
        ? `Перенесено на ${formatOccurrenceDate(occurrence.override!.targetDate!)} в ${occurrence.override!.targetStartTime}`
        : `Перенесено с ${formatOccurrenceDate(occurrence.occurrenceDate)}`;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.shortened:
      return `Сокращено с ${formatDuration(durationMinutes(occurrence.originalStartTime, occurrence.originalEndTime))} до ${formatDuration(durationMinutes(occurrence.effectiveStartTime, occurrence.effectiveEndTime))}`;
    case ROUTINE_OCCURRENCE_OVERRIDE_TYPE.replacementAction:
      return 'Действие заменено для этого появления';
    case null:
      return '';
  }
}

export function formatOccurrenceDate(date: DayDate): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(`${date.toString()}T00:00:00`),
  );
}

function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} ч`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
