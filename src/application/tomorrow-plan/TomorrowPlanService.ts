import {
  ActionExpectedResult,
  DECISION_KIND,
  DECISION_STATUS,
  Day,
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  EVENING_CYCLE_STATE,
  EVENING_CYCLE_MODE,
  ExpectedResult,
  LifeAction,
  LifeActionTitle,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_RESOLUTION,
  REFLECTION_SIGNAL_TYPE,
  TomorrowPlan,
  type EveningCycle,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import type { TomorrowPlanUnitOfWork } from '../ports/TomorrowPlanUnitOfWork';
import type { RecommendationApplicationCommit } from '../ports/TomorrowPlanUnitOfWork';
import { cloneEveningCycle } from '../evening-cycle';
import { createDecisionJournalEntries } from '../journal/createJournalEntries';

export interface TomorrowPlanSnapshot {
  readonly plan: TomorrowPlan;
  readonly primaryDecision: Decision | null;
  readonly firstAction: LifeAction | null;
  readonly supportingDecisions: readonly Decision[];
  readonly carriedDecisionCandidate: Decision | null;
  readonly scopeTooLargeWarning: boolean;
  readonly targetDecisionCount: number;
  readonly targetLifeActionCount: number;
  readonly targetDecisions: readonly Decision[];
  readonly targetLifeActions: readonly LifeAction[];
  readonly overloaded: boolean;
}

export interface NewTomorrowDecisionInput {
  readonly title: string;
  readonly expectedResult: string;
  readonly projectId?: EntityId | null;
  readonly sphereId?: EntityId | null;
}

export interface NewTomorrowFirstActionInput {
  readonly title: string;
  readonly expectedResult: string;
  readonly description?: string;
}

export interface NewSupportingDecisionInput {
  readonly title: string;
  readonly expectedResult?: string;
}

export class TomorrowPlanService {
  public constructor(
    private readonly cycles: EveningCycleRepository,
    private readonly plans: TomorrowPlanRepository,
    private readonly days: DayRepository,
    private readonly decisions: DecisionRepository,
    private readonly lifeActions: LifeActionRepository,
    private readonly currentDate: CurrentDateProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly unitOfWork: TomorrowPlanUnitOfWork,
  ) {}

  public async getByTargetDate(date: DayDate): Promise<TomorrowPlanSnapshot | null> {
    const plan = await this.plans.findByTargetDate(date);
    return plan === null ? null : this.snapshot(plan);
  }

  public async getExistingForCycleDate(date: DayDate): Promise<TomorrowPlanSnapshot | null> {
    const cycle = await this.cycles.findByDateKey(date);
    if (cycle === null) return null;
    const plan = await this.plans.findByCycleId(cycle.id);
    return plan === null ? null : this.snapshot(requireOwnedPlan(plan, cycle));
  }

  public async getOrCreate(cycleDate: DayDate): Promise<TomorrowPlanSnapshot> {
    const cycle = await this.requireEditableCycle(cycleDate);
    const existing = await this.plans.findByCycleId(cycle.id);
    if (existing !== null) return this.snapshot(requireOwnedPlan(existing, cycle));

    const targetDate = targetDateFor(cycle, this.currentDate.getCurrentDate());
    const byTarget = await this.plans.findByTargetDate(targetDate);
    if (byTarget !== null) {
      if (byTarget.cycleId.equals(cycle.id) && byTarget.sourceDayId.equals(cycle.dayId)) {
        return this.snapshot(byTarget);
      }
      throw targetDateConflict();
    }

    const storedTargetDay = await this.days.findByDate(targetDate);
    const now = this.clock.now();
    const targetDay =
      storedTargetDay ??
      createTargetDay(targetDate, this.currentDate.getCurrentDate(), now, this.ids);
    const carriedPrimaryDecisionId = await this.findCarriedDecisionId(cycle, targetDate);
    const plan = TomorrowPlan.create({
      id: this.ids.generate(),
      cycleId: cycle.id,
      sourceDayId: cycle.dayId,
      targetDayId: targetDay.id,
      targetDateKey: targetDate,
      createdAt: now,
      carriedPrimaryDecisionId,
    });
    try {
      await this.unitOfWork.commit({
        plan,
        expectedPlanVersion: null,
        ...(storedTargetDay === null ? { targetDay } : {}),
      });
      return this.snapshot(plan);
    } catch (error: unknown) {
      if (!(error instanceof DomainError) || error.code !== 'tomorrow_plan.concurrent_change')
        throw error;
      const recovered =
        (await this.plans.findByCycleId(cycle.id)) ??
        (await this.plans.findByTargetDate(targetDate));
      if (recovered === null) throw error;
      if (!recovered.cycleId.equals(cycle.id) || !recovered.sourceDayId.equals(cycle.dayId)) {
        throw targetDateConflict();
      }
      return this.snapshot(recovered);
    }
  }

  public async setDirection(
    cycleDate: DayDate,
    directionId: EntityId | null,
  ): Promise<TomorrowPlanSnapshot> {
    return this.mutate(cycleDate, (plan, now) => plan.setDirection(directionId, now));
  }

  public async setVector(cycleDate: DayDate, vector: string | null): Promise<TomorrowPlanSnapshot> {
    return this.mutate(cycleDate, (plan, now) => plan.setVector(vector, now));
  }

  public async assignPrimaryDecision(
    cycleDate: DayDate,
    decisionId: EntityId,
  ): Promise<TomorrowPlanSnapshot> {
    const plan = await this.requirePlan(cycleDate);
    const decision = await this.requireTargetDecision(plan, decisionId);
    if (decision.kind !== DECISION_KIND.main) {
      throw new DomainError(
        'tomorrow_plan.primary_must_be_main',
        'Главным можно назначить только главное Решение.',
      );
    }
    return this.mutate(cycleDate, (current, now) => current.assignPrimaryDecision(decisionId, now));
  }

  public async createPrimaryDecision(
    cycleDate: DayDate,
    input: NewTomorrowDecisionInput,
  ): Promise<TomorrowPlanSnapshot> {
    const plan = await this.requirePlan(cycleDate);
    const existing = await this.decisions.findByDate(plan.targetDateKey);
    const activeMain = existing.filter(isActiveMainDecision);
    if (activeMain.length >= 3) {
      throw new DomainError(
        'decision.main_limit_reached',
        'На целевой день уже назначено три главных Решения.',
      );
    }
    const now = this.clock.now();
    const expected = ExpectedResult.create(input.expectedResult);
    const decision = Decision.createDraft({
      id: this.ids.generate(),
      title: DecisionTitle.create(input.title),
      kind: DECISION_KIND.main,
      expectedResult: expected,
      projectId: input.projectId ?? null,
      sphereId: input.sphereId ?? null,
      occurredAt: now,
      eventId: this.ids.generate(),
    });
    decision.plan({
      plannedDate: plan.targetDateKey,
      kind: DECISION_KIND.main,
      order: firstAvailableOrder(activeMain),
      expectedResult: expected,
      occurredAt: now,
      eventId: this.ids.generate(),
    });
    const changed = cloneTomorrowPlan(plan);
    const expectedPlanVersion = changed.version;
    changed.assignPrimaryDecision(decision.id, now);
    await this.unitOfWork.commit({
      plan: changed,
      expectedPlanVersion,
      newDecision: decision,
      journalEntries: createDecisionJournalEntries(decision),
    });
    return this.snapshot(changed);
  }

  public async setOutcomes(
    cycleDate: DayDate,
    minimumOutcome: string,
    targetOutcome?: string | null,
    stretchOutcome?: string | null,
    recommendationApplication?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    return this.mutate(
      cycleDate,
      (plan, now) => plan.setOutcomes(minimumOutcome, targetOutcome, stretchOutcome, now),
      recommendationApplication,
    );
  }

  public async setFirstAttentionItem(
    cycleDate: DayDate,
    value: string | null,
  ): Promise<TomorrowPlanSnapshot> {
    return this.mutate(cycleDate, (plan, now) => plan.setFirstAttentionItem(value, now));
  }

  public async assignFirstAction(
    cycleDate: DayDate,
    actionId: EntityId,
    recommendationApplication?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    const plan = await this.requirePlan(cycleDate);
    const action = await this.lifeActions.findById(actionId);
    if (
      action === null ||
      action.decisionId === null ||
      plan.primaryDecisionId === null ||
      !action.decisionId.equals(plan.primaryDecisionId) ||
      action.plannedDate?.equals(plan.targetDateKey) !== true
    ) {
      throw new DomainError(
        'tomorrow_plan.first_action_mismatch',
        'Первый шаг должен относиться к главному Решению и целевому дню.',
      );
    }
    return this.mutate(
      cycleDate,
      (current, now) => current.assignFirstAction(actionId, now),
      recommendationApplication,
    );
  }

  public async createFirstAction(
    cycleDate: DayDate,
    input: NewTomorrowFirstActionInput,
    recommendationApplication?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    const plan = await this.requirePlan(cycleDate);
    if (plan.primaryDecisionId === null) {
      throw new DomainError('tomorrow_plan.primary_required', 'Сначала выберите главное Решение.');
    }
    const primary = await this.requireTargetDecision(plan, plan.primaryDecisionId);
    const now = this.clock.now();
    const action = LifeAction.createDraft({
      id: this.ids.generate(),
      title: LifeActionTitle.create(input.title),
      ...(input.description === undefined ? {} : { description: input.description }),
      decisionId: primary.id,
      sphereId: primary.sphereId,
      createdAt: now,
      eventId: this.ids.generate(),
    });
    action.makeReady({
      expectedResult: ActionExpectedResult.create(input.expectedResult),
      plannedDate: plan.targetDateKey,
      occurredAt: now,
      eventId: this.ids.generate(),
    });
    const changed = cloneTomorrowPlan(plan);
    const expectedPlanVersion = changed.version;
    changed.assignFirstAction(action.id, now);
    await this.unitOfWork.commit({
      plan: changed,
      expectedPlanVersion,
      newLifeAction: action,
      ...(recommendationApplication === undefined ? {} : { recommendationApplication }),
    });
    return this.snapshot(changed);
  }

  public async setSupportingDecisions(
    cycleDate: DayDate,
    decisionIds: readonly EntityId[],
    recommendationApplication?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    const plan = await this.requirePlan(cycleDate);
    await Promise.all(decisionIds.map((id) => this.requireTargetDecision(plan, id)));
    return this.mutate(
      cycleDate,
      (current, now) => current.setSupportingDecisions(decisionIds, now),
      recommendationApplication,
    );
  }

  public async createSupportingDecision(
    cycleDate: DayDate,
    input: NewSupportingDecisionInput,
  ): Promise<TomorrowPlanSnapshot> {
    const plan = await this.requirePlan(cycleDate);
    if (plan.supportingDecisionIds.length >= 2) {
      throw new DomainError(
        'tomorrow_plan.supporting_limit',
        'Можно выбрать не более двух дополнительных Решений.',
      );
    }
    const now = this.clock.now();
    const expected = optionalExpectedResult(input.expectedResult);
    const decision = Decision.createDraft({
      id: this.ids.generate(),
      title: DecisionTitle.create(input.title),
      kind: DECISION_KIND.additional,
      ...(expected === undefined ? {} : { expectedResult: expected }),
      occurredAt: now,
      eventId: this.ids.generate(),
    });
    decision.plan({
      plannedDate: plan.targetDateKey,
      kind: DECISION_KIND.additional,
      ...(expected === undefined ? {} : { expectedResult: expected }),
      occurredAt: now,
      eventId: this.ids.generate(),
    });
    const changed = cloneTomorrowPlan(plan);
    const expectedPlanVersion = changed.version;
    changed.setSupportingDecisions([...changed.supportingDecisionIds, decision.id], now);
    await this.unitOfWork.commit({
      plan: changed,
      expectedPlanVersion,
      newDecision: decision,
      journalEntries: createDecisionJournalEntries(decision),
    });
    return this.snapshot(changed);
  }

  public async complete(
    cycleDate: DayDate,
    continueIfOverloaded = false,
  ): Promise<TomorrowPlanSnapshot> {
    const snapshot = await this.snapshot(await this.requirePlan(cycleDate));
    const editableCycle = await this.requireEditableCycle(cycleDate);
    const emergency = editableCycle.mode === EVENING_CYCLE_MODE.emergency;
    if (!emergency && snapshot.overloaded && !continueIfOverloaded) {
      throw new DomainError(
        'tomorrow_plan.overloaded_confirmation_required',
        'День выглядит перегруженным. Пересмотрите план или явно продолжите.',
      );
    }
    if (editableCycle.state === EVENING_CYCLE_STATE.preparing) {
      return snapshot;
    }
    if (editableCycle.state === EVENING_CYCLE_STATE.completed) {
      return this.mutate(cycleDate, (plan, now) =>
        emergency ? plan.completeMinimal(now) : plan.complete(now),
      );
    }
    const cycle = cloneEveningCycle(editableCycle);
    const expectedEveningCycleVersion = cycle.version;
    const plan = cloneTomorrowPlan(snapshot.plan);
    const expectedPlanVersion = plan.version;
    const now = this.clock.now();
    if (emergency) plan.completeMinimal(now);
    else plan.complete(now);
    cycle.completeTomorrowPlanning(now);
    if (emergency) cycle.skipPreparation(now);
    await this.unitOfWork.commit({
      plan,
      expectedPlanVersion,
      eveningCycle: cycle,
      expectedEveningCycleVersion,
    });
    return this.snapshot(plan);
  }

  private async mutate(
    cycleDate: DayDate,
    mutation: (plan: TomorrowPlan, now: Date) => boolean,
    recommendationApplication?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.requirePlan(cycleDate);
      const plan = cloneTomorrowPlan(stored);
      const expectedVersion = plan.version;
      const changed = mutation(plan, this.clock.now());
      if (!changed && recommendationApplication === undefined) return this.snapshot(plan);
      if (recommendationApplication !== undefined) {
        await this.unitOfWork.commit({
          plan,
          expectedPlanVersion: expectedVersion,
          recommendationApplication,
        });
        return this.snapshot(plan);
      }
      if (await this.plans.saveIfVersionMatches(plan, expectedVersion)) return this.snapshot(plan);
    }
    throw new DomainError(
      'tomorrow_plan.concurrent_change',
      'План завтра изменился в другом окне. Повторите операцию.',
    );
  }

  private async requirePlan(cycleDate: DayDate): Promise<TomorrowPlan> {
    const cycle = await this.requireEditableCycle(cycleDate);
    const stored = await this.plans.findByCycleId(cycle.id);
    return stored === null
      ? (await this.getOrCreate(cycleDate)).plan
      : requireOwnedPlan(stored, cycle);
  }

  private async requireEditableCycle(date: DayDate): Promise<EveningCycle> {
    const cycle = await this.cycles.findByDateKey(date);
    if (cycle === null)
      throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
    if (
      cycle.state !== EVENING_CYCLE_STATE.planningTomorrow &&
      cycle.state !== EVENING_CYCLE_STATE.preparing &&
      cycle.state !== EVENING_CYCLE_STATE.completed
    ) {
      throw new DomainError(
        'tomorrow_plan.wrong_cycle_state',
        'План завтра доступен во время планирования и после завершения вечернего цикла.',
      );
    }
    return cycle;
  }

  private async requireTargetDecision(plan: TomorrowPlan, id: EntityId): Promise<Decision> {
    const decision = await this.decisions.findById(id);
    if (
      decision === null ||
      decision.isArchived() ||
      decision.isDeleted() ||
      decision.status === DECISION_STATUS.cancelled ||
      decision.plannedDate?.equals(plan.targetDateKey) !== true
    ) {
      throw new DomainError(
        'tomorrow_plan.decision_unavailable',
        'Решение недоступно для целевого дня.',
      );
    }
    return decision;
  }

  private async findCarriedDecisionId(
    cycle: EveningCycle,
    targetDate: DayDate,
  ): Promise<EntityId | null> {
    const carried = [...cycle.openLoopResolutions]
      .reverse()
      .find(
        (item) =>
          item.entityType === OPEN_LOOP_ENTITY_TYPE.decision &&
          item.resolution === OPEN_LOOP_RESOLUTION.carryForward,
      );
    if (carried === undefined) return null;
    const decision = await this.decisions.findById(carried.entityId);
    return decision !== null &&
      decision.kind === DECISION_KIND.main &&
      decision.plannedDate?.equals(targetDate) === true
      ? decision.id
      : null;
  }

  private async snapshot(plan: TomorrowPlan): Promise<TomorrowPlanSnapshot> {
    const [primaryDecision, firstAction, supporting, targetDecisions, targetActions, cycle] =
      await Promise.all([
        plan.primaryDecisionId === null ? null : this.decisions.findById(plan.primaryDecisionId),
        plan.firstActionId === null ? null : this.lifeActions.findById(plan.firstActionId),
        Promise.all(plan.supportingDecisionIds.map((id) => this.decisions.findById(id))),
        this.decisions.findByDate(plan.targetDateKey),
        this.lifeActions.findByDate(plan.targetDateKey),
        this.cycles.findById(plan.cycleId),
      ]);
    const carriedId =
      cycle === null ? null : await this.findCarriedDecisionId(cycle, plan.targetDateKey);
    const carriedDecisionCandidate =
      carriedId === null ? null : await this.decisions.findById(carriedId);
    const activeDecisions = targetDecisions.filter(
      (decision) =>
        !decision.isArchived() &&
        !decision.isDeleted() &&
        decision.status !== DECISION_STATUS.cancelled,
    );
    const activeActions = targetActions.filter(
      (action) => action.status !== 'cancelled' && !action.isArchived(),
    );
    return Object.freeze({
      plan,
      primaryDecision,
      firstAction,
      supportingDecisions: Object.freeze(
        supporting.flatMap((item) => (item === null ? [] : [item])),
      ),
      carriedDecisionCandidate,
      scopeTooLargeWarning:
        cycle?.reflectionSignals.some(
          (signal) => signal.type === REFLECTION_SIGNAL_TYPE.scopeTooLarge,
        ) ?? false,
      targetDecisionCount: activeDecisions.length,
      targetLifeActionCount: activeActions.length,
      targetDecisions: Object.freeze(activeDecisions),
      targetLifeActions: Object.freeze(activeActions),
      overloaded: activeDecisions.length >= 7 || activeActions.length >= 14,
    });
  }
}

export function cloneTomorrowPlan(plan: TomorrowPlan): TomorrowPlan {
  return TomorrowPlan.rehydrate({
    id: plan.id,
    cycleId: plan.cycleId,
    sourceDayId: plan.sourceDayId,
    targetDayId: plan.targetDayId,
    targetDateKey: plan.targetDateKey,
    directionId: plan.directionId,
    vector: plan.vector,
    primaryDecisionId: plan.primaryDecisionId,
    minimumOutcome: plan.minimumOutcome,
    targetOutcome: plan.targetOutcome,
    stretchOutcome: plan.stretchOutcome,
    firstActionId: plan.firstActionId,
    firstAttentionItem: plan.firstAttentionItem,
    planningQuality: plan.planningQuality,
    supportingDecisionIds: plan.supportingDecisionIds,
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    completedAt: plan.completedAt,
    version: plan.version,
  });
}

function createTargetDay(date: DayDate, currentDate: DayDate, now: Date, ids: IdGenerator): Day {
  return date.equals(currentDate)
    ? Day.createCurrentPlanned({
        id: ids.generate(),
        currentDate: date,
        occurredAt: now,
        createdEventId: ids.generate(),
      })
    : Day.plan({
        id: ids.generate(),
        date,
        currentDate,
        occurredAt: now,
        createdEventId: ids.generate(),
      });
}

function targetDateFor(cycle: EveningCycle, currentDate: DayDate): DayDate {
  if (cycle.dateKey.isBefore(currentDate)) return currentDate;
  const [year, month, day] = cycle.dateKey.toString().split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return DayDate.fromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function targetDateConflict(): DomainError {
  return new DomainError(
    'tomorrow_plan.target_date_conflict',
    'План на целевую дату уже связан с другим вечерним циклом.',
  );
}

function requireOwnedPlan(plan: TomorrowPlan, cycle: EveningCycle): TomorrowPlan {
  if (plan.cycleId.equals(cycle.id) && plan.sourceDayId.equals(cycle.dayId)) return plan;
  throw new DomainError(
    'tomorrow_plan.identity_conflict',
    'План завтра связан с другим жизненным днём.',
  );
}

function isActiveMainDecision(decision: Decision): boolean {
  return (
    decision.kind === DECISION_KIND.main &&
    !decision.isArchived() &&
    !decision.isDeleted() &&
    decision.status !== DECISION_STATUS.cancelled
  );
}

function optionalExpectedResult(value: string | undefined): ExpectedResult | undefined {
  return value === undefined || value.trim().length === 0
    ? undefined
    : ExpectedResult.create(value);
}

function firstAvailableOrder(decisions: readonly Decision[]): number {
  const occupied = new Set(
    decisions.map((decision) => decision.order).filter((order): order is number => order !== null),
  );
  return [1, 2, 3].find((order) => !occupied.has(order)) ?? 1;
}
