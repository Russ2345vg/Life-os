import type { ActionSession } from '../../domain/action-session/ActionSession';
import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import type { SleepObservation } from '../../domain/sleep/SleepObservation';
import type { RoutineBlock } from '../../domain/routine-block/RoutineBlock';
import type { Walk } from '../../domain/walk/Walk';
import type {
  AutopilotPreferences,
  AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import type { AutopilotCatalog } from '../../domain/planner/AutopilotSelection';
import type { AutopilotStored } from '../ports/AutopilotSettingsStore';
import { shiftAutopilotDate } from './AutopilotConstraints';
export interface AutopilotGuardSource {
  readonly date: string;
  readonly catalog: AutopilotCatalog;
  readonly sessions: readonly ActionSession[];
  readonly sleep: SleepScheduleState;
  readonly sleepObservations: readonly SleepObservation[];
  readonly routineBlocks: readonly RoutineBlock[];
  readonly walks: readonly Walk[];
  readonly preferences: AutopilotStored<AutopilotPreferences>;
  readonly draft: AutopilotStored<AutopilotDayDraft>;
}
export interface AutopilotGuardSnapshot {
  readonly date: string;
  readonly sourceFingerprint: string;
}
function sorted<T extends { readonly id: { toString(): string } }>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
}
export function buildAutopilotGuard(source: AutopilotGuardSource): AutopilotGuardSnapshot {
  const { catalog, date } = source;
  const payload = {
    actions: sorted(catalog.actions.filter((action) => !action.isDeleted())).map((action) => [
      action.id.toString(),
      action.version,
      action.status,
      action.plannedDate?.toString() ?? null,
      action.scheduledStartMinute,
      action.scheduledDurationMinutes,
      action.isArchived(),
    ]),
    goals: sorted(catalog.goals.filter((goal) => !goal.isDeleted())).map((goal) => [
      goal.id.toString(),
      goal.version,
      goal.status,
    ]),
    directions: sorted(catalog.directions).map((direction) => [
      direction.id.toString(),
      direction.version,
      direction.status,
    ]),
    links: sorted(catalog.links).map((link) => [
      link.id,
      link.version,
      link.sourceType,
      link.sourceId,
      link.goalId,
      link.removed,
      link.effectiveFrom,
    ]),
    sessions: sorted(source.sessions).map((session) => [
      session.id.toString(),
      session.version,
      session.status,
      session.lifeActionId.toString(),
    ]),
    sleep: [source.sleep.version, source.sleep.settings],
    observations: sorted(
      source.sleepObservations.filter(
        (item) => item.cycleDate >= shiftAutopilotDate(date, -1) && item.cycleDate <= date,
      ),
    ).map((item) => [
      item.id,
      item.updatedAt,
      item.confirmedAt,
      item.wentToBedAt,
      item.wokeAt,
      item.timeZone,
    ]),
    blocks: sorted(source.routineBlocks).map((block) => [
      block.id.toString(),
      block.version,
      block.anchorDate.toString(),
      block.startTime,
      block.endTime,
    ]),
    walks: sorted(
      source.walks.filter(
        (walk) =>
          walk.deletedAt === null &&
          (walk.date.toString() === date || walk.status === 'running' || walk.status === 'paused'),
      ),
    ).map((walk) => [
      walk.id.toString(),
      walk.updatedAt,
      walk.status,
      walk.date.toString(),
      walk.startedAt,
      walk.endedAt,
      walk.pausedAt,
      walk.timerTargetMinutes,
      walk.pauseIntervals.map((pause) => [pause.startedAt, pause.endedAt]),
    ]),
    preferences: source.preferences,
    draft: source.draft,
  };
  return { date, sourceFingerprint: JSON.stringify(payload) };
}
