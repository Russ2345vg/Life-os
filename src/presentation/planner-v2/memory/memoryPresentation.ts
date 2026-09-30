import type { MemoryContext, MemoryDraft, MemoryKind } from '../../../domain/memory';
import type { PlannerOption } from '../PlannerActionForm';

export interface MemoryCatalog {
  readonly spheres: readonly PlannerOption[];
  readonly directions: readonly PlannerOption[];
  readonly goals: readonly PlannerOption[];
}
export const MEMORY_LABELS: Readonly<Record<MemoryKind, string>> = {
  moment: 'Момент',
  achievement: 'Достижение',
  trip: 'Поездка',
  decision: 'Решение',
  insight: 'Мысль',
};
export function memoryDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
export function memoryContextLabel(context: MemoryContext | null): string {
  return [context?.sphereTitle, context?.directionTitle, context?.goalTitle]
    .filter(Boolean)
    .join(' · ');
}
export function memoryDraftChanged(
  draft: MemoryDraft,
  initial: MemoryDraft,
  removePhoto = false,
): boolean {
  return (
    removePhoto ||
    draft.title !== initial.title ||
    draft.body !== initial.body ||
    draft.kind !== initial.kind ||
    draft.isHighlight !== initial.isHighlight ||
    !draft.occurredOn.equals(initial.occurredOn) ||
    draft.photo !== initial.photo ||
    JSON.stringify(draft.context) !== JSON.stringify(initial.context)
  );
}
export function memoryError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
