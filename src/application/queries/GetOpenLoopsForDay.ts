import {
  ACTION_SESSION_STATUS,
  DECISION_STATUS,
  EVENING_CYCLE_STATE,
  LIFE_ACTION_STATUS,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  OpenLoopReference,
  type ActionSession,
  type DayDate,
  type Decision,
  type EveningCycle,
  EntityId,
  type LifeAction,
  type OpenLoopEntityType,
  type OpenLoopRequirement,
  type OpenLoopResolutionKind,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { EveningCycleApplicationService } from '../evening-cycle';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DayRepository } from '../ports/DayRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface OpenLoopItem {
  readonly entityType: OpenLoopEntityType;
  readonly entityId: string;
  readonly title: string;
  readonly requirement: OpenLoopRequirement;
  readonly status: string;
  readonly resolution: Exclude<OpenLoopResolutionKind, 'REVISE'> | null;
  readonly resolvedAt: Date | null;
  readonly allowedResolutions: readonly OpenLoopResolutionKind[];
}

export interface OpenLoopsForDaySnapshot {
  readonly cycle: EveningCycle;
  readonly total: number;
  readonly resolved: number;
  readonly remaining: number;
  readonly items: readonly OpenLoopItem[];
}

export class GetOpenLoopsForDay {
  readonly #days: DayRepository;
  readonly #decisions: DecisionRepository;
  readonly #lifeActions: LifeActionRepository;
  readonly #sessions: ActionSessionRepository;
  readonly #cycles: EveningCycleApplicationService;

  public constructor(
    days: DayRepository,
    decisions: DecisionRepository,
    lifeActions: LifeActionRepository,
    sessions: ActionSessionRepository,
    cycles: EveningCycleApplicationService,
  ) {
    this.#days = days;
    this.#decisions = decisions;
    this.#lifeActions = lifeActions;
    this.#sessions = sessions;
    this.#cycles = cycles;
  }

  public async execute(dateKey: DayDate): Promise<OpenLoopsForDaySnapshot> {
    const day = await this.#days.findByDate(dateKey);
    if (day === null) throw new DomainError('day.not_found', 'День для разбора не найден.');

    let cycle = await this.#cycles.start(day.date);
    if (cycle.state === EVENING_CYCLE_STATE.windingDown) {
      cycle = await this.#cycles.beginResolving(day.date);
    }

    const candidates = await this.discover(day.date);
    if (cycle.state === EVENING_CYCLE_STATE.resolving && cycle.openLoopReferences.length === 0) {
      cycle = await this.#cycles.initializeOpenLoops(
        day.date,
        candidates.map((item) =>
          OpenLoopReference.create({
            entityType: item.entityType,
            entityId: item.entity.id,
            requirement: item.requirement,
            sourceVersion: item.entity.version,
          }),
        ),
      );
    }

    if (cycle.state === EVENING_CYCLE_STATE.resolving) {
      cycle = await this.reconcileResolvedEntities(cycle, candidates, day.date);
    }

    const items = await this.materialize(cycle, candidates);
    const progress = cycle.openLoopProgress;
    if (cycle.state === EVENING_CYCLE_STATE.resolving && progress.remaining === 0) {
      cycle = await this.#cycles.completeResolving(day.date);
    }
    return Object.freeze({
      cycle,
      ...cycle.openLoopProgress,
      items: Object.freeze(items),
    });
  }

  public async preview(dateKey: DayDate, cycle: EveningCycle): Promise<OpenLoopsForDaySnapshot> {
    const day = await this.#days.findByDate(dateKey);
    if (day === null) throw new DomainError('day.not_found', 'День для разбора не найден.');

    const candidates = await this.discover(day.date);
    const items = candidates.map(candidateToItem);
    const total = candidates.filter(
      (candidate) => candidate.requirement === OPEN_LOOP_REQUIREMENT.requiresResolution,
    ).length;
    return Object.freeze({
      cycle,
      total,
      resolved: 0,
      remaining: total,
      items: Object.freeze(items),
    });
  }

  private async reconcileResolvedEntities(
    initialCycle: EveningCycle,
    discovered: readonly Candidate[],
    ownerDate: DayDate,
  ): Promise<EveningCycle> {
    let cycle = initialCycle;
    const byKey = new Map(discovered.map((item) => [candidateKey(item), item]));
    for (const reference of cycle.openLoopReferences) {
      if (reference.requirement !== OPEN_LOOP_REQUIREMENT.requiresResolution) continue;
      if (cycle.openLoopResolutions.some((item) => item.key() === reference.key())) continue;
      const key = reference.key();
      const candidate =
        byKey.get(key) ??
        (await this.loadReferenced(reference.entityType, reference.entityId.toString()));
      const inferred = candidate === null ? null : inferResolution(candidate, ownerDate);
      if (inferred !== null) {
        cycle = await this.#cycles.recordOpenLoopResolution(
          ownerDate,
          reference.entityType,
          reference.entityId,
          inferred,
          candidate === null ? null : inferredNote(candidate),
        );
      }
    }
    return cycle;
  }

  private async discover(date: DayDate): Promise<readonly Candidate[]> {
    const [decisions, actions, sessions] = await Promise.all([
      this.#decisions.findByDate(date),
      this.#lifeActions.findByDate(date),
      this.#sessions.findAll?.() ??
        this.#sessions.findUnfinished().then((item) => (item === null ? [] : [item])),
    ]);
    const visibleDecisions = decisions.filter((item) => !item.isDeleted() && !item.isArchived());
    const visibleActions = actions.filter((item) => !item.isArchived());
    const actionIds = new Set(visibleActions.map((item) => item.id.toString()));
    const relatedSessions = sessions.filter((item) => actionIds.has(item.lifeActionId.toString()));
    return [
      ...visibleDecisions.map((entity) => decisionCandidate(entity)),
      ...visibleActions.map((entity) => actionCandidate(entity)),
      ...relatedSessions.map((entity) => sessionCandidate(entity)),
    ];
  }

  private async materialize(
    cycle: EveningCycle,
    discovered: readonly Candidate[],
  ): Promise<readonly OpenLoopItem[]> {
    const discoveredByKey = new Map(discovered.map((item) => [candidateKey(item), item]));
    return Promise.all(
      cycle.openLoopReferences.map(async (reference) => {
        const key = `${reference.entityType}:${reference.entityId.toString()}`;
        const candidate =
          discoveredByKey.get(key) ??
          (await this.loadReferenced(reference.entityType, reference.entityId.toString()));
        const resolution = cycle.openLoopResolutions.find((item) => item.key() === reference.key());
        return Object.freeze({
          entityType: reference.entityType,
          entityId: reference.entityId.toString(),
          title: candidate?.title ?? 'Недоступный элемент',
          requirement: reference.requirement,
          status: candidate?.status ?? 'missing',
          resolution: resolution?.resolution ?? null,
          resolvedAt: resolution?.resolvedAt ?? null,
          allowedResolutions: allowedResolutions(reference.entityType),
        });
      }),
    );
  }

  private async loadReferenced(
    entityType: OpenLoopEntityType,
    entityId: string,
  ): Promise<Candidate | null> {
    const id = EntityId.create(entityId);
    if (entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
      const entity = await this.#decisions.findById(id);
      return entity === null ? null : decisionCandidate(entity);
    }
    if (entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction) {
      const entity = await this.#lifeActions.findById(id);
      return entity === null ? null : actionCandidate(entity);
    }
    const entity = await this.#sessions.findById(id);
    return entity === null ? null : sessionCandidate(entity);
  }
}

type CandidateEntity = Decision | LifeAction | ActionSession;

interface Candidate {
  readonly entityType: OpenLoopEntityType;
  readonly entity: CandidateEntity;
  readonly title: string;
  readonly status: string;
  readonly requirement: OpenLoopRequirement;
}

function decisionCandidate(entity: Decision): Candidate {
  const required =
    entity.status === DECISION_STATUS.planned || entity.status === DECISION_STATUS.inProgress;
  return {
    entityType: OPEN_LOOP_ENTITY_TYPE.decision,
    entity,
    title: entity.title.toString(),
    status: entity.status,
    requirement: required
      ? OPEN_LOOP_REQUIREMENT.requiresResolution
      : OPEN_LOOP_REQUIREMENT.informational,
  };
}

function actionCandidate(entity: LifeAction): Candidate {
  const required =
    entity.status === LIFE_ACTION_STATUS.ready || entity.status === LIFE_ACTION_STATUS.inProgress;
  return {
    entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
    entity,
    title: entity.title.toString(),
    status: entity.status,
    requirement: required
      ? OPEN_LOOP_REQUIREMENT.requiresResolution
      : OPEN_LOOP_REQUIREMENT.informational,
  };
}

function sessionCandidate(entity: ActionSession): Candidate {
  const required = entity.status !== ACTION_SESSION_STATUS.completed;
  return {
    entityType: OPEN_LOOP_ENTITY_TYPE.actionSession,
    entity,
    title: 'Рабочая сессия',
    status: entity.status,
    requirement: required
      ? OPEN_LOOP_REQUIREMENT.requiresResolution
      : OPEN_LOOP_REQUIREMENT.informational,
  };
}

function candidateKey(item: Candidate): string {
  return `${item.entityType}:${item.entity.id.toString()}`;
}

function candidateToItem(candidate: Candidate): OpenLoopItem {
  return Object.freeze({
    entityType: candidate.entityType,
    entityId: candidate.entity.id.toString(),
    title: candidate.title,
    requirement: candidate.requirement,
    status: candidate.status,
    resolution: null,
    resolvedAt: null,
    allowedResolutions: allowedResolutions(candidate.entityType),
  });
}

function allowedResolutions(entityType: OpenLoopEntityType): readonly OpenLoopResolutionKind[] {
  if (entityType === OPEN_LOOP_ENTITY_TYPE.actionSession) {
    return Object.freeze([
      OPEN_LOOP_RESOLUTION.complete,
      OPEN_LOOP_RESOLUTION.carryForward,
      OPEN_LOOP_RESOLUTION.revise,
      OPEN_LOOP_RESOLUTION.drop,
    ]);
  }
  return Object.freeze(Object.values(OPEN_LOOP_RESOLUTION));
}

function inferResolution(
  candidate: Candidate,
  ownerDate: DayDate,
): Exclude<OpenLoopResolutionKind, 'REVISE'> | null {
  if (candidate.entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
    const decision = candidate.entity as Decision;
    if (decision.status === DECISION_STATUS.confirmed) return OPEN_LOOP_RESOLUTION.complete;
    if (
      decision.status === DECISION_STATUS.cancelled ||
      decision.isArchived() ||
      decision.isDeleted()
    ) {
      return OPEN_LOOP_RESOLUTION.drop;
    }
    if (decision.plannedDate !== null && !decision.plannedDate.equals(ownerDate)) {
      return OPEN_LOOP_RESOLUTION.carryForward;
    }
    return null;
  }
  if (candidate.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction) {
    const action = candidate.entity as LifeAction;
    if (action.status === LIFE_ACTION_STATUS.completed) return OPEN_LOOP_RESOLUTION.complete;
    if (action.status === LIFE_ACTION_STATUS.cancelled || action.isArchived()) {
      return OPEN_LOOP_RESOLUTION.drop;
    }
    if (action.plannedDate !== null && !action.plannedDate.equals(ownerDate)) {
      return OPEN_LOOP_RESOLUTION.carryForward;
    }
    return null;
  }
  const session = candidate.entity as ActionSession;
  if (session.status !== ACTION_SESSION_STATUS.completed) return null;
  return session.completionKind === 'completed'
    ? OPEN_LOOP_RESOLUTION.complete
    : OPEN_LOOP_RESOLUTION.drop;
}

function inferredNote(candidate: Candidate): string | null {
  if (candidate.entityType === OPEN_LOOP_ENTITY_TYPE.decision) {
    const decision = candidate.entity as Decision;
    if (decision.status === DECISION_STATUS.cancelled) {
      return decision.cancelReason?.toString() ?? null;
    }
    const latest = decision.rescheduleHistory[decision.rescheduleHistory.length - 1];
    return latest?.reason.trim() || null;
  }
  if (candidate.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction) {
    return (candidate.entity as LifeAction).cancelReason?.toString() ?? null;
  }
  return (candidate.entity as ActionSession).resultNote?.toString() ?? null;
}
