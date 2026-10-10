import { DayDate } from '../../domain/day/DayDate';
import type { LifeAction } from '../../domain/life-action/LifeAction';
import { LIFE_ACTION_STATUS } from '../../domain/life-action/LifeActionStatus';
import type { RoutineBlock } from '../../domain/routine-block/RoutineBlock';
import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import { calculateNightWindow } from '../../domain/sleep/NightTime';
import type { Walk } from '../../domain/walk/Walk';
import type {
  AutopilotPreferences,
  AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import {
  autopilotOwnedBlockId,
  isAutopilotOwnedBlock,
  type AutopilotScheduleBlock,
  type AutopilotBlockKind,
} from '../../domain/planner/AutopilotSchedule';
import { isAutopilotOpenAction } from '../../domain/planner/AutopilotSelection';
import { DomainError } from '../../shared/errors/DomainError';

export interface AutopilotConstraintInput {
  readonly date: string;
  readonly now: Date;
  readonly preferences: AutopilotPreferences;
  readonly draft: AutopilotDayDraft;
  readonly sleep: SleepScheduleState;
  readonly routineBlocks: readonly RoutineBlock[];
  readonly walks: readonly Walk[];
  readonly actions: readonly LifeAction[];
  /** Only preview rebuild discards future owned blocks; persisted readback retains them. */
  readonly rebuild?: boolean;
  readonly readback?: boolean;
}
export function shiftAutopilotDate(date: string, days: number): string {
  DayDate.create(date);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function autopilotLocalTime(at: Date, timeZone: string): { date: string; minute: number } {
  const parts = new Map(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
    minute: Number(parts.get('hour')) * 60 + Number(parts.get('minute')),
  };
}
export function autopilotTimeLabel(minute: number): string {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}
export function buildAutopilotConstraints(
  input: AutopilotConstraintInput,
): readonly AutopilotScheduleBlock[] {
  const { date, preferences, draft } = input;
  const zone = input.sleep.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nowLocal = autopilotLocalTime(input.now, zone);
  const current = nowLocal.date === date ? nowLocal.minute : 0;
  const blocks: AutopilotScheduleBlock[] = [];
  function add(
    kind: AutopilotBlockKind,
    start: number,
    end: number,
    suffix: string,
    title: string,
    sourceId: string | null = null,
    actionId: string | null = null,
    protectedBlock = true,
  ): void {
    const startMinute = Math.max(0, start),
      endMinute = Math.min(1440, end);
    if (startMinute < endMinute)
      blocks.push({
        id: suffix,
        kind,
        title,
        startMinute,
        endMinute,
        sourceId,
        actionId,
        protected: protectedBlock,
      });
  }
  function projected(at: Date): number {
    const local = autopilotLocalTime(at, zone);
    return local.date < date
      ? -1440 + local.minute
      : local.date > date
        ? 1440 + local.minute
        : local.minute;
  }
  if (input.sleep.settings) {
    const settings = input.sleep.settings;
    for (const cycleDate of [shiftAutopilotDate(date, -1), date]) {
      const wakeTime =
        settings.wakeOverride?.cycleDate === cycleDate
          ? settings.wakeOverride.wakeTime
          : settings.wakeTime;
      const window = calculateNightWindow({
        cycleDate,
        bedtime: settings.bedtime,
        wakeTime,
        timeZone: zone,
      });
      add(
        'sleep',
        projected(window.plannedSleepAt),
        projected(window.plannedWakeAt),
        `sleep:${cycleDate}`,
        'Сон',
      );
      add(
        'morning',
        projected(window.plannedWakeAt),
        projected(window.plannedWakeAt) + preferences.morningMinutes,
        `morning:${cycleDate}`,
        'Утренняя подготовка',
      );
      add(
        'evening',
        projected(new Date(window.plannedSleepAt.getTime() - preferences.eveningMinutes * 60000)),
        projected(window.plannedSleepAt),
        `evening:${cycleDate}`,
        'Вечерняя подготовка ко сну',
      );
    }
  } else {
    const wake = preferences.manualWakeMinute,
      bed = preferences.manualBedtimeMinute;
    if (wake === null || bed === null || draft.startMinute === null || draft.endMinute === null) {
      if (!input.readback)
        throw new DomainError(
          'day_autopilot.sleep_required',
          'Настройте сон или укажите подъём, отбой и границы дня.',
        );
    } else {
      add(
        'morning',
        wake,
        wake + preferences.morningMinutes,
        'morning:manual',
        'Утренняя подготовка',
      );
      if (bed > wake) {
        add('sleep', 0, wake, 'sleep:early', 'Сон');
        add('sleep', bed, 1440, 'sleep:late', 'Сон');
      } else add('sleep', bed, wake, 'sleep:manual', 'Сон');
      if (bed >= preferences.eveningMinutes)
        add(
          'evening',
          bed - preferences.eveningMinutes,
          bed,
          'evening:manual',
          'Вечерняя подготовка ко сну',
        );
      else {
        add('evening', 0, bed, 'evening:early', 'Вечерняя подготовка ко сну');
        add(
          'evening',
          1440 + bed - preferences.eveningMinutes,
          1440,
          'evening:late',
          'Вечерняя подготовка ко сну',
        );
      }
    }
  }
  for (const block of input.routineBlocks) {
    if (!block.occursOn(DayDate.create(date))) continue;
    const [sh, sm] = block.startTime.split(':').map(Number),
      [eh, em] = block.endTime.split(':').map(Number);
    const start = sh! * 60 + sm!,
      end = eh! * 60 + em!;
    const owned = isAutopilotOwnedBlock(block.id.toString(), date);
    if (input.rebuild && owned && start >= Math.max(current, draft.startMinute ?? 0)) continue;
    const assignment = block.assignment;
    const linked =
      assignment.kind === 'existingAction'
        ? input.actions.find(
            (action) =>
              action.id.equals(assignment.actionId) &&
              !action.isArchived() &&
              !action.isDeleted() &&
              action.status !== 'cancelled' &&
              (input.readback ||
                isAutopilotOpenAction(action) ||
                action.status === LIFE_ACTION_STATUS.inProgress) &&
              action.plannedDate?.toString() === date &&
              action.scheduledStartMinute === start &&
              action.scheduledDurationMinutes === end - start,
          )
        : undefined;
    add(
      owned ? (block.assignment.kind === 'walk' ? 'walk' : 'rest') : 'manual',
      start,
      end,
      block.id.toString(),
      block.title,
      block.id.toString(),
      linked?.id.toString() ?? null,
    );
  }
  const walks = input.walks.filter((walk) => walk.deletedAt === null);
  const active =
    nowLocal.date === date
      ? walks.filter((walk) => walk.status === 'running' || walk.status === 'paused')
      : [];
  for (const walk of active) {
    if (nowLocal.date !== date) continue;
    const remaining =
      walk.timerTargetMinutes === null
        ? null
        : Math.ceil(
            Math.max(
              0,
              walk.timerTargetMinutes * 60000 - (walk.elapsedDurationMilliseconds(input.now) ?? 0),
            ) / 60000,
          );
    const end =
      draft.activeWalkEndMinute ?? (remaining && remaining > 0 ? current + remaining : null);
    if (end === null || end <= current || end > 1440) {
      if (input.readback) continue;
      throw new DomainError(
        'day_autopilot.walk_end_required',
        'Укажите ожидаемое окончание текущей прогулки.',
      );
    }
    add(
      'walk',
      current,
      end,
      `active-walk:${walk.id.toString()}`,
      'Текущая прогулка',
      walk.id.toString(),
    );
  }
  const completed = walks.some(
    (walk) => walk.status === 'completed' && walk.date.toString() === date,
  );
  const existingWalk = blocks.some(
    (block) =>
      block.kind === 'walk' ||
      (block.kind === 'manual' &&
        input.routineBlocks.some(
          (routine) =>
            routine.id.toString() === block.sourceId && routine.assignment.kind === 'walk',
        )),
  );
  const planned = input.actions
    .filter(
      (action) =>
        isAutopilotOpenAction(action) && action.walkPlan && action.plannedDate?.toString() === date,
    )
    .sort((a, b) => a.id.toString().localeCompare(b.id.toString()))[0];
  if (
    !input.readback &&
    !completed &&
    active.length === 0 &&
    !existingWalk &&
    (preferences.walk.enabled || planned)
  ) {
    const start = planned?.scheduledStartMinute ?? preferences.walk.startMinute;
    const minutes =
      planned?.scheduledDurationMinutes ??
      planned?.walkPlan?.targetMinutes ??
      preferences.walk.minutes;
    if (start === null || start < current || start + minutes > 1439)
      throw new DomainError(
        'day_autopilot.walk_time_required',
        'Выберите время прогулки в оставшейся части дня.',
      );
    add(
      'walk',
      start,
      start + minutes,
      planned ? `action:${planned.id.toString()}` : autopilotOwnedBlockId(date, 'walk', 0),
      'Прогулка',
      planned?.id.toString() ?? null,
      planned?.id.toString() ?? null,
      false,
    );
  }
  return blocks.sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
}
