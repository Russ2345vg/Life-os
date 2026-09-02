import {
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  ROUTINE_BLOCK_ASSIGNMENT,
  type DayDate,
  type Decision,
  type EffectiveRoutineOccurrence,
  type EntityId,
  type LifeAction,
  type TomorrowPlan,
} from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import type { GetRoutineBlocksForDate } from './GetRoutineBlocksForDate';

export interface MorningMainActionCandidate {
  readonly id: EntityId;
  readonly title: string;
  readonly expectedResult: string | null;
}

export interface MorningMainActionOverview {
  readonly decisionId: EntityId | null;
  readonly decisionTitle: string | null;
  readonly expectedResult: string | null;
  readonly firstStepId: EntityId | null;
  readonly firstStepTitle: string | null;
  readonly scheduledTime: string | null;
  readonly completed: boolean;
  readonly ready: boolean;
  readonly candidates: readonly MorningMainActionCandidate[];
}

export interface MorningMainActionOverviewSource {
  readonly plan: TomorrowPlan | null;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly occurrences: readonly EffectiveRoutineOccurrence[];
}

export class GetMorningMainActionOverview {
  public constructor(
    private readonly plans: TomorrowPlanRepository,
    private readonly decisions: DecisionRepository,
    private readonly lifeActions: LifeActionRepository,
    private readonly routineBlocks: Pick<GetRoutineBlocksForDate, 'execute'>,
  ) {}

  public async execute(date: DayDate): Promise<MorningMainActionOverview> {
    const [plan, decisions, lifeActions, occurrences] = await Promise.all([
      this.plans.findByTargetDate(date),
      this.decisions.findByDate(date),
      this.lifeActions.findByDate(date),
      this.routineBlocks.execute(date),
    ]);
    return resolveMorningMainActionOverview({ plan, decisions, lifeActions, occurrences });
  }
}

export function resolveMorningMainActionOverview(
  source: MorningMainActionOverviewSource,
): MorningMainActionOverview {
  const primaryDecision =
    source.plan?.primaryDecisionId === null || source.plan === null
      ? null
      : (source.decisions.find((decision) => decision.id.equals(source.plan!.primaryDecisionId!)) ??
        null);
  const firstStep = selectMorningFirstStep(source.plan, source.decisions, source.lifeActions);
  const scheduled =
    firstStep === null ? null : findMorningMainActionOccurrence(firstStep, source.occurrences);
  const completed = firstStep?.status === LIFE_ACTION_STATUS.completed;
  const expectedResult = source.plan?.minimumOutcome ?? null;
  const candidates =
    source.plan?.primaryDecisionId === null || source.plan === null || firstStep !== null
      ? []
      : source.lifeActions
          .filter(
            (action) =>
              isSelectableCandidate(action) &&
              action.decisionId?.equals(source.plan!.primaryDecisionId!) === true &&
              action.plannedDate?.equals(source.plan!.targetDateKey) === true,
          )
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((action) =>
            Object.freeze({
              id: action.id,
              title: action.title.toString(),
              expectedResult: action.expectedResult?.toString() ?? null,
            }),
          );

  return Object.freeze({
    decisionId: primaryDecision?.id ?? null,
    decisionTitle: primaryDecision?.title.toString() ?? null,
    expectedResult,
    firstStepId: firstStep?.id ?? null,
    firstStepTitle: firstStep?.title.toString() ?? null,
    scheduledTime:
      scheduled === null ? null : `${scheduled.effectiveStartTime}–${scheduled.effectiveEndTime}`,
    completed,
    ready:
      primaryDecision !== null &&
      expectedResult !== null &&
      firstStep !== null &&
      (completed || scheduled !== null),
    candidates: Object.freeze(candidates),
  });
}

export function selectMorningFirstStep(
  plan: TomorrowPlan | null,
  decisions: readonly Decision[],
  actions: readonly LifeAction[],
): LifeAction | null {
  const eligible = actions.filter(isEligibleFirstStep);
  if (plan !== null) {
    if (plan.firstActionId === null) return null;
    return eligible.find((action) => action.id.equals(plan.firstActionId!)) ?? null;
  }
  const firstMainDecision = [...decisions]
    .filter(
      (decision) =>
        decision.kind === DECISION_KIND.main &&
        !decision.isArchived() &&
        !decision.isDeleted() &&
        decision.status !== DECISION_STATUS.cancelled,
    )
    .sort(
      (left, right) =>
        (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )[0];
  if (firstMainDecision === undefined) return null;
  return (
    eligible
      .filter((action) => action.decisionId?.equals(firstMainDecision.id) === true)
      .sort(compareFirstSteps)[0] ?? null
  );
}

export function findMorningMainActionOccurrence(
  action: LifeAction,
  occurrences: readonly EffectiveRoutineOccurrence[],
): EffectiveRoutineOccurrence | null {
  return (
    [...occurrences]
      .filter(
        (occurrence) =>
          !occurrence.isSkipped &&
          occurrence.effectiveAssignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction &&
          occurrence.effectiveAssignment.actionId.equals(action.id),
      )
      .sort((left, right) => left.effectiveStartTime.localeCompare(right.effectiveStartTime))[0] ??
    null
  );
}

function isEligibleFirstStep(action: LifeAction): boolean {
  return (
    !action.isArchived() &&
    (action.status === LIFE_ACTION_STATUS.inProgress ||
      action.status === LIFE_ACTION_STATUS.ready ||
      action.status === LIFE_ACTION_STATUS.completed)
  );
}

function isSelectableCandidate(action: LifeAction): boolean {
  return (
    !action.isArchived() &&
    (action.status === LIFE_ACTION_STATUS.inProgress || action.status === LIFE_ACTION_STATUS.ready)
  );
}

function compareFirstSteps(left: LifeAction, right: LifeAction): number {
  return (
    firstStepRank(left) - firstStepRank(right) ||
    left.createdAt.getTime() - right.createdAt.getTime()
  );
}

function firstStepRank(action: LifeAction): number {
  if (action.status === LIFE_ACTION_STATUS.inProgress) return 0;
  if (action.status === LIFE_ACTION_STATUS.ready) return 1;
  return 2;
}
