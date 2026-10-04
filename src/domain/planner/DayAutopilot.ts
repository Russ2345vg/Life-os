import type { ActionPriority } from './RecurrenceRule';
import { DomainError } from '../../shared/errors/DomainError';

export type DayAutopilotMode = 'fill' | 'rebuild';
export type DayAutopilotLockedReason = 'existing_window' | 'past_window' | 'active_session';
export type DayAutopilotDeferredReason = 'no_capacity' | 'active_session';

export interface DayAutopilotActionInput {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly isMain: boolean;
  readonly priority: ActionPriority | null;
  readonly estimateMinutes: number | null;
  readonly scheduledStartMinute: number | null;
  readonly scheduledDurationMinutes: number | null;
  readonly createdAt: string;
  readonly protectedBySession: boolean;
}

export interface DayAutopilotInput {
  readonly date: string;
  readonly mode: DayAutopilotMode;
  readonly startMinute: number;
  readonly capacityMinutes: number;
  readonly reserveRatio: number;
  readonly actions: readonly DayAutopilotActionInput[];
}

export interface ProposedActionWindow {
  readonly actionId: string;
  readonly title: string;
  readonly expectedVersion: number;
  readonly previousStartMinute: number | null;
  readonly startMinute: number;
  readonly durationMinutes: number;
  readonly isMain: boolean;
  readonly usedDefaultEstimate: boolean;
  readonly reason: 'main_action' | 'priority' | 'day_order';
}

export interface LockedActionWindow {
  readonly actionId: string;
  readonly title: string;
  readonly startMinute: number;
  readonly durationMinutes: number;
  readonly reason: DayAutopilotLockedReason;
}

export interface DeferredAutopilotAction {
  readonly actionId: string;
  readonly title: string;
  readonly expectedVersion: number;
  readonly reason: DayAutopilotDeferredReason;
  readonly requestedMinutes: number;
  readonly hadScheduledWindow: boolean;
  readonly previousStartMinute: number | null;
}

export interface DayAutopilotPlan {
  readonly date: string;
  readonly mode: DayAutopilotMode;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly planningEndMinute: number;
  readonly reserveMinutes: number;
  readonly plannedMinutes: number;
  readonly proposals: readonly ProposedActionWindow[];
  readonly locked: readonly LockedActionWindow[];
  readonly deferred: readonly DeferredAutopilotAction[];
}

const DEFAULT_ACTION_MINUTES = 25;
const BETWEEN_ACTIONS_MINUTES = 5;
const MINIMUM_RESERVE_MINUTES = 30;

export function buildDayAutopilotPlan(input: DayAutopilotInput): DayAutopilotPlan {
  assertMinute(input.startMinute, 'Начало автоплана');
  if (!Number.isInteger(input.capacityMinutes) || input.capacityMinutes <= 0)
    throw new DomainError(
      'day_autopilot.invalid_capacity',
      'Доступное время должно быть больше нуля.',
    );
  if (!Number.isFinite(input.reserveRatio) || input.reserveRatio < 0 || input.reserveRatio >= 1)
    throw new DomainError('day_autopilot.invalid_reserve', 'Проверьте размер резерва дня.');

  const endMinute = Math.min(24 * 60, input.startMinute + input.capacityMinutes);
  const usableSpan = endMinute - input.startMinute;
  const requestedReserve = Math.max(
    MINIMUM_RESERVE_MINUTES,
    roundUpToFive(input.capacityMinutes * input.reserveRatio),
  );
  const reserveMinutes = Math.min(requestedReserve, Math.max(0, usableSpan));
  const planningEndMinute = Math.max(input.startMinute, endMinute - reserveMinutes);

  const locked = input.actions
    .filter((action) => isLocked(action, input))
    .filter(hasWindow)
    .map((action): LockedActionWindow => ({
      actionId: action.id,
      title: action.title,
      startMinute: action.scheduledStartMinute,
      durationMinutes: action.scheduledDurationMinutes,
      reason: lockedReason(action, input),
    }))
    .sort(
      (left, right) =>
        left.startMinute - right.startMinute || left.actionId.localeCompare(right.actionId),
    );

  const deferred: DeferredAutopilotAction[] = input.actions
    .filter((action) => action.protectedBySession && !hasWindow(action))
    .map((action) => ({
      actionId: action.id,
      title: action.title,
      expectedVersion: action.version,
      reason: 'active_session',
      requestedMinutes: action.estimateMinutes ?? DEFAULT_ACTION_MINUTES,
      hadScheduledWindow: false,
      previousStartMinute: null,
    }));
  const candidates = input.actions
    .filter((action) => !isLocked(action, input))
    .sort(compareActions);

  const proposals: ProposedActionWindow[] = [];
  let cursor = input.startMinute;
  for (const action of candidates) {
    const usedDefaultEstimate = action.estimateMinutes === null;
    const durationMinutes = roundUpToFive(
      action.estimateMinutes ?? action.scheduledDurationMinutes ?? DEFAULT_ACTION_MINUTES,
    );
    const startMinute = findAvailableStart(cursor, durationMinutes, planningEndMinute, locked);
    if (startMinute === null) {
      deferred.push({
        actionId: action.id,
        title: action.title,
        expectedVersion: action.version,
        reason: 'no_capacity',
        requestedMinutes: durationMinutes,
        hadScheduledWindow: hasWindow(action),
        previousStartMinute: action.scheduledStartMinute,
      });
      continue;
    }
    proposals.push({
      actionId: action.id,
      title: action.title,
      expectedVersion: action.version,
      previousStartMinute: action.scheduledStartMinute,
      startMinute,
      durationMinutes,
      isMain: action.isMain,
      usedDefaultEstimate,
      reason: action.isMain ? 'main_action' : action.priority === 'high' ? 'priority' : 'day_order',
    });
    cursor = startMinute + durationMinutes + BETWEEN_ACTIONS_MINUTES;
  }

  return {
    date: input.date,
    mode: input.mode,
    startMinute: input.startMinute,
    endMinute,
    planningEndMinute,
    reserveMinutes,
    plannedMinutes: proposals.reduce((sum, item) => sum + item.durationMinutes, 0),
    proposals,
    locked,
    deferred,
  };
}

function isLocked(action: DayAutopilotActionInput, input: DayAutopilotInput): boolean {
  if (action.protectedBySession) return true;
  if (!hasWindow(action)) return false;
  if (input.mode === 'fill') return true;
  return action.scheduledStartMinute < input.startMinute;
}

function lockedReason(
  action: DayAutopilotActionInput,
  input: DayAutopilotInput,
): DayAutopilotLockedReason {
  if (action.protectedBySession) return 'active_session';
  if (action.scheduledStartMinute! < input.startMinute) return 'past_window';
  return 'existing_window';
}

function hasWindow(action: DayAutopilotActionInput): action is DayAutopilotActionInput & {
  readonly scheduledStartMinute: number;
  readonly scheduledDurationMinutes: number;
} {
  return action.scheduledStartMinute !== null && action.scheduledDurationMinutes !== null;
}

function compareActions(left: DayAutopilotActionInput, right: DayAutopilotActionInput): number {
  if (left.isMain !== right.isMain) return left.isMain ? -1 : 1;
  const priority = { high: 0, normal: 1, low: 2 } as const;
  const leftPriority = left.priority === null ? priority.normal : priority[left.priority];
  const rightPriority = right.priority === null ? priority.normal : priority[right.priority];
  return (
    leftPriority - rightPriority ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function findAvailableStart(
  fromMinute: number,
  durationMinutes: number,
  planningEndMinute: number,
  locked: readonly LockedActionWindow[],
): number | null {
  let candidate = fromMinute;
  for (const window of locked) {
    const windowEnd = window.startMinute + window.durationMinutes;
    if (windowEnd + BETWEEN_ACTIONS_MINUTES <= candidate) continue;
    if (
      candidate + durationMinutes + BETWEEN_ACTIONS_MINUTES <= window.startMinute &&
      candidate + durationMinutes <= planningEndMinute
    )
      return candidate;
    candidate = windowEnd + BETWEEN_ACTIONS_MINUTES;
  }
  return candidate + durationMinutes <= planningEndMinute ? candidate : null;
}

function roundUpToFive(value: number): number {
  return Math.max(5, Math.ceil(value / 5) * 5);
}

function assertMinute(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60)
    throw new DomainError('day_autopilot.invalid_time', `${label} должно быть временем этого дня.`);
}
