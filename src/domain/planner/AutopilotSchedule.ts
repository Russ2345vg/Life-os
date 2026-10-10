import type {
  DayAutopilotInput,
  DayAutopilotPlan,
  ProposedActionWindow,
  LockedActionWindow,
  DeferredAutopilotAction,
} from './DayAutopilot';
import {
  DEFAULT_POMODORO_SETTINGS,
  validatePomodoroSettings,
} from '../pomodoro/ActionPomodoroCycle';
import type { AutopilotReference } from './AutopilotPreferences';
import { DomainError } from '../../shared/errors/DomainError';

export type AutopilotBlockKind =
  'action' | 'morning' | 'evening' | 'sleep' | 'walk' | 'rest' | 'reserve' | 'manual';
export interface AutopilotScheduleBlock {
  readonly id: string;
  readonly kind: AutopilotBlockKind;
  readonly title: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly sourceId: string | null;
  readonly actionId: string | null;
  readonly protected: boolean;
}
export interface AutopilotInterval {
  readonly startMinute: number;
  readonly endMinute: number;
}
export function freeScheduleIntervals(
  start: number,
  end: number,
  blocks: readonly AutopilotInterval[],
): readonly AutopilotInterval[] {
  let cursor = start;
  const result: AutopilotInterval[] = [];
  for (const block of [...blocks].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  )) {
    if (block.endMinute <= cursor || block.startMinute >= end) continue;
    if (block.startMinute > cursor)
      result.push({ startMinute: cursor, endMinute: Math.min(block.startMinute, end) });
    cursor = Math.max(cursor, Math.min(block.endMinute, end));
  }
  if (cursor < end) result.push({ startMinute: cursor, endMinute: end });
  return result;
}
export function scheduleConflictIds(
  blocks: readonly AutopilotScheduleBlock[],
): ReadonlySet<string> {
  const result = new Set<string>();
  const ordered = [...blocks]
    .filter((block) => block.kind !== 'reserve')
    .sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const left = ordered[i]!,
        right = ordered[j]!;
      if (right.startMinute >= left.endMinute) break;
      if (left.actionId !== null && left.actionId === right.actionId) continue;
      result.add(left.id);
      result.add(right.id);
    }
  return result;
}
export function autopilotOwnedBlockId(
  date: string,
  kind: 'walk' | 'rest',
  ordinal: number,
): string {
  return `day-autopilot:v1:${date}:${kind}:${ordinal}`;
}
export function isAutopilotOwnedBlock(id: string, date: string): boolean {
  return new RegExp(`^day-autopilot:v1:${date}:(?:walk|rest):[0-9]+$`).test(id);
}
export function buildPreferenceDayAutopilotPlan(input: DayAutopilotInput): DayAutopilotPlan {
  const end = input.endMinute;
  const groups = input.groups;
  const maximum = input.maxActions ?? 5;
  if (
    !groups ||
    end === undefined ||
    !Number.isInteger(end) ||
    end > 1440 ||
    end <= input.startMinute ||
    !Number.isInteger(input.startMinute) ||
    input.startMinute < 0 ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 12 ||
    !Number.isFinite(input.reserveRatio) ||
    input.reserveRatio < 0 ||
    input.reserveRatio >= 1
  )
    throw new DomainError(
      'day_autopilot.invalid_range',
      'Укажите начало и окончание дня и лимит от 1 до 12 дел.',
    );
  const pomodoro = validatePomodoroSettings(input.pomodoro ?? DEFAULT_POMODORO_SETTINGS);
  const byId = new Map(input.actions.map((action) => [action.id, action]));
  const timeline: AutopilotScheduleBlock[] = [...(input.constraints ?? [])];
  const locked: LockedActionWindow[] = [];
  const proposals: ProposedActionWindow[] = [];
  const deferred: DeferredAutopilotAction[] = [];
  const used = new Set(input.excludedActionIds ?? []);
  const overrides = new Map(
    input.durationOverrides?.map((item) => [item.actionId, item.minutes]) ?? [],
  );
  for (const action of input.actions) {
    const hasWindow =
      action.scheduledStartMinute !== null &&
      action.scheduledDurationMinutes !== null &&
      (action.plannedDate === undefined || action.plannedDate === input.date);
    const fixed =
      action.protectedBySession ||
      (hasWindow && (input.mode === 'fill' || action.scheduledStartMinute! < input.startMinute));
    if (!fixed) continue;
    used.add(action.id);
    if (!hasWindow) {
      deferred.push({
        actionId: action.id,
        title: action.title,
        expectedVersion: action.version,
        reason: 'active_session',
        requestedMinutes: action.estimateMinutes ?? 25,
        hadScheduledWindow: false,
        previousStartMinute: null,
      });
      continue;
    }
    const reason = action.protectedBySession
      ? 'active_session'
      : action.scheduledStartMinute! < input.startMinute
        ? 'past_window'
        : 'existing_window';
    locked.push({
      actionId: action.id,
      title: action.title,
      startMinute: action.scheduledStartMinute!,
      durationMinutes: action.scheduledDurationMinutes!,
      reason,
    });
    if (!timeline.some((block) => block.actionId === action.id))
      timeline.push({
        id: `action:${action.id}`,
        kind: 'action',
        title: action.title,
        startMinute: action.scheduledStartMinute!,
        endMinute: action.scheduledStartMinute! + action.scheduledDurationMinutes!,
        sourceId: action.id,
        actionId: action.id,
        protected: true,
      });
  }
  const conflicts = scheduleConflictIds(
    timeline.filter((block) => block.endMinute > input.startMinute && block.startMinute < end),
  );
  if (conflicts.size)
    throw new DomainError(
      'day_autopilot.fixed_conflict',
      'Обязательные окна пересекаются. Исправьте время прогулки или фиксированных блоков; ритуалы не сокращены.',
    );
  for (const block of timeline)
    if (block.actionId && !used.has(block.actionId) && block.kind === 'walk') {
      const action = byId.get(block.actionId);
      if (!action) continue;
      used.add(action.id);
      proposals.push({
        actionId: action.id,
        title: action.title,
        expectedVersion: action.version,
        previousDate: action.plannedDate ?? null,
        previousStartMinute: action.scheduledStartMinute,
        startMinute: block.startMinute,
        durationMinutes: block.endMinute - block.startMinute,
        isMain: action.isMain,
        usedDefaultEstimate: false,
        estimateSource: 'stored',
        selectionReference: null,
        reason: 'day_order',
      });
    }
  const free = freeScheduleIntervals(input.startMinute, end, timeline);
  const freeMinutes = free.reduce((sum, gap) => sum + gap.endMinute - gap.startMinute, 0);
  const reserveMinutes = Math.min(
    freeMinutes,
    Math.max(30, Math.ceil((freeMinutes * input.reserveRatio) / 5) * 5),
  );
  let budget = freeMinutes - reserveMinutes,
    cursor = input.startMinute,
    accumulated = 0,
    intervals = 0,
    restOrdinal = 0;
  const failed = new Set<string>();
  function tryAction(
    id: string,
    reason: ProposedActionWindow['reason'],
    reference: AutopilotReference | null,
  ): boolean {
    const action = byId.get(id);
    if (!action || used.has(id) || failed.has(id) || proposals.length >= maximum) return false;
    const override = overrides.get(id);
    const duration = override ?? action.estimateMinutes ?? action.scheduledDurationMinutes ?? 25;
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440)
      throw new DomainError(
        'day_autopilot.invalid_duration',
        'Длительность дела должна быть целым числом от 1 до 1440 минут.',
      );
    const due = accumulated >= pomodoro.focusMinutes;
    const long = intervals >= 4;
    const rest = due ? (long ? pomodoro.longBreakMinutes : pomodoro.shortBreakMinutes) : 0;
    let placement: { start: number; rest: number; resetByWalk: boolean } | null = null;
    for (const gap of freeScheduleIntervals(Math.max(cursor, input.startMinute), end, timeline)) {
      const walkBetween = timeline.some(
        (block) =>
          block.kind === 'walk' && block.endMinute > cursor && block.endMinute <= gap.startMinute,
      );
      const restHere = walkBetween ? 0 : rest;
      if (duration + restHere > budget || gap.startMinute + restHere + duration > gap.endMinute)
        continue;
      placement = { start: gap.startMinute + restHere, rest: restHere, resetByWalk: walkBetween };
      break;
    }
    if (!placement) {
      failed.add(id);
      deferred.push({
        actionId: id,
        title: action.title,
        expectedVersion: action.version,
        reason: 'no_capacity',
        requestedMinutes: duration,
        hadScheduledWindow:
          action.scheduledStartMinute !== null && action.plannedDate === input.date,
        previousStartMinute: action.scheduledStartMinute,
      });
      return false;
    }
    used.add(id);
    if (placement.resetByWalk) {
      accumulated = 0;
      intervals = 0;
    }
    if (placement.rest) {
      timeline.push({
        id: autopilotOwnedBlockId(input.date, 'rest', restOrdinal++),
        kind: 'rest',
        title: long ? 'Длинный отдых' : 'Отдых',
        startMinute: placement.start - placement.rest,
        endMinute: placement.start,
        sourceId: null,
        actionId: null,
        protected: false,
      });
      accumulated %= pomodoro.focusMinutes;
      if (long) intervals = 0;
    }
    const beforeIntervals = Math.floor(accumulated / pomodoro.focusMinutes);
    accumulated += duration;
    intervals += Math.floor(accumulated / pomodoro.focusMinutes) - beforeIntervals;
    const estimateSource =
      override !== undefined
        ? 'user'
        : action.estimateMinutes === null && action.scheduledDurationMinutes === null
          ? 'default'
          : 'stored';
    proposals.push({
      actionId: id,
      title: action.title,
      expectedVersion: action.version,
      previousDate: action.plannedDate ?? null,
      previousStartMinute: action.scheduledStartMinute,
      startMinute: placement.start,
      durationMinutes: duration,
      isMain: action.isMain,
      usedDefaultEstimate: estimateSource === 'default',
      estimateSource,
      selectionReference: reference,
      reason,
    });
    timeline.push({
      id: `action:${id}`,
      kind: 'action',
      title: action.title,
      startMinute: placement.start,
      endMinute: placement.start + duration,
      sourceId: id,
      actionId: id,
      protected: false,
    });
    cursor = placement.start + duration;
    budget -= duration + placement.rest;
    return true;
  }
  for (const id of groups.main) tryAction(id, 'main_action', null);
  for (const id of groups.focus) if (tryAction(id, 'focus', null)) break;
  for (const wish of groups.wishes)
    for (const id of wish.actionIds)
      if (used.has(id) || tryAction(id, 'wish', wish.reference)) break;
  for (const id of groups.focus) tryAction(id, 'focus', null);
  for (const id of groups.todayFallback) tryAction(id, 'day_order', null);
  if (input.mode === 'rebuild')
    for (const action of input.actions) {
      if (
        used.has(action.id) ||
        deferred.some((item) => item.actionId === action.id) ||
        action.plannedDate !== input.date ||
        action.scheduledStartMinute === null ||
        action.scheduledStartMinute < input.startMinute
      )
        continue;
      deferred.push({
        actionId: action.id,
        title: action.title,
        expectedVersion: action.version,
        reason: 'no_capacity',
        requestedMinutes: action.scheduledDurationMinutes ?? action.estimateMinutes ?? 25,
        hadScheduledWindow: true,
        previousStartMinute: action.scheduledStartMinute,
      });
    }
  let reserveRemaining = reserveMinutes;
  for (const gap of [...freeScheduleIntervals(input.startMinute, end, timeline)].reverse()) {
    const duration = Math.min(reserveRemaining, gap.endMinute - gap.startMinute);
    if (duration > 0)
      timeline.push({
        id: `reserve:${gap.endMinute}`,
        kind: 'reserve',
        title: 'Запас времени',
        startMinute: gap.endMinute - duration,
        endMinute: gap.endMinute,
        sourceId: null,
        actionId: null,
        protected: false,
      });
    reserveRemaining -= duration;
  }
  timeline.sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
  return {
    date: input.date,
    mode: input.mode,
    startMinute: input.startMinute,
    endMinute: end,
    planningEndMinute: end,
    reserveMinutes,
    plannedMinutes: proposals.reduce((sum, item) => sum + item.durationMinutes, 0),
    proposals,
    locked,
    deferred,
    timeline,
  };
}
