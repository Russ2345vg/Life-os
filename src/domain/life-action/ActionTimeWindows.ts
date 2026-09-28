import { DomainError } from '../../shared/errors/DomainError';

export interface ActionTimeWindow {
  readonly id: string;
  readonly plannedDate: string | null;
  readonly scheduledStartMinute?: number | null;
  readonly scheduledDurationMinutes?: number | null;
  readonly status: 'draft' | 'ready' | 'in_progress' | 'completed' | 'cancelled';
  readonly archivedAt: string | null;
  readonly deletedAt?: string | null;
  readonly occurrence?: { readonly ruleId: string } | null;
}

export interface TimeWindowPolicy {
  /** Automatic recurrence reconciliation retains existing windows for visible conflict repair. */
  readonly preserveExistingRecurrenceWindows?: boolean;
}

/** Reject newly occupied overlaps; retain existing conflicts imported from another device. */
export function assertChangedActionTimeWindows(
  previous: readonly ActionTimeWindow[],
  next: readonly ActionTimeWindow[],
  policy: TimeWindowPolicy = {},
): void {
  const before = new Map(previous.map((action) => [action.id, action]));
  for (const candidate of next) {
    if (!hasActiveTimeWindow(candidate)) continue;
    const old = before.get(candidate.id);
    if (
      policy.preserveExistingRecurrenceWindows &&
      old?.occurrence &&
      candidate.occurrence &&
      old.occurrence.ruleId === candidate.occurrence.ruleId &&
      old.archivedAt === null &&
      old.deletedAt == null &&
      old.scheduledStartMinute === candidate.scheduledStartMinute &&
      old.scheduledDurationMinutes === candidate.scheduledDurationMinutes
    )
      continue;
    if (
      old &&
      hasActiveTimeWindow(old) &&
      old.plannedDate === candidate.plannedDate &&
      old.scheduledStartMinute === candidate.scheduledStartMinute &&
      old.scheduledDurationMinutes === candidate.scheduledDurationMinutes
    )
      continue;
    const start = candidate.scheduledStartMinute;
    const end = start + candidate.scheduledDurationMinutes;
    for (const other of next) {
      if (
        other.id === candidate.id ||
        !hasActiveTimeWindow(other) ||
        other.plannedDate !== candidate.plannedDate
      )
        continue;
      const otherStart = other.scheduledStartMinute;
      if (start < otherStart + other.scheduledDurationMinutes && otherStart < end)
        throw new DomainError(
          'life_action.time_conflict',
          'Это время занято. Выберите другое окно.',
        );
    }
  }
}

function hasActiveTimeWindow(action: ActionTimeWindow): action is ActionTimeWindow & {
  readonly scheduledStartMinute: number;
  readonly scheduledDurationMinutes: number;
} {
  return (
    action.plannedDate !== null &&
    action.scheduledStartMinute != null &&
    action.scheduledDurationMinutes != null &&
    action.archivedAt === null &&
    action.deletedAt == null &&
    action.status !== 'completed' &&
    action.status !== 'cancelled'
  );
}
