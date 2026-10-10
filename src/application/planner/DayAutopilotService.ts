import {
  buildDayAutopilotPlan,
  DayDate,
  EntityId,
  isConfirmedSleepObservation,
  timeInBedMilliseconds,
  type DayAutopilotMode,
  type DayAutopilotPlan,
  type LifeAction,
  type SleepObservation,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { TimeCapacityService } from '../time/TimeCapacityService';
import type { SleepObservationService } from '../sleep/SleepObservationService';
import {
  PreferenceDayAutopilot,
  type AutopilotProfile,
  type AutopilotSetup,
  type AutopilotDaySchedule,
} from './PreferenceDayAutopilot';
import type {
  AutopilotPreferences,
  AutopilotDayDraft,
  AutopilotReference,
} from '../../domain/planner/AutopilotPreferences';
import type { AutopilotWishResolution } from '../../domain/planner/AutopilotSelection';
import type { AutopilotGuardSnapshot } from './AutopilotGuard';
export type { AutopilotSetup, AutopilotDaySchedule } from './PreferenceDayAutopilot';

const DEFAULT_CAPACITY_MINUTES = 8 * 60;
const SHORT_NIGHT_MINUTES = 7 * 60;

export interface DayAutopilotPreviewInput {
  readonly date: DayDate;
  readonly mode: DayAutopilotMode;
  readonly startMinute?: number;
}

export interface DayAutopilotRecoverySignal {
  readonly kind: 'short_night';
  readonly minutes: number;
}

export interface DayAutopilotPreview extends DayAutopilotPlan {
  readonly affectedRoutineBlocks?: readonly {
    readonly id: string;
    readonly startMinute: number;
    readonly expectedVersion: number;
  }[];
  readonly guard?: AutopilotGuardSnapshot;
  readonly timeZone?: string;
  readonly wishResolution?: AutopilotWishResolution;
  readonly uncoveredWishes?: readonly AutopilotReference[];
  readonly createdAt: string;
  readonly capacityMinutes: number;
  readonly capacityAssumed: boolean;
  readonly recoverySignal: DayAutopilotRecoverySignal | null;
}

export interface DayAutopilotApplyResult {
  readonly routineBlockCount?: number;
  readonly updatedCount: number;
}

export interface DayAutopilotDependencies {
  readonly profile?: AutopilotProfile;
  readonly actions: LifeActionRepository;
  readonly sessions: ActionSessionRepository;
  readonly unitOfWork: JournalUnitOfWork;
  readonly capacity: Pick<TimeCapacityService, 'get'>;
  readonly sleep: Pick<SleepObservationService, 'history'>;
  readonly clock: Clock;
  readonly currentDate: CurrentDateProvider;
}

export class DayAutopilotService {
  private readonly preferencePlanner: PreferenceDayAutopilot | null;
  public constructor(private readonly dependencies: DayAutopilotDependencies) {
    this.preferencePlanner = dependencies.profile
      ? new PreferenceDayAutopilot(dependencies, dependencies.profile)
      : null;
  }
  public getSetup(date: DayDate): Promise<AutopilotSetup> {
    return this.requiredPlanner().getSetup(date);
  }
  public readSchedule(from: DayDate, to: DayDate): Promise<readonly AutopilotDaySchedule[]> {
    return this.requiredPlanner().readSchedule(from, to);
  }
  public savePreferences(value: AutopilotPreferences, expectedVersion: number) {
    this.requiredPlanner();
    return this.dependencies.profile!.settings.savePreferences(value, expectedVersion);
  }
  public saveDraft(value: AutopilotDayDraft, expectedVersion: number) {
    this.requiredPlanner();
    return this.dependencies.profile!.settings.saveDraft(value, expectedVersion);
  }
  private requiredPlanner(): PreferenceDayAutopilot {
    if (!this.preferencePlanner)
      throw new DomainError(
        'day_autopilot.profile_required',
        'Автопилот предпочтений недоступен в этой сборке.',
      );
    return this.preferencePlanner;
  }

  public async preview(input: DayAutopilotPreviewInput): Promise<DayAutopilotPreview> {
    if (this.preferencePlanner) return this.preferencePlanner.preview(input);
    const date = input.date.toString();
    const createdAt = this.dependencies.clock.now();
    const [actions, sessions, capacities, observations] = await Promise.all([
      this.dependencies.actions.findByDate(input.date),
      this.dependencies.sessions.all(),
      this.dependencies.capacity.get(),
      this.dependencies.sleep.history(previousDate(date), date),
    ]);
    const capacity = capacities[weekdayIndex(date)] ?? DEFAULT_CAPACITY_MINUTES;
    const capacityAssumed = capacities[weekdayIndex(date)] === null;
    const recoverySignal = recoverySignalForDate(observations, date);
    const activeActionIds = new Set(
      sessions
        .filter((session) => session.status === 'running' || session.status === 'paused')
        .map((session) => session.lifeActionId.toString()),
    );
    const open = actions.filter(
      (action) =>
        !action.isArchived() &&
        !action.isDeleted() &&
        (action.status === 'draft' || action.status === 'ready'),
    );
    const requestedStart = input.startMinute ?? this.defaultStartMinute(input.date, createdAt);
    const startMinute =
      input.mode === 'rebuild' && input.date.equals(this.dependencies.currentDate.getCurrentDate())
        ? Math.max(requestedStart, this.defaultStartMinute(input.date, createdAt))
        : requestedStart;
    const plan = buildDayAutopilotPlan({
      date,
      mode: input.mode,
      startMinute,
      capacityMinutes: capacity,
      reserveRatio: recoverySignal === null ? 0.15 : 0.25,
      actions: open.map((action) => toPlannerInput(action, activeActionIds)),
    });
    return {
      ...plan,
      createdAt: createdAt.toISOString(),
      capacityMinutes: capacity,
      capacityAssumed,
      recoverySignal,
    };
  }

  public async apply(preview: DayAutopilotPreview): Promise<DayAutopilotApplyResult> {
    if (this.preferencePlanner) return this.preferencePlanner.apply(preview);
    this.assertFreshRebuild(preview);
    const instructions = [
      ...preview.proposals.map((proposal) => ({
        actionId: proposal.actionId,
        expectedVersion: proposal.expectedVersion,
        estimateMinutes: proposal.durationMinutes,
        scheduledStartMinute: proposal.startMinute,
        scheduledDurationMinutes: proposal.durationMinutes,
      })),
      ...preview.deferred
        .filter(
          (item) =>
            preview.mode === 'rebuild' && item.reason === 'no_capacity' && item.hadScheduledWindow,
        )
        .map((item) => ({
          actionId: item.actionId,
          expectedVersion: item.expectedVersion,
          estimateMinutes: item.requestedMinutes,
          scheduledStartMinute: null,
          scheduledDurationMinutes: null,
        })),
    ];
    if (instructions.length === 0) return { updatedCount: 0 };
    const changes = await Promise.all(
      instructions.map(async (instruction) => {
        const action = await this.dependencies.actions.findById(
          EntityId.create(instruction.actionId),
        );
        if (
          action === null ||
          action.version !== instruction.expectedVersion ||
          action.plannedDate?.toString() !== preview.date ||
          action.isArchived() ||
          action.isDeleted() ||
          (action.status !== 'draft' && action.status !== 'ready')
        )
          throw new DomainError(
            'persistence.version_conflict',
            'План дня устарел. Соберите его ещё раз.',
          );
        const expectedVersion = action.version;
        action.setTimePlanning({
          estimateMinutes: action.estimateMinutes ?? instruction.estimateMinutes,
          scheduledStartMinute: instruction.scheduledStartMinute,
          scheduledDurationMinutes: instruction.scheduledDurationMinutes,
        });
        return { lifeAction: action, expectedVersion };
      }),
    );
    await this.dependencies.unitOfWork.commit({
      inactiveSessionActionIds: changes.map((change) => change.lifeAction.id),
      lifeActions: changes,
      journalEntries: [],
    });
    return { updatedCount: changes.length };
  }

  private assertFreshRebuild(preview: DayAutopilotPreview): void {
    if (preview.mode !== 'rebuild') return;
    const previewDate = DayDate.create(preview.date);
    const currentDate = this.dependencies.currentDate.getCurrentDate();
    if (previewDate.isBefore(currentDate)) throw stalePreviewError();
    if (!previewDate.equals(currentDate)) return;

    const now = this.dependencies.clock.now();
    const currentMinute =
      now.getHours() * 60 +
      now.getMinutes() +
      (now.getSeconds() > 0 || now.getMilliseconds() > 0 ? 1 : 0);
    const affectedStartMinutes = [
      ...preview.proposals.map((proposal) => proposal.startMinute),
      ...preview.proposals.flatMap((proposal) =>
        proposal.previousStartMinute === null ? [] : [proposal.previousStartMinute],
      ),
      ...preview.deferred.flatMap((item) =>
        item.reason === 'no_capacity' &&
        item.hadScheduledWindow &&
        item.previousStartMinute !== null
          ? [item.previousStartMinute]
          : [],
      ),
    ];
    if (affectedStartMinutes.some((startMinute) => startMinute < currentMinute))
      throw stalePreviewError();
  }

  private defaultStartMinute(date: DayDate, now: Date): number {
    if (!date.equals(this.dependencies.currentDate.getCurrentDate())) return 9 * 60;
    return Math.min(23 * 60 + 55, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5);
  }
}

function stalePreviewError(): DomainError {
  return new DomainError(
    'day_autopilot.preview_stale',
    'Время плана изменилось. Соберите остаток дня ещё раз.',
  );
}

export function toPlannerInput(action: LifeAction, activeActionIds: ReadonlySet<string>) {
  return {
    id: action.id.toString(),
    title: action.title.toString(),
    version: action.version,
    isMain: action.isNext,
    priority: action.priority,
    estimateMinutes: action.estimateMinutes,
    scheduledStartMinute: action.scheduledStartMinute,
    scheduledDurationMinutes: action.scheduledDurationMinutes,
    createdAt: action.createdAt.toISOString(),
    protectedBySession: activeActionIds.has(action.id.toString()),
  };
}

export function recoverySignalForDate(
  observations: readonly SleepObservation[],
  date: string,
): DayAutopilotRecoverySignal | null {
  const observation = observations
    .filter(isConfirmedSleepObservation)
    .filter((item) => localDate(item.wokeAt, item.timeZone) === date)
    .sort((left, right) => right.wokeAt.getTime() - left.wokeAt.getTime())[0];
  if (observation === undefined) return null;
  const minutes = Math.round(timeInBedMilliseconds(observation) / 60_000);
  return minutes < SHORT_NIGHT_MINUTES ? { kind: 'short_night', minutes } : null;
}

function localDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function weekdayIndex(date: string): number {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return (weekday + 6) % 7;
}

function previousDate(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
