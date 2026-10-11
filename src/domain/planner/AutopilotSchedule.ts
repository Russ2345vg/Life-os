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
  const pinned = new Set<string>();
  for (const pin of input.pinnedWindows ?? []) {
    if (input.completedActionIds?.includes(pin.actionId)) continue;
    const action = byId.get(pin.actionId);
    const same =
      action?.plannedDate === input.date &&
      action.scheduledStartMinute === pin.startMinute &&
      action.scheduledDurationMinutes === pin.durationMinutes;
    if (
      !action ||
      used.has(pin.actionId) ||
      (groups.excluded.some((item) => item.actionId === pin.actionId) &&
        !(same && action.protectedBySession)) ||
      (action.protectedBySession && !same) ||
      pinned.has(pin.actionId)
    )
      throw new DomainError(
        'day_autopilot.pin_unavailable',
        'Закреплённое действие недоступно. Снимите закрепление или завершите текущую сессию.',
      );
    pinned.add(pin.actionId);
    if (
      (!same && pin.startMinute < input.startMinute) ||
      pin.startMinute + pin.durationMinutes > end ||
      !Number.isInteger(pin.startMinute) ||
      pin.startMinute < 0 ||
      !Number.isInteger(pin.durationMinutes) ||
      pin.durationMinutes < 1
    )
      throw new DomainError(
        'day_autopilot.pin_range',
        'Закреплённое окно вне доступного времени. Измените диапазон или снимите закрепление.',
      );
    if (
      timeline.some(
        (block) =>
          block.actionId === action.id &&
          (block.startMinute !== pin.startMinute ||
            block.endMinute !== pin.startMinute + pin.durationMinutes),
      )
    )
      throw new DomainError(
        'day_autopilot.pin_conflict',
        'Закрепление конфликтует с существующим окном действия.',
      );
    if (!timeline.some((block) => block.actionId === action.id))
      timeline.push({
        id: `action:${action.id}`,
        kind: 'action',
        title: action.title,
        startMinute: pin.startMinute,
        endMinute: pin.startMinute + pin.durationMinutes,
        actionId: action.id,
        sourceId: action.id,
        protected: true,
      });
    if (!same) {
      used.add(action.id);
      proposals.push({
        actionId: action.id,
        title: action.title,
        expectedVersion: action.version,
        previousDate: action.plannedDate ?? null,
        previousStartMinute: action.scheduledStartMinute,
        startMinute: pin.startMinute,
        durationMinutes: pin.durationMinutes,
        isMain: action.isMain,
        usedDefaultEstimate: false,
        estimateSource: 'stored',
        selectionReference: null,
        reason: 'pinned',
      });
    }
  }
  if (proposals.length > maximum)
    throw new DomainError(
      'day_autopilot.pin_limit',
      'Закреплений больше лимита дел. Увеличьте лимит или снимите закрепление.',
    );
  for (const action of input.actions) {
    if (proposals.some((item) => item.actionId === action.id)) continue;
    const hasWindow =
      action.scheduledStartMinute !== null &&
      action.scheduledDurationMinutes !== null &&
      (action.plannedDate === undefined || action.plannedDate === input.date);
    const fixed =
      action.protectedBySession ||
      timeline.some((block) => block.actionId === action.id && block.protected) ||
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
    restOrdinal = timeline.reduce(
      (next, block) =>
        block.kind === 'rest' && isAutopilotOwnedBlock(block.id, input.date)
          ? Math.max(next, Number(block.id.split(':').at(-1)) + 1)
          : next,
      0,
    );
  const failed = new Set<string>();
  const rules = new Map(input.actionRules?.map((rule) => [rule.actionId, rule]) ?? []);
  const completed = new Set(input.completedActionIds ?? []);
  const visiting = new Set<string>();
  const ineligible = new Set(groups.excluded.map((item) => item.actionId));
  const context = (id: string) => rules.get(id)?.context ?? byId.get(id)?.contextKey ?? '';
  const ordered = (ids: readonly string[]) => {
    if (!input.groupSimilar) return ids;
    const last = proposals.at(-1)?.actionId;
    const contexts = [...new Set(ids.map(context))];
    if (last && contexts.includes(context(last))) {
      contexts.splice(contexts.indexOf(context(last)), 1);
      contexts.unshift(context(last));
    }
    return [...ids].sort((a, b) => contexts.indexOf(context(a)) - contexts.indexOf(context(b)));
  };
  function deferDependency(id: string): false {
    const action = byId.get(id)!;
    failed.add(id);
    deferred.push({
      actionId: id,
      title: action.title,
      expectedVersion: action.version,
      reason: 'dependency',
      requestedMinutes: overrides.get(id) ?? action.estimateMinutes ?? 25,
      hadScheduledWindow: action.plannedDate === input.date && action.scheduledStartMinute !== null,
      previousStartMinute: action.scheduledStartMinute,
    });
    return false;
  }
  function recoveryAt(minute: number): { accumulated: number; intervals: number } {
    let accumulated = 0,
      intervals = 0;
    for (const block of [...timeline].sort((a, b) => a.startMinute - b.startMinute)) {
      if (block.endMinute > minute) continue;
      if (block.kind === 'action' || (block.kind === 'manual' && block.actionId)) {
        const before = Math.floor(accumulated / pomodoro.focusMinutes);
        accumulated += block.endMinute - block.startMinute;
        intervals += Math.floor(accumulated / pomodoro.focusMinutes) - before;
      } else if (
        ['walk', 'sleep', 'morning', 'evening'].includes(block.kind) ||
        (block.kind === 'rest' && block.endMinute - block.startMinute >= pomodoro.longBreakMinutes)
      ) {
        accumulated = 0;
        intervals = 0;
      } else if (
        block.kind === 'rest' &&
        block.endMinute - block.startMinute >= pomodoro.shortBreakMinutes
      ) {
        accumulated %= pomodoro.focusMinutes;
      }
    }
    return { accumulated, intervals };
  }
  function tryAction(
    id: string,
    reason: ProposedActionWindow['reason'],
    reference: AutopilotReference | null,
  ): boolean {
    const action = byId.get(id);
    if (!action || used.has(id) || failed.has(id) || ineligible.has(id)) return false;
    if (visiting.has(id))
      throw new DomainError('day_autopilot.dependency_cycle', 'В зависимостях обнаружен круг.');
    visiting.add(id);
    let earliest = cursor;
    for (const prerequisite of rules.get(id)?.prerequisiteIds ?? []) {
      if (completed.has(prerequisite)) continue;
      if (
        !(
          proposals.some((item) => item.actionId === prerequisite) ||
          locked.some((item) => item.actionId === prerequisite)
        ) &&
        !tryAction(prerequisite, 'dependency', null)
      ) {
        visiting.delete(id);
        return deferDependency(id);
      }
      const window = timeline.find((block) => block.actionId === prerequisite);
      if (!window) {
        visiting.delete(id);
        return deferDependency(id);
      }
      earliest = Math.max(earliest, window.endMinute);
    }
    visiting.delete(id);
    if (proposals.length >= maximum) return false;
    const override = overrides.get(id);
    const duration = override ?? action.estimateMinutes ?? action.scheduledDurationMinutes ?? 25;
    if (!Number.isInteger(duration) || duration < 1 || duration > 1440)
      throw new DomainError(
        'day_autopilot.invalid_duration',
        'Длительность дела должна быть целым числом от 1 до 1440 минут.',
      );
    let placement: { start: number; rest: number; long: boolean } | null = null;
    for (const gap of freeScheduleIntervals(
      Math.max(cursor, earliest, input.startMinute),
      end!,
      timeline,
    )) {
      const recovery = recoveryAt(gap.startMinute);
      const long = recovery.intervals >= 4;
      const restHere =
        recovery.accumulated >= pomodoro.focusMinutes
          ? long
            ? pomodoro.longBreakMinutes
            : pomodoro.shortBreakMinutes
          : 0;
      if (duration + restHere > budget || gap.startMinute + restHere + duration > gap.endMinute)
        continue;
      placement = { start: gap.startMinute + restHere, rest: restHere, long };
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
    if (placement.rest) {
      timeline.push({
        id: autopilotOwnedBlockId(input.date, 'rest', restOrdinal++),
        kind: 'rest',
        title: placement.long ? 'Длинный отдых' : 'Отдых',
        startMinute: placement.start - placement.rest,
        endMinute: placement.start,
        sourceId: null,
        actionId: null,
        protected: false,
      });
    }
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
  const walkActionIds = new Set(
    timeline
      .filter((block) => block.kind === 'walk' && block.actionId)
      .map((block) => block.actionId),
  );
  const fixedWindows = [
    ...locked,
    ...proposals.filter((item) => pinned.has(item.actionId) || walkActionIds.has(item.actionId)),
  ];
  // Reserve preparation for every fixed dependent, including action-backed walks.
  for (const window of [...fixedWindows].sort((a, b) => a.startMinute - b.startMinute))
    for (const prerequisite of rules.get(window.actionId)?.prerequisiteIds ?? [])
      if (!completed.has(prerequisite)) tryAction(prerequisite, 'dependency', null);
  for (const id of groups.main) tryAction(id, 'main_action', null);
  if (!groups.balance?.length)
    for (const id of ordered(groups.focus)) if (tryAction(id, 'focus', null)) break;
  for (const wish of groups.wishes)
    for (const id of ordered(wish.actionIds))
      if (
        proposals.some((item) => item.actionId === id) ||
        locked.some((item) => item.actionId === id) ||
        tryAction(id, 'wish', wish.reference)
      )
        break;
  const workMinutes = (item: {
    readonly actionId: string;
    readonly startMinute: number;
    readonly durationMinutes: number;
  }): number =>
    walkActionIds.has(item.actionId)
      ? 0
      : Math.max(
          0,
          Math.min(end!, item.startMinute + item.durationMinutes) -
            Math.max(input.startMinute, item.startMinute),
        );
  const directionMinutes = (directionId: string): number => {
    const group = groups.balance?.find((item) => item.directionId === directionId);
    if (!group) return 0;
    return [...proposals, ...locked]
      .filter((item) => {
        const proposal = proposals.find((value) => value.actionId === item.actionId);
        const selected = proposal?.selectionReference;
        const owner =
          selected?.kind === 'direction' &&
          groups.balance?.some((value) => value.directionId === selected.id)
            ? selected.id
            : groups.balance?.find((value) => value.actionIds.includes(item.actionId))?.directionId;
        return owner === directionId;
      })
      .reduce((sum, item) => sum + workMinutes(item), 0);
  };
  if (groups.balance?.length) {
    const exhausted = new Set<string>();
    while (proposals.length < maximum) {
      const next = groups.balance
        .filter((group) => !exhausted.has(group.directionId))
        .sort(
          (a, b) =>
            directionMinutes(a.directionId) / a.percent -
              directionMinutes(b.directionId) / b.percent || b.percent - a.percent,
        )[0];
      if (!next) break;
      if (
        !ordered(next.actionIds).some((id) =>
          tryAction(id, 'balance', { kind: 'direction', id: next.directionId }),
        )
      )
        exhausted.add(next.directionId);
    }
  } else {
    for (const id of ordered(groups.focus)) tryAction(id, 'focus', null);
    for (const id of ordered(groups.todayFallback)) tryAction(id, 'day_order', null);
  }
  for (const window of fixedWindows) {
    for (const prerequisite of rules.get(window.actionId)?.prerequisiteIds ?? []) {
      if (completed.has(prerequisite)) continue;
      if (
        !timeline.some(
          (block) => block.actionId === prerequisite && block.endMinute <= window.startMinute,
        )
      )
        throw new DomainError(
          'day_autopilot.fixed_dependency',
          'Фиксированное окно действия или прогулки стоит раньше обязательного предшественника. Измените время или исправьте зависимость.',
        );
    }
  }
  if (input.mode === 'rebuild')
    for (const action of input.actions) {
      if (
        proposals.some((item) => item.actionId === action.id) ||
        locked.some((item) => item.actionId === action.id) ||
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
  const plan: DayAutopilotPlan = {
    ...(groups.balance?.length
      ? {
          balanceSummary: groups.balance.map((group) => ({
            directionId: group.directionId,
            targetPercent: group.percent,
            plannedMinutes: directionMinutes(group.directionId),
            actualPercent: Math.round(
              (100 * directionMinutes(group.directionId)) /
                Math.max(
                  1,
                  [...proposals, ...locked].reduce((sum, item) => sum + workMinutes(item), 0),
                ),
            ),
          })),
        }
      : {}),
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
  if (input.groupSimilar && groups.balance?.length) {
    // Selection satisfies direction weights first. A second placement pass groups
    // only that selected work, retaining fixed windows, prerequisites and breaks.
    const regrouped = buildPreferenceDayAutopilotPlan({
      ...input,
      groups: {
        ...groups,
        balance: [],
        main: groups.main.filter((id) => used.has(id)),
        focus: proposals.map((item) => item.actionId),
        wishes: [],
        todayFallback: [],
      },
    });
    const selected = new Set([...proposals, ...locked].map((item) => item.actionId));
    const regroupedSelection = new Set(
      [...regrouped.proposals, ...regrouped.locked].map((item) => item.actionId),
    );
    // Grouping is optional: retain the feasible allocation if moving work between
    // fixed gaps would lose any of the selected actions or add different work.
    if (
      selected.size !== regroupedSelection.size ||
      [...selected].some((id) => !regroupedSelection.has(id))
    )
      return plan;
    const original = new Map(proposals.map((item) => [item.actionId, item]));
    const adjusted = regrouped.proposals.map((item) => {
      const before = original.get(item.actionId);
      return before
        ? { ...item, reason: before.reason, selectionReference: before.selectionReference ?? null }
        : item;
    });
    const total = Math.max(
      1,
      [...adjusted, ...regrouped.locked].reduce((sum, item) => sum + workMinutes(item), 0),
    );
    const minutes = new Map<string, number>();
    for (const item of [...adjusted, ...regrouped.locked]) {
      const ref = adjusted.find((value) => value.actionId === item.actionId)?.selectionReference;
      const owner =
        ref?.kind === 'direction' && groups.balance.some((group) => group.directionId === ref.id)
          ? ref.id
          : groups.balance.find((group) => group.actionIds.includes(item.actionId))?.directionId;
      if (owner) minutes.set(owner, (minutes.get(owner) ?? 0) + workMinutes(item));
    }
    return {
      ...regrouped,
      proposals: adjusted,
      deferred: [
        ...new Map(
          [...plan.deferred, ...regrouped.deferred]
            .filter((item) => !adjusted.some((value) => value.actionId === item.actionId))
            .map((item) => [item.actionId, item]),
        ).values(),
      ],
      balanceSummary: groups.balance.map((group) => ({
        directionId: group.directionId,
        targetPercent: group.percent,
        plannedMinutes: minutes.get(group.directionId) ?? 0,
        actualPercent: Math.round((100 * (minutes.get(group.directionId) ?? 0)) / total),
      })),
    };
  }
  return plan;
}
