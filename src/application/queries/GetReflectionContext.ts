import {
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_RESOLUTION,
  REFLECTION_CONTEXT_ENTITY_TYPE,
  type ActionSession,
  type Decision,
  type EntityId,
  type EveningCycle,
  type LifeAction,
  type OpenLoopResolution,
  type ReflectionContext,
  type ReflectionContextItem,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { DayRepository } from '../ports/DayRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export class GetReflectionContext {
  readonly #cycles: EveningCycleRepository;
  readonly #days: DayRepository;
  readonly #decisions: DecisionRepository;
  readonly #lifeActions: LifeActionRepository;
  readonly #sessions: ActionSessionRepository;

  public constructor(
    cycles: EveningCycleRepository,
    days: DayRepository,
    decisions: DecisionRepository,
    lifeActions: LifeActionRepository,
    sessions: ActionSessionRepository,
  ) {
    this.#cycles = cycles;
    this.#days = days;
    this.#decisions = decisions;
    this.#lifeActions = lifeActions;
    this.#sessions = sessions;
  }

  public async execute(eveningCycleId: EntityId): Promise<ReflectionContext> {
    const cycle = await this.#cycles.findById(eveningCycleId);
    if (cycle === null) {
      throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
    }
    const day = await this.#days.findByDate(cycle.dateKey);
    if (day === null || !day.id.equals(cycle.dayId)) {
      throw new DomainError(
        'reflection.day_identity_mismatch',
        'День осмысления не совпадает с днём вечернего цикла.',
      );
    }

    const [dateDecisions, dateActions] = await Promise.all([
      this.#decisions.findByDate(cycle.dateKey),
      this.#lifeActions.findByDate(cycle.dateKey),
    ]);
    const decisions = await this.loadRelevantDecisions(cycle, dateDecisions);
    const actions = await this.loadRelevantActions(cycle, dateActions);
    const sessions = await this.loadRelevantSessions(cycle, actions);
    const resolutionByKey = new Map(
      cycle.openLoopResolutions.map((resolution) => [resolution.key(), resolution]),
    );
    const decisionItems = new Map(
      decisions.map((decision) => [
        decision.id.toString(),
        decisionItem(decision, resolutionByKey),
      ]),
    );
    const actionItems = new Map(
      actions.map((action) => [action.id.toString(), actionItem(action, resolutionByKey)]),
    );
    const allItems = new Map<string, ReflectionContextItem>([
      ...[...decisionItems.values()].map((item) => [item.entityId.toString(), item] as const),
      ...[...actionItems.values()].map((item) => [item.entityId.toString(), item] as const),
    ]);
    const mainDecision = [...decisions]
      .filter((decision) => decision.kind === DECISION_KIND.main)
      .sort((left, right) => (left.order ?? 99) - (right.order ?? 99))[0];

    return Object.freeze({
      cycleId: cycle.id,
      dayId: cycle.dayId,
      dateKey: cycle.dateKey.toString(),
      mainDecision:
        mainDecision === undefined ? null : (decisionItems.get(mainDecision.id.toString()) ?? null),
      completedDecisions: freezeItems(
        decisions
          .filter((decision) => isDecisionCompleted(decision, resolutionByKey))
          .map((decision) => decisionItems.get(decision.id.toString()))
          .filter(isDefined),
      ),
      incompleteDecisions: freezeItems(
        decisions
          .filter((decision) => !isDecisionCompleted(decision, resolutionByKey))
          .map((decision) => decisionItems.get(decision.id.toString()))
          .filter(isDefined),
      ),
      completedActions: freezeItems(
        actions
          .filter((action) => isActionCompleted(action, resolutionByKey))
          .map((action) => actionItems.get(action.id.toString()))
          .filter(isDefined),
      ),
      carriedForwardItems: itemsForResolution(cycle, OPEN_LOOP_RESOLUTION.carryForward, allItems),
      revisedItems: freezeItems(
        cycle.openLoopReferences.flatMap((reference) => {
          const item = allItems.get(reference.entityId.toString());
          const currentVersion = entityVersion(reference.entityId, decisions, actions, sessions);
          return item !== undefined &&
            reference.sourceVersion !== null &&
            currentVersion !== null &&
            currentVersion > reference.sourceVersion + 1
            ? [item]
            : [];
        }),
      ),
      droppedItems: itemsForResolution(cycle, OPEN_LOOP_RESOLUTION.drop, allItems),
      actionSessions: freezeItems(
        sessions.map((session) => sessionItem(session, actions)).filter(isDefined),
      ),
      openLoopResultCount: cycle.openLoopResolutions.length,
    });
  }

  private async loadRelevantDecisions(
    cycle: EveningCycle,
    dateDecisions: readonly Decision[],
  ): Promise<readonly Decision[]> {
    const ids = cycle.openLoopReferences
      .filter((reference) => reference.entityType === OPEN_LOOP_ENTITY_TYPE.decision)
      .map((reference) => reference.entityId);
    const referenced = await Promise.all(ids.map((id) => this.#decisions.findById(id)));
    return deduplicate([...dateDecisions, ...referenced.filter(isDefined)]);
  }

  private async loadRelevantActions(
    cycle: EveningCycle,
    dateActions: readonly LifeAction[],
  ): Promise<readonly LifeAction[]> {
    const ids = cycle.openLoopReferences
      .filter((reference) => reference.entityType === OPEN_LOOP_ENTITY_TYPE.lifeAction)
      .map((reference) => reference.entityId);
    const referenced = await Promise.all(ids.map((id) => this.#lifeActions.findById(id)));
    return deduplicate([...dateActions, ...referenced.filter(isDefined)]);
  }

  private async loadRelevantSessions(
    cycle: EveningCycle,
    actions: readonly LifeAction[],
  ): Promise<readonly ActionSession[]> {
    const actionIds = new Set(actions.map((action) => action.id.toString()));
    const all =
      this.#sessions.findAll === undefined
        ? (
            await Promise.all(actions.map((action) => this.#sessions.findByLifeActionId(action.id)))
          ).flat()
        : await this.#sessions.findAll();
    const referencedSessionIds = new Set(
      cycle.openLoopReferences
        .filter((reference) => reference.entityType === OPEN_LOOP_ENTITY_TYPE.actionSession)
        .map((reference) => reference.entityId.toString()),
    );
    return deduplicate(
      all.filter(
        (session) =>
          actionIds.has(session.lifeActionId.toString()) ||
          referencedSessionIds.has(session.id.toString()),
      ),
    );
  }
}

function decisionItem(
  decision: Decision,
  resolutions: ReadonlyMap<string, OpenLoopResolution>,
): ReflectionContextItem {
  const resolution = resolutions.get(`${OPEN_LOOP_ENTITY_TYPE.decision}:${decision.id.toString()}`);
  return Object.freeze({
    entityType: REFLECTION_CONTEXT_ENTITY_TYPE.decision,
    entityId: decision.id,
    title: decision.title.toString(),
    isMainDecision: decision.kind === DECISION_KIND.main,
    repeatCount: decision.rescheduleCount,
    reasonKnown:
      resolution?.note !== null && resolution?.note !== undefined
        ? true
        : decision.cancelReason !== null || latestDecisionRescheduleReason(decision) !== null,
  });
}

function actionItem(
  action: LifeAction,
  resolutions: ReadonlyMap<string, OpenLoopResolution>,
): ReflectionContextItem {
  const resolution = resolutions.get(`${OPEN_LOOP_ENTITY_TYPE.lifeAction}:${action.id.toString()}`);
  return Object.freeze({
    entityType: REFLECTION_CONTEXT_ENTITY_TYPE.lifeAction,
    entityId: action.id,
    title: action.title.toString(),
    isMainDecision: false,
    repeatCount: action.rescheduleCount,
    reasonKnown:
      (resolution?.note !== null && resolution?.note !== undefined) || action.cancelReason !== null,
  });
}

function sessionItem(
  session: ActionSession,
  actions: readonly LifeAction[],
): ReflectionContextItem | null {
  const action = actions.find((candidate) => candidate.id.equals(session.lifeActionId));
  return Object.freeze({
    entityType: REFLECTION_CONTEXT_ENTITY_TYPE.actionSession,
    entityId: session.id,
    title: action === undefined ? 'Рабочая сессия' : `Рабочая сессия: ${action.title.toString()}`,
    isMainDecision: false,
    repeatCount: 0,
    reasonKnown: session.resultNote !== null,
  });
}

function isDecisionCompleted(
  decision: Decision,
  resolutions: ReadonlyMap<string, OpenLoopResolution>,
): boolean {
  const resolution = resolutions.get(`${OPEN_LOOP_ENTITY_TYPE.decision}:${decision.id.toString()}`);
  return (
    resolution?.resolution === OPEN_LOOP_RESOLUTION.complete ||
    decision.status === DECISION_STATUS.confirmed
  );
}

function isActionCompleted(
  action: LifeAction,
  resolutions: ReadonlyMap<string, OpenLoopResolution>,
): boolean {
  const resolution = resolutions.get(`${OPEN_LOOP_ENTITY_TYPE.lifeAction}:${action.id.toString()}`);
  return (
    resolution?.resolution === OPEN_LOOP_RESOLUTION.complete ||
    action.status === LIFE_ACTION_STATUS.completed
  );
}

function itemsForResolution(
  cycle: EveningCycle,
  resolutionKind: typeof OPEN_LOOP_RESOLUTION.carryForward | typeof OPEN_LOOP_RESOLUTION.drop,
  items: ReadonlyMap<string, ReflectionContextItem>,
): readonly ReflectionContextItem[] {
  return freezeItems(
    cycle.openLoopResolutions
      .filter((resolution) => resolution.resolution === resolutionKind)
      .map((resolution) => items.get(resolution.entityId.toString()))
      .filter(isDefined),
  );
}

function entityVersion(
  id: EntityId,
  decisions: readonly Decision[],
  actions: readonly LifeAction[],
  sessions: readonly ActionSession[],
): number | null {
  return (
    decisions.find((item) => item.id.equals(id))?.version ??
    actions.find((item) => item.id.equals(id))?.version ??
    sessions.find((item) => item.id.equals(id))?.version ??
    null
  );
}

function latestDecisionRescheduleReason(decision: Decision): string | null {
  const latest = decision.rescheduleHistory[decision.rescheduleHistory.length - 1];
  return latest?.reason.trim() || null;
}

function freezeItems(items: readonly ReflectionContextItem[]): readonly ReflectionContextItem[] {
  const unique = new Map(items.map((item) => [item.entityId.toString(), item]));
  return Object.freeze([...unique.values()]);
}

function deduplicate<T extends { readonly id: EntityId }>(items: readonly T[]): readonly T[] {
  return [...new Map(items.map((item) => [item.id.toString(), item])).values()];
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
