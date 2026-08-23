import {
  ACTION_SESSION_STATUS,
  ActionActualResult,
  ActionCancelReason,
  DECISION_KIND,
  DECISION_STATUS,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  Day,
  DayDate,
  Decision,
  DecisionTitle,
  ExpectedResult,
  LIFE_ACTION_STATUS,
  LifeAction,
  SESSION_COMPLETION_KIND,
  type DecisionKind,
  type EntityId,
  type EveningCycle,
  type EveningCycleMode,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_RESOLUTION,
  PREPARATION_PLAN_STATUS,
  TOMORROW_PLAN_STATUS,
  TOMORROW_PLANNING_QUALITY,
  createShutdownRecord,
  type PreparationPlan,
  type ShutdownRecord,
  type TomorrowPlan,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DayCompletionUnitOfWork } from '../ports/DayCompletionUnitOfWork';
import type { IdGenerator } from '../ports/IdGenerator';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import type { PreparationPlanRepository } from '../ports/PreparationPlanRepository';
import type { EveningReviewSnapshot, GetEveningCycleReview } from '../queries/GetEveningReview';
import {
  createDayJournalEntries,
  createDecisionJournalEntries,
  createLifeActionJournalEntries,
} from '../journal/createJournalEntries';
import { cloneEveningCycle } from '../evening-cycle';

export type EveningLifeActionResolution =
  | Readonly<{
      kind: 'complete';
      lifeActionId: EntityId;
      actualResult: string;
    }>
  | Readonly<{
      kind: 'reschedule';
      lifeActionId: EntityId;
      newPlannedDate: string;
    }>
  | Readonly<{
      kind: 'cancel';
      lifeActionId: EntityId;
      reason: string;
    }>;

export interface TomorrowDecisionDraft {
  readonly title: string;
  readonly kind: DecisionKind;
  readonly expectedResult?: string;
}

export interface CompleteCurrentDayInput {
  readonly mode?: EveningCycleMode;
  readonly skipEvening?: boolean;
  readonly summary: string;
  readonly sphereId?: EntityId | null;
  readonly actionResolutions: readonly EveningLifeActionResolution[];
  readonly tomorrowDecisions: readonly TomorrowDecisionDraft[];
}

export interface CompleteCurrentDayResult {
  readonly day: Day;
  readonly resolvedLifeActions: readonly LifeAction[];
  readonly createdTomorrowDecisions: readonly Decision[];
  readonly shutdownRecord?: ShutdownRecord;
}

const MAX_DAY_SUMMARY_LENGTH = 4000;

export class CompleteEveningCycle {
  readonly #getEveningReview: Pick<GetEveningCycleReview, 'execute'>;
  readonly #unitOfWork: DayCompletionUnitOfWork;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #tomorrowPlans: TomorrowPlanRepository | null;
  readonly #preparationPlans: PreparationPlanRepository | null;

  public constructor(
    getEveningReview: Pick<GetEveningCycleReview, 'execute'>,
    unitOfWork: DayCompletionUnitOfWork,
    clock: Clock,
    idGenerator: IdGenerator,
    tomorrowPlans?: TomorrowPlanRepository,
    preparationPlans?: PreparationPlanRepository,
  ) {
    this.#getEveningReview = getEveningReview;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#tomorrowPlans = tomorrowPlans ?? null;
    this.#preparationPlans = preparationPlans ?? null;
  }

  public async execute(
    input: CompleteCurrentDayInput,
    reviewDate?: DayDate,
  ): Promise<Result<CompleteCurrentDayResult, DomainError>> {
    try {
      const snapshot = await this.#getEveningReview.execute(reviewDate);
      if (
        snapshot.day.status === 'completed' &&
        snapshot.cycle.state === EVENING_CYCLE_STATE.completed
      ) {
        return success(completedResult(snapshot));
      }
      validateDayCanBeCompleted(snapshot);
      const occurredAt = this.#clock.now();
      if (input.skipEvening === true) {
        return await this.skipCycle(snapshot, input, occurredAt);
      }
      const mode = input.mode ?? snapshot.cycle.mode;
      if (mode !== snapshot.cycle.mode) {
        throw new DomainError(
          'evening_cycle.mode_mismatch',
          'Режим нужно выбрать отдельной командой до завершения вечернего цикла.',
        );
      }
      if (snapshot.cycle.state === EVENING_CYCLE_STATE.shutdown) {
        return await this.completeShutdown(snapshot, input, occurredAt);
      }
      return failure(requiredRouteIncomplete());
      const summary = normalizeSummary(input.summary);
      const unresolvedActions = snapshot.lifeActions.filter(isUnfinishedLifeAction);
      const resolutions = indexResolutions(input.actionResolutions, unresolvedActions);
      const resolvedLifeActions = unresolvedActions.map((lifeAction) =>
        resolveLifeAction(
          cloneLifeAction(lifeAction),
          lifeAction.version,
          resolutions.get(lifeAction.id.toString())!,
          snapshot,
          occurredAt,
          this.#idGenerator,
        ),
      );
      const createdTomorrowDecisions = createTomorrowDecisions(
        input.tomorrowDecisions,
        snapshot,
        occurredAt,
        this.#idGenerator,
      );
      const completedDay = cloneDay(snapshot.day);
      const expectedDayVersion = completedDay.version;
      completedDay.complete(
        occurredAt,
        this.#idGenerator.generate(),
        summary,
        input.sphereId ?? null,
      );
      const completedCycle = cloneEveningCycle(snapshot.cycle);
      const expectedEveningCycleVersion = completedCycle.version;
      for (const { lifeAction } of resolvedLifeActions) {
        const inputResolution = resolutions.get(lifeAction.id.toString())!;
        if (
          completedCycle.openLoopReferences.some(
            (reference) =>
              reference.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction &&
              reference.entityId.equals(lifeAction.id),
          ) &&
          !completedCycle.openLoopResolutions.some(
            (resolution) =>
              resolution.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction &&
              resolution.entityId.equals(lifeAction.id),
          )
        ) {
          completedCycle.recordOpenLoopResolution(
            OPEN_LOOP_ENTITY_TYPE.lifeAction,
            lifeAction.id,
            inputResolution.kind === 'complete'
              ? OPEN_LOOP_RESOLUTION.complete
              : inputResolution.kind === 'reschedule'
                ? OPEN_LOOP_RESOLUTION.carryForward
                : OPEN_LOOP_RESOLUTION.drop,
            occurredAt,
          );
        }
      }
      completeCycle(
        completedCycle,
        mode,
        occurredAt,
        createdTomorrowDecisions.map((decision) => decision.id),
        resolvedLifeActions.map(({ lifeAction }) => lifeAction.id),
        this.#preparationPlans === null,
      );

      await this.#unitOfWork.commit({
        eveningCycle: completedCycle,
        expectedEveningCycleVersion,
        day: completedDay,
        expectedDayVersion,
        lifeActions: resolvedLifeActions.map(({ lifeAction, expectedVersion }) => ({
          lifeAction,
          expectedVersion,
        })),
        tomorrowDate: snapshot.tomorrowDate,
        newTomorrowDecisions: createdTomorrowDecisions,
        journalEntries: [
          ...createDayJournalEntries(completedDay, completedCycle),
          ...resolvedLifeActions.flatMap(({ lifeAction }) =>
            createLifeActionJournalEntries(lifeAction),
          ),
          ...createdTomorrowDecisions.flatMap(createDecisionJournalEntries),
        ],
      });

      return success(
        Object.freeze({
          day: completedDay,
          resolvedLifeActions: Object.freeze(
            resolvedLifeActions.map(({ lifeAction }) => lifeAction),
          ),
          createdTomorrowDecisions: Object.freeze([...createdTomorrowDecisions]),
        }),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        if (
          error.code === 'day.completion_conflict' ||
          error.code === 'evening_cycle.completion_conflict'
        ) {
          const current = await this.#getEveningReview.execute(reviewDate);
          if (
            current.day.status === 'completed' &&
            current.cycle.state === EVENING_CYCLE_STATE.completed
          ) {
            return success(completedResult(current));
          }
        }
        return failure(error);
      }

      throw error;
    }
  }

  private async completeShutdown(
    snapshot: EveningReviewSnapshot,
    input: CompleteCurrentDayInput,
    occurredAt: Date,
  ): Promise<Result<CompleteCurrentDayResult, DomainError>> {
    validateShutdownSnapshot(snapshot);
    if (this.#tomorrowPlans === null || this.#preparationPlans === null) {
      throw new DomainError(
        'shutdown.dependencies_required',
        'Завершение дня требует связанных TomorrowPlan и PreparationPlan.',
      );
    }
    const [tomorrowPlan, preparationPlan] = await Promise.all([
      this.#tomorrowPlans.findByCycleId(snapshot.cycle.id),
      this.#preparationPlans.findByCycleId(snapshot.cycle.id),
    ]);
    const validatedPlans = validateShutdownPlans(snapshot, tomorrowPlan, preparationPlan);
    const validatedTomorrowPlan = validatedPlans.tomorrowPlan;
    const validatedPreparationPlan = validatedPlans.preparationPlan;

    const completedDay = cloneDay(snapshot.day);
    const expectedDayVersion = completedDay.version;
    completedDay.complete(
      occurredAt,
      this.#idGenerator.generate(),
      normalizeShutdownSummary(input.summary),
      input.sphereId ?? null,
    );
    const completedCycle = cloneEveningCycle(snapshot.cycle);
    const expectedEveningCycleVersion = completedCycle.version;
    const decisionIds = [
      ...(validatedTomorrowPlan.primaryDecisionId === null
        ? []
        : [validatedTomorrowPlan.primaryDecisionId]),
      ...validatedTomorrowPlan.supportingDecisionIds,
    ];
    const lifeActionIds =
      validatedTomorrowPlan.firstActionId === null ? [] : [validatedTomorrowPlan.firstActionId];
    completedCycle.complete(occurredAt, decisionIds, lifeActionIds);
    const shutdownRecord = shutdownRecordFor(completedCycle);

    await this.#unitOfWork.commit({
      eveningCycle: completedCycle,
      expectedEveningCycleVersion,
      day: completedDay,
      expectedDayVersion,
      lifeActions: [],
      tomorrowDate: validatedTomorrowPlan.targetDateKey,
      newTomorrowDecisions: [],
      journalEntries: createDayJournalEntries(completedDay, completedCycle),
      tomorrowPlan: validatedTomorrowPlan,
      expectedTomorrowPlanVersion: validatedTomorrowPlan.version,
      ...(validatedPreparationPlan === null
        ? {}
        : {
            preparationPlan: validatedPreparationPlan,
            expectedPreparationPlanVersion: validatedPreparationPlan.version,
          }),
    });

    return success(
      Object.freeze({
        day: completedDay,
        resolvedLifeActions: Object.freeze([]),
        createdTomorrowDecisions: Object.freeze([]),
        shutdownRecord,
      }),
    );
  }

  private async skipCycle(
    snapshot: EveningReviewSnapshot,
    input: CompleteCurrentDayInput,
    occurredAt: Date,
  ): Promise<Result<CompleteCurrentDayResult, DomainError>> {
    const completedDay = cloneDay(snapshot.day);
    const expectedDayVersion = completedDay.version;
    const summary = input.summary.trim() || 'Вечерний цикл пропущен';
    completedDay.complete(
      occurredAt,
      this.#idGenerator.generate(),
      summary,
      input.sphereId ?? null,
    );
    const completedCycle = cloneEveningCycle(snapshot.cycle);
    const expectedEveningCycleVersion = completedCycle.version;
    completedCycle.skip(occurredAt);
    await this.#unitOfWork.commit({
      eveningCycle: completedCycle,
      expectedEveningCycleVersion,
      day: completedDay,
      expectedDayVersion,
      lifeActions: [],
      tomorrowDate: snapshot.tomorrowDate,
      newTomorrowDecisions: [],
      journalEntries: createDayJournalEntries(completedDay, completedCycle),
    });
    return success(
      Object.freeze({
        day: completedDay,
        resolvedLifeActions: Object.freeze([]),
        createdTomorrowDecisions: Object.freeze([]),
      }),
    );
  }
}

export class CompleteCurrentDay {
  readonly #core: Pick<CompleteEveningCycle, 'execute'>;

  public constructor(core: Pick<CompleteEveningCycle, 'execute'>) {
    this.#core = core;
  }

  public execute(
    input: CompleteCurrentDayInput,
    reviewDate?: DayDate,
  ): Promise<Result<CompleteCurrentDayResult, DomainError>> {
    return this.#core.execute(input, reviewDate);
  }
}

function completeCycle(
  cycle: EveningCycle,
  mode: EveningCycleMode,
  occurredAt: Date,
  decisionIds: readonly EntityId[],
  lifeActionIds: readonly EntityId[],
  allowLegacyPreparationTransition: boolean,
): void {
  if (mode === EVENING_CYCLE_MODE.quick) {
    throw requiredRouteIncomplete();
  }
  if (mode === EVENING_CYCLE_MODE.emergency) {
    throw requiredRouteIncomplete();
  }
  if (mode !== EVENING_CYCLE_MODE.normal) {
    throw new DomainError('evening_cycle.invalid_mode', 'Неизвестный режим завершения вечера.');
  }
  if (cycle.state === EVENING_CYCLE_STATE.notStarted) cycle.start(occurredAt);
  if (cycle.state === EVENING_CYCLE_STATE.windingDown) cycle.beginResolving(occurredAt);
  if (cycle.state === EVENING_CYCLE_STATE.resolving) cycle.completeResolving(occurredAt);
  if (cycle.state === EVENING_CYCLE_STATE.reflecting) {
    throw new DomainError('reflection.incomplete', 'Сначала завершите осмысление дня.');
  }
  if (cycle.state === EVENING_CYCLE_STATE.planningTomorrow) {
    cycle.completeTomorrowPlanning(occurredAt);
  }
  if (cycle.state === EVENING_CYCLE_STATE.preparing) {
    if (allowLegacyPreparationTransition) {
      cycle.completePreparation(occurredAt);
    } else {
      throw new DomainError(
        'preparation.command_required',
        'Сначала завершите подготовку к завтра через команду PREPARING.',
      );
    }
  }
  if (cycle.state === EVENING_CYCLE_STATE.shutdown) {
    cycle.complete(occurredAt, decisionIds, lifeActionIds);
  }
  if (cycle.state !== EVENING_CYCLE_STATE.completed) {
    throw new DomainError(
      'evening_cycle.completion_failed',
      'Вечерний цикл не удалось привести к завершённому состоянию.',
    );
  }
}

function requiredRouteIncomplete(): DomainError {
  return new DomainError(
    'shutdown.requires_completed_preparation',
    'Сначала пройдите обязательные этапы выбранного режима до SHUTDOWN.',
  );
}

function completedResult(snapshot: EveningReviewSnapshot): CompleteCurrentDayResult {
  const shutdownRecord =
    snapshot.cycle.startedAt === null || snapshot.cycle.completedAt === null
      ? undefined
      : shutdownRecordFor(snapshot.cycle);
  return Object.freeze({
    day: snapshot.day,
    resolvedLifeActions: Object.freeze([]),
    createdTomorrowDecisions: Object.freeze([]),
    ...(shutdownRecord === undefined ? {} : { shutdownRecord }),
  });
}

function validateShutdownSnapshot(snapshot: EveningReviewSnapshot): void {
  validateDayCanBeCompleted(snapshot);
  if (snapshot.cycle.state !== EVENING_CYCLE_STATE.shutdown) {
    throw new DomainError(
      'shutdown.requires_completed_preparation',
      'В SHUTDOWN можно перейти только после корректно завершённого PREPARING.',
    );
  }
  if (
    !snapshot.cycle.dayId.equals(snapshot.day.id) ||
    !snapshot.cycle.dateKey.equals(snapshot.day.date)
  ) {
    throw new DomainError(
      'shutdown.day_conflict',
      'Вечерний цикл относится к другому жизненному дню.',
    );
  }
  if (snapshot.cycle.openLoopProgress.remaining > 0) {
    throw new DomainError(
      'shutdown.open_loops_remaining',
      'Перед завершением разберите все обязательные незавершённые элементы.',
    );
  }
  if (
    snapshot.cycle.mode === EVENING_CYCLE_MODE.normal &&
    !snapshot.cycle.reflectionProgress.complete
  ) {
    throw new DomainError(
      'shutdown.reflection_incomplete',
      'Перед завершением осмыслите итоги дня.',
    );
  }
}

function validateShutdownPlans(
  snapshot: EveningReviewSnapshot,
  tomorrowPlan: TomorrowPlan | null,
  preparationPlan: PreparationPlan | null,
): Readonly<{ tomorrowPlan: TomorrowPlan; preparationPlan: PreparationPlan | null }> {
  const emergency = snapshot.cycle.mode === EVENING_CYCLE_MODE.emergency;
  if (
    tomorrowPlan === null ||
    !tomorrowPlan.cycleId.equals(snapshot.cycle.id) ||
    !tomorrowPlan.sourceDayId.equals(snapshot.day.id) ||
    tomorrowPlan.status !== TOMORROW_PLAN_STATUS.completed ||
    tomorrowPlan.completedAt === null ||
    (emergency ? !tomorrowPlan.isMinimallyReady : !tomorrowPlan.isReady) ||
    (emergency
      ? tomorrowPlan.planningQuality !== TOMORROW_PLANNING_QUALITY.minimal &&
        tomorrowPlan.planningQuality !== TOMORROW_PLANNING_QUALITY.full
      : tomorrowPlan.planningQuality !== TOMORROW_PLANNING_QUALITY.full)
  ) {
    throw new DomainError(
      'shutdown.tomorrow_plan_not_ready',
      'Перед завершением подготовьте и завершите TomorrowPlan.',
    );
  }
  if (emergency) {
    return Object.freeze({ tomorrowPlan, preparationPlan: null });
  }
  if (
    preparationPlan === null ||
    !preparationPlan.cycleId.equals(snapshot.cycle.id) ||
    !preparationPlan.tomorrowPlanId.equals(tomorrowPlan.id) ||
    !preparationPlan.targetDayId.equals(tomorrowPlan.targetDayId) ||
    preparationPlan.status !== PREPARATION_PLAN_STATUS.completed ||
    preparationPlan.completedAt === null ||
    preparationPlan.progress.requiredPending > 0
  ) {
    throw new DomainError(
      'shutdown.preparation_not_ready',
      'Перед завершением обработайте обязательные пункты PreparationPlan.',
    );
  }
  return Object.freeze({ tomorrowPlan, preparationPlan });
}

function normalizeShutdownSummary(value: string): string {
  const normalized = value.trim();
  return normalizeSummary(normalized.length === 0 ? 'Вечер завершён. Завтра подготовлено.' : value);
}

function shutdownRecordFor(cycle: EveningCycle): ShutdownRecord {
  if (cycle.startedAt === null || cycle.completedAt === null) {
    throw new DomainError(
      'shutdown.record_incomplete',
      'Для завершённого вечернего цикла не хватает временных отметок.',
    );
  }
  return createShutdownRecord({
    cycleId: cycle.id,
    dayId: cycle.dayId,
    mode: cycle.mode,
    modeReason: cycle.modeReason,
    startedAt: cycle.startedAt,
    completedAt: cycle.completedAt,
    skippedStages: cycle.skippedStages,
  });
}

function validateDayCanBeCompleted(snapshot: EveningReviewSnapshot): void {
  if (snapshot.day.status === 'completed') {
    throw new DomainError('day.already_completed', 'День уже завершён.');
  }

  if (snapshot.day.status !== 'open') {
    throw new DomainError(
      'day.completion_requires_open_day',
      'Вечерний контроль доступен только после начала дня.',
    );
  }

  if (snapshot.unfinishedSession !== null) {
    const message =
      snapshot.unfinishedSession.status === ACTION_SESSION_STATUS.paused
        ? 'Сначала завершите приостановленную рабочую сессию.'
        : 'Сначала завершите активную рабочую сессию.';
    throw new DomainError('day.unfinished_session', message);
  }

  if (snapshot.routineSummary !== undefined && snapshot.routineSummary.runningExecution !== null) {
    throw new DomainError(
      'day.running_routine_execution',
      'Сначала завершите или прервите текущий блок распорядка.',
    );
  }
}

function normalizeSummary(value: string): string {
  const summary = value.trim();

  if (summary.length === 0) {
    throw new DomainError('day.summary_required', 'Запишите итог дня.');
  }

  if (summary.length > MAX_DAY_SUMMARY_LENGTH) {
    throw new DomainError(
      'day.summary_too_long',
      `Итог дня не должен превышать ${MAX_DAY_SUMMARY_LENGTH} символов.`,
    );
  }

  return summary;
}

function indexResolutions(
  resolutions: readonly EveningLifeActionResolution[],
  unfinishedActions: readonly LifeAction[],
): ReadonlyMap<string, EveningLifeActionResolution> {
  const expectedIds = new Set(unfinishedActions.map((action) => action.id.toString()));
  const indexed = new Map<string, EveningLifeActionResolution>();

  for (const resolution of resolutions) {
    const id = resolution.lifeActionId.toString();

    if (!expectedIds.has(id)) {
      throw new DomainError(
        'day.unknown_action_resolution',
        'В вечернем контроле указано действие, которое не требует обработки.',
      );
    }

    if (indexed.has(id)) {
      throw new DomainError(
        'day.duplicate_action_resolution',
        'Для одного действия нельзя указать два решения.',
      );
    }

    indexed.set(id, resolution);
  }

  const missing = unfinishedActions.find((action) => !indexed.has(action.id.toString()));
  if (missing !== undefined) {
    throw new DomainError(
      'day.action_resolution_required',
      `Обработайте действие «${missing.title.toString()}»: завершите, перенесите или отмените.`,
    );
  }

  return indexed;
}

function resolveLifeAction(
  lifeAction: LifeAction,
  expectedVersion: number,
  resolution: EveningLifeActionResolution,
  snapshot: EveningReviewSnapshot,
  occurredAt: Date,
  idGenerator: IdGenerator,
): { readonly lifeAction: LifeAction; readonly expectedVersion: number } {
  switch (resolution.kind) {
    case 'complete': {
      if (lifeAction.status !== LIFE_ACTION_STATUS.inProgress) {
        throw new DomainError(
          'day.action_completion_requires_in_progress',
          `Действие «${lifeAction.title.toString()}» нельзя завершить без начатого выполнения.`,
        );
      }

      const hasCompletedSession = snapshot.actionSessions.some(
        (session) =>
          session.lifeActionId.equals(lifeAction.id) &&
          session.status === ACTION_SESSION_STATUS.completed &&
          session.completionKind === SESSION_COMPLETION_KIND.completed,
      );

      if (!hasCompletedSession) {
        throw new DomainError(
          'day.action_completion_requires_session',
          `Для действия «${lifeAction.title.toString()}» нужна хотя бы одна завершённая рабочая сессия.`,
        );
      }

      lifeAction.complete(
        ActionActualResult.create(resolution.actualResult),
        occurredAt,
        idGenerator.generate(),
      );
      break;
    }
    case 'reschedule': {
      const targetDate = parseFutureDate(resolution.newPlannedDate, snapshot);
      lifeAction.reschedule(targetDate, occurredAt, idGenerator.generate());
      break;
    }
    case 'cancel': {
      const reason = resolution.reason.trim() || 'Отменено при вечернем контроле';
      lifeAction.cancel(occurredAt, idGenerator.generate(), ActionCancelReason.create(reason));
      break;
    }
  }

  return Object.freeze({ lifeAction, expectedVersion });
}

function parseFutureDate(value: string, snapshot: EveningReviewSnapshot): DayDate {
  const date = DayDate.create(value);

  if (date.isBefore(snapshot.tomorrowDate)) {
    throw new DomainError(
      'day.action_reschedule_requires_future_date',
      snapshot.isRecoveryReview
        ? 'При восстановлении прошлого дня действие можно перенести только на сегодня или более позднюю дату.'
        : 'При завершении дня действие можно перенести только на будущую дату.',
    );
  }

  return date;
}

function createTomorrowDecisions(
  drafts: readonly TomorrowDecisionDraft[],
  snapshot: EveningReviewSnapshot,
  occurredAt: Date,
  idGenerator: IdGenerator,
): readonly Decision[] {
  const activeTomorrowDecisions = snapshot.tomorrowDecisions.filter(
    (decision) =>
      !decision.isArchived() &&
      !decision.isDeleted() &&
      (decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress),
  );
  const occupiedOrders = new Set(
    activeTomorrowDecisions
      .filter((decision) => decision.kind === DECISION_KIND.main)
      .map((decision) => decision.order),
  );
  const created: Decision[] = [];

  for (const draft of drafts) {
    const title = draft.title.trim();
    const expectedResultText = draft.expectedResult?.trim() ?? '';

    if (title.length === 0 && expectedResultText.length === 0) {
      continue;
    }

    if (title.length === 0) {
      throw new DomainError('decision.title_required', 'Введите название решения на завтра.');
    }

    if (draft.kind === DECISION_KIND.main && expectedResultText.length === 0) {
      throw new DomainError(
        'decision.expected_result_required',
        'Для главного решения на завтра укажите ожидаемый результат.',
      );
    }

    let order: number | null = null;
    if (draft.kind === DECISION_KIND.main) {
      order = [1, 2, 3].find((candidate) => !occupiedOrders.has(candidate)) ?? null;

      if (order === null) {
        throw new DomainError(
          'decision.main_limit_reached',
          'На завтра уже подготовлены три главных решения.',
        );
      }
      occupiedOrders.add(order);
    }

    const expectedResult =
      expectedResultText.length === 0 ? undefined : ExpectedResult.create(expectedResultText);
    const decision = Decision.createDraft({
      id: idGenerator.generate(),
      title: DecisionTitle.create(title),
      kind: draft.kind,
      ...(expectedResult === undefined ? {} : { expectedResult }),
      occurredAt,
      eventId: idGenerator.generate(),
    });
    decision.plan({
      plannedDate: snapshot.tomorrowDate,
      kind: draft.kind,
      ...(order === null ? {} : { order }),
      ...(expectedResult === undefined ? {} : { expectedResult }),
      occurredAt,
      eventId: idGenerator.generate(),
    });
    created.push(decision);
  }

  const totalMainCount =
    activeTomorrowDecisions.filter((decision) => decision.kind === DECISION_KIND.main).length +
    created.filter((decision) => decision.kind === DECISION_KIND.main).length;

  if (totalMainCount === 0) {
    throw new DomainError(
      'day.tomorrow_main_decision_required',
      'Подготовьте хотя бы одно главное решение на завтра.',
    );
  }

  return Object.freeze(created);
}

function isUnfinishedLifeAction(lifeAction: LifeAction): boolean {
  return (
    lifeAction.status === LIFE_ACTION_STATUS.ready ||
    lifeAction.status === LIFE_ACTION_STATUS.inProgress
  );
}

function cloneDay(day: Day): Day {
  return Day.rehydrate({
    id: day.id,
    date: day.date,
    status: day.status,
    createdAt: day.createdAt,
    plannedAt: day.plannedAt,
    openedAt: day.openedAt,
    firstActivityAt: day.firstActivityAt,
    completedAt: day.completedAt,
    summary: day.summary,
    sphereId: day.sphereId,
    version: day.version,
  });
}

function cloneLifeAction(lifeAction: LifeAction): LifeAction {
  return LifeAction.rehydrate({
    id: lifeAction.id,
    title: lifeAction.title,
    description: lifeAction.description,
    expectedResult: lifeAction.expectedResult,
    actualResult: lifeAction.actualResult,
    status: lifeAction.status,
    decisionId: lifeAction.decisionId,
    sphereId: lifeAction.sphereId,
    plannedDate: lifeAction.plannedDate,
    createdAt: lifeAction.createdAt,
    readyAt: lifeAction.readyAt,
    startedAt: lifeAction.startedAt,
    completedAt: lifeAction.completedAt,
    cancelledAt: lifeAction.cancelledAt,
    cancelReason: lifeAction.cancelReason,
    archivedAt: lifeAction.archivedAt,
    rescheduleCount: lifeAction.rescheduleCount,
    version: lifeAction.version,
  });
}
