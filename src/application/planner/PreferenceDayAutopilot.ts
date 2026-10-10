import {
  DayDate,
  EntityId,
  RoutineBlock,
  RoutineBlockRecurrence,
  LIFE_ACTION_STATUS,
  type JournalEntry,
  type LifeAction,
} from '../../domain';
import { buildDayAutopilotPlan } from '../../domain/planner/DayAutopilot';
import type {
  AutopilotPreferences,
  AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import {
  resolveAutopilotWishes,
  selectAutopilotCandidates,
  isAutopilotOpenAction,
  type AutopilotCatalog,
  type AutopilotWishResolution,
} from '../../domain/planner/AutopilotSelection';
import {
  isAutopilotOwnedBlock,
  scheduleConflictIds,
  type AutopilotScheduleBlock,
} from '../../domain/planner/AutopilotSchedule';
import type { AutopilotStored } from '../ports/AutopilotSettingsStore';
import type { GoalRepository } from '../ports/GoalRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { PlanningRepository } from '../ports/PlanningRepository';
import type { RoutineBlockRepository } from '../ports/RoutineBlockRepository';
import type { WalkRepository } from '../ports/WalkRepository';
import type { PomodoroPreferences } from '../ports/PomodoroPreferences';
import type { IdGenerator } from '../ports/IdGenerator';
import type { SleepScheduleService } from '../sleep/SleepScheduleService';
import type { AutopilotSettingsService } from './AutopilotSettingsService';
import {
  autopilotLocalTime,
  autopilotTimeLabel,
  buildAutopilotConstraints,
  shiftAutopilotDate,
} from './AutopilotConstraints';
import { buildAutopilotGuard, type AutopilotGuardSource } from './AutopilotGuard';
import { prepareLifeActionPlan } from '../commands/prepareLifeActionPlan';
import { DomainError } from '../../shared/errors/DomainError';
import {
  recoverySignalForDate,
  toPlannerInput,
  type DayAutopilotDependencies,
  type DayAutopilotPreviewInput,
  type DayAutopilotPreview,
  type DayAutopilotApplyResult,
} from './DayAutopilotService';

export interface AutopilotProfile {
  readonly settings: AutopilotSettingsService;
  readonly schedule: Pick<SleepScheduleService, 'getState'>;
  readonly goals: GoalRepository;
  readonly directions: DirectionRepository;
  readonly planning: Pick<PlanningRepository, 'read'>;
  readonly blocks: RoutineBlockRepository;
  readonly walks: WalkRepository;
  readonly pomodoro: PomodoroPreferences;
  readonly ids: IdGenerator;
}
export interface AutopilotSetup {
  readonly preferences: AutopilotStored<AutopilotPreferences>;
  readonly draft: AutopilotStored<AutopilotDayDraft>;
  readonly catalog: AutopilotCatalog;
  readonly wishResolution: AutopilotWishResolution;
  readonly suggestedEndMinute: number | null;
  readonly sleepConfigured: boolean;
  readonly timeZone: string;
}
export interface AutopilotDaySchedule {
  readonly date: string;
  readonly blocks: readonly AutopilotScheduleBlock[];
  readonly conflictIds: ReadonlySet<string>;
}
function stale(): DomainError {
  return new DomainError('day_autopilot.stale_preview', 'План дня устарел. Соберите его ещё раз.');
}
export class PreferenceDayAutopilot {
  public constructor(
    private readonly deps: DayAutopilotDependencies,
    private readonly profile: AutopilotProfile,
  ) {}

  private async source(date: string): Promise<AutopilotGuardSource> {
    if (!this.deps.actions.findAll)
      throw new DomainError(
        'day_autopilot.catalog_required',
        'Автопилоту нужен полный каталог действий.',
      );
    const [
      actions,
      goals,
      directions,
      planning,
      sessions,
      sleep,
      sleepObservations,
      routineBlocks,
      preferences,
      draft,
      active,
    ] = await Promise.all([
      this.deps.actions.findAll(),
      this.profile.goals.findAll(),
      this.profile.directions.findAll(),
      this.profile.planning.read(),
      this.deps.sessions.all(),
      this.profile.schedule.getState(),
      this.deps.sleep.history(shiftAutopilotDate(date, -1), date),
      this.profile.blocks.findAll(),
      this.profile.settings.getPreferences(),
      this.profile.settings.getDraft(date),
      this.profile.walks.getActive(),
    ]);
    const walks = new Map(active.map((walk) => [walk.id.toString(), walk]));
    let cursor: string | undefined;
    do {
      const page = await this.profile.walks.list({
        from: date,
        to: date,
        ...(cursor ? { cursor } : {}),
      });
      for (const walk of page.items) walks.set(walk.id.toString(), walk);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return {
      date,
      catalog: { actions, goals, directions, links: planning.links },
      sessions,
      sleep,
      sleepObservations,
      routineBlocks,
      walks: [...walks.values()],
      preferences,
      draft,
    };
  }

  public async getSetup(date: DayDate): Promise<AutopilotSetup> {
    const source = await this.source(date.toString());
    const capacities = await this.deps.capacity.get();
    const capacity =
      capacities[(new Date(`${date.toString()}T12:00:00Z`).getUTCDay() + 6) % 7] ?? null;
    return {
      preferences: source.preferences,
      draft: source.draft,
      catalog: source.catalog,
      wishResolution: resolveAutopilotWishes(
        source.draft.value.wishes,
        source.catalog,
        source.draft.value.wishReferences,
      ),
      suggestedEndMinute:
        capacity === null
          ? null
          : Math.min(1440, (source.draft.value.startMinute ?? 540) + capacity),
      sleepConfigured: source.sleep.settings !== null,
      timeZone: source.sleep.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  public async preview(input: DayAutopilotPreviewInput): Promise<DayAutopilotPreview> {
    const date = input.date.toString();
    let source = await this.source(date);
    // Persist versioned defaults before taking the transaction guard snapshot.
    if (source.preferences.version === 0)
      await this.profile.settings.savePreferences(source.preferences.value, 0);
    if (source.draft.version === 0) await this.profile.settings.saveDraft(source.draft.value, 0);
    if (source.preferences.version === 0 || source.draft.version === 0)
      source = await this.source(date);
    const { preferences, draft } = source;
    const requested = input.startMinute ?? draft.value.startMinute;
    if (requested === null || draft.value.endMinute === null)
      throw new DomainError(
        'day_autopilot.range_required',
        'Укажите начало и конец планирования дня.',
      );
    const now = this.deps.clock.now();
    const timeZone =
      source.sleep.settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const local = autopilotLocalTime(now, timeZone);
    if (date < local.date) throw stale();
    const currentMinute = local.minute + (now.getSeconds() || now.getMilliseconds() ? 1 : 0);
    const startMinute =
      date === local.date ? Math.max(requested, Math.ceil(currentMinute / 5) * 5) : requested;
    const wishes = resolveAutopilotWishes(
      draft.value.wishes,
      source.catalog,
      draft.value.wishReferences,
    );
    if (wishes.unavailable?.length)
      throw new DomainError(
        'day_autopilot.wish_unavailable',
        'Выбранное пожелание больше недоступно. Исправьте текст или удалите недоступную связь.',
      );
    if (wishes.unresolved.length)
      throw new DomainError(
        'day_autopilot.wishes_unresolved',
        'Уточните пожелания: выберите направление, цель или действие.',
      );
    const groups = selectAutopilotCandidates(
      date,
      source.catalog,
      preferences.value.focus,
      wishes.matches,
    );
    const recoverySignal = recoverySignalForDate(source.sleepObservations, date);
    const activeIds = new Set(
      source.sessions
        .filter((session) => session.status === 'running' || session.status === 'paused')
        .map((session) => session.lifeActionId.toString()),
    );
    const constraints = buildAutopilotConstraints({
      date,
      now,
      preferences: preferences.value,
      draft: { ...draft.value, startMinute },
      sleep: source.sleep,
      routineBlocks: source.routineBlocks,
      walks: source.walks,
      actions: source.catalog.actions,
      rebuild: input.mode === 'rebuild',
    });
    const plan = buildDayAutopilotPlan({
      date,
      mode: input.mode,
      startMinute,
      endMinute: draft.value.endMinute,
      capacityMinutes: draft.value.endMinute - startMinute,
      reserveRatio: recoverySignal ? 0.25 : 0.15,
      groups,
      maxActions: preferences.value.maxActions,
      constraints,
      pomodoro: this.profile.pomodoro.read(),
      excludedActionIds: draft.value.excludedActionIds,
      durationOverrides: draft.value.durationOverrides,
      actions: source.catalog.actions
        .filter(
          (action) =>
            isAutopilotOpenAction(action) ||
            activeIds.has(action.id.toString()) ||
            action.status === LIFE_ACTION_STATUS.inProgress,
        )
        .map((action) => ({
          ...toPlannerInput(action, activeIds),
          plannedDate: action.plannedDate?.toString() ?? null,
        })),
    });
    const accepted = new Set([...plan.proposals, ...plan.locked].map((item) => item.actionId));
    return {
      ...plan,
      createdAt: now.toISOString(),
      capacityMinutes: draft.value.endMinute - startMinute,
      capacityAssumed: false,
      recoverySignal,
      guard: buildAutopilotGuard(source),
      timeZone,
      wishResolution: wishes,
      affectedRoutineBlocks:
        input.mode === 'rebuild'
          ? source.routineBlocks
              .filter(
                (block) =>
                  isAutopilotOwnedBlock(block.id.toString(), date) &&
                  block.anchorDate.toString() === date &&
                  minuteOf(block.startTime) >= startMinute,
              )
              .map((block) => ({
                id: block.id.toString(),
                startMinute: minuteOf(block.startTime),
                expectedVersion: block.version,
              }))
          : [],
      uncoveredWishes: groups.wishes
        .filter((wish) => !wish.actionIds.some((id) => accepted.has(id)))
        .map((wish) => wish.reference),
    };
  }

  public async apply(preview: DayAutopilotPreview): Promise<DayAutopilotApplyResult> {
    if (!preview.guard || !preview.timeline || !preview.timeZone || !preview.affectedRoutineBlocks)
      throw stale();
    const source = await this.source(preview.date);
    if (buildAutopilotGuard(source).sourceFingerprint !== preview.guard.sourceFingerprint)
      throw stale();
    const now = this.deps.clock.now(),
      local = autopilotLocalTime(now, preview.timeZone);
    if (local.date > preview.date) throw stale();
    const currentMinute =
      local.date === preview.date
        ? local.minute + (now.getSeconds() || now.getMilliseconds() ? 1 : 0)
        : 0;
    // Time passing does not change the source fingerprint. Reject the whole original
    // batch rather than silently shrinking its deletes or moving an already started block.
    if (preview.affectedRoutineBlocks.some((block) => block.startMinute < currentMinute))
      throw stale();
    if (
      preview.proposals.some(
        (item) =>
          item.startMinute < currentMinute ||
          (item.previousDate === preview.date &&
            item.previousStartMinute !== null &&
            item.previousStartMinute < currentMinute),
      )
    )
      throw stale();
    const journalEntries: JournalEntry[] = [];
    const lifeActions: { lifeAction: LifeAction; expectedVersion: number }[] = [];
    for (const proposal of preview.proposals) {
      const action = source.catalog.actions.find(
        (item) => item.id.toString() === proposal.actionId,
      );
      if (
        !action ||
        !isAutopilotOpenAction(action) ||
        action.version !== proposal.expectedVersion ||
        (action.plannedDate?.toString() ?? null) !== proposal.previousDate
      )
        throw stale();
      const expectedVersion = action.version;
      journalEntries.push(
        ...prepareLifeActionPlan(
          action,
          {
            lifeActionId: action.id,
            plannedDate: DayDate.create(preview.date),
            isNext: action.isNext && proposal.previousDate === preview.date,
            allowedStatuses: ['draft', 'ready'],
          },
          this.deps.clock,
          this.profile.ids,
        ),
      );
      action.setTimePlanning({
        estimateMinutes:
          proposal.estimateSource === 'user' ? proposal.durationMinutes : action.estimateMinutes,
        scheduledStartMinute: proposal.startMinute,
        scheduledDurationMinutes: proposal.durationMinutes,
      });
      lifeActions.push({ lifeAction: action, expectedVersion });
    }
    for (const item of preview.deferred.filter(
      (item) =>
        preview.mode === 'rebuild' && item.hadScheduledWindow && item.reason === 'no_capacity',
    )) {
      const action = source.catalog.actions.find(
        (action) => action.id.toString() === item.actionId,
      );
      if (
        !action ||
        !isAutopilotOpenAction(action) ||
        action.version !== item.expectedVersion ||
        action.plannedDate?.toString() !== preview.date ||
        item.previousStartMinute === null ||
        item.previousStartMinute < currentMinute
      )
        throw stale();
      const expectedVersion = action.version;
      action.setTimePlanning({
        estimateMinutes: action.estimateMinutes,
        scheduledStartMinute: null,
        scheduledDurationMinutes: null,
      });
      lifeActions.push({ lifeAction: action, expectedVersion });
    }
    const generated = preview.timeline.filter(
      (block) =>
        !block.protected &&
        !block.actionId &&
        !block.sourceId &&
        (block.kind === 'rest' || block.kind === 'walk'),
    );
    const routineBlocks = generated.map((block) => {
      if (
        !isAutopilotOwnedBlock(block.id, preview.date) ||
        block.startMinute < currentMinute ||
        block.endMinute >= 1440
      )
        throw stale();
      const old = source.routineBlocks.find((item) => item.id.toString() === block.id);
      if (old && minuteOf(old.startTime) < currentMinute) throw stale();
      const details = {
        anchorDate: DayDate.create(preview.date),
        title: block.title,
        startTime: autopilotTimeLabel(block.startMinute),
        endTime: autopilotTimeLabel(block.endMinute),
        category: 'rest' as const,
        required: true,
        recurrence: RoutineBlockRecurrence.create('none'),
        assignment: { kind: block.kind === 'walk' ? ('walk' as const) : ('reminder' as const) },
      };
      return {
        block: old
          ? old.update(details, now)
          : RoutineBlock.create({ ...details, id: EntityId.create(block.id), now }),
        expectedVersion: old?.version ?? null,
      };
    });
    const generatedIds = new Set(generated.map((item) => item.id));
    const deletedRoutineBlocks =
      preview.mode === 'rebuild'
        ? source.routineBlocks
            .filter(
              (block) =>
                isAutopilotOwnedBlock(block.id.toString(), preview.date) &&
                block.anchorDate.toString() === preview.date &&
                !generatedIds.has(block.id.toString()) &&
                preview.affectedRoutineBlocks!.some((item) => item.id === block.id.toString()),
            )
            .map((block) => ({ id: block.id, expectedVersion: block.version }))
        : [];
    await this.deps.unitOfWork.commit({
      lifeActions,
      routineBlocks,
      deletedRoutineBlocks,
      journalEntries,
      inactiveSessionActionIds: lifeActions.map((change) => change.lifeAction.id),
      autopilotGuard: preview.guard,
      ...(lifeActions.some((change) => change.lifeAction.isNext)
        ? { mainActionDate: DayDate.create(preview.date) }
        : {}),
    });
    return { updatedCount: lifeActions.length, routineBlockCount: routineBlocks.length };
  }

  public async readSchedule(from: DayDate, to: DayDate): Promise<readonly AutopilotDaySchedule[]> {
    if (from.toString() > to.toString() || shiftAutopilotDate(from.toString(), 31) < to.toString())
      throw new DomainError('day_autopilot.range_invalid', 'Выберите диапазон до 31 дня.');
    const result: AutopilotDaySchedule[] = [];
    for (let date = from.toString(); date <= to.toString(); date = shiftAutopilotDate(date, 1)) {
      const source = await this.source(date);
      const blocks = [
        ...buildAutopilotConstraints({
          date,
          now: this.deps.clock.now(),
          preferences: source.preferences.value,
          draft: source.draft.value,
          sleep: source.sleep,
          routineBlocks: source.routineBlocks,
          walks: source.walks,
          actions: source.catalog.actions,
          readback: true,
        }),
      ];
      for (const action of source.catalog.actions) {
        if (
          action.plannedDate?.toString() !== date ||
          action.isArchived() ||
          action.isDeleted() ||
          action.status === 'cancelled' ||
          action.scheduledStartMinute === null ||
          action.scheduledDurationMinutes === null
        )
          continue;
        if (!blocks.some((block) => block.actionId === action.id.toString()))
          blocks.push({
            id: `action:${action.id.toString()}`,
            kind: 'action',
            title: action.title.toString(),
            startMinute: action.scheduledStartMinute,
            endMinute: action.scheduledStartMinute + action.scheduledDurationMinutes,
            sourceId: action.id.toString(),
            actionId: action.id.toString(),
            protected: true,
          });
      }
      blocks.sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
      const completed = new Set(
        source.catalog.actions
          .filter((action) => action.status === 'completed')
          .map((action) => action.id.toString()),
      );
      result.push({
        date,
        blocks,
        conflictIds: scheduleConflictIds(
          blocks.filter((block) => !block.actionId || !completed.has(block.actionId)),
        ),
      });
    }
    return result;
  }
}
function minuteOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}
