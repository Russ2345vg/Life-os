import {
  DECISION_KIND,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  MORNING_PHYSICAL_STATUS,
  ROUTINE_BLOCK_ASSIGNMENT,
  type DayDate,
  type Decision,
  type EffectiveRoutineOccurrence,
  type EntityId,
  type LifeAction,
  type MorningCycle,
  type MorningPhysicalStatus,
  type TomorrowPlan,
} from '../../domain';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import type { GetRoutineBlocksForDate } from './GetRoutineBlocksForDate';

export const MORNING_NEXT_STEP = {
  startMorning: 'startMorning',
  water: 'water',
  physical: 'physical',
  scheduleMainAction: 'scheduleMainAction',
  defineMainAction: 'defineMainAction',
  goToDay: 'goToDay',
} as const;

export type MorningNextStep = (typeof MORNING_NEXT_STEP)[keyof typeof MORNING_NEXT_STEP];

export interface MorningMainActionPresentation {
  readonly id: EntityId;
  readonly title: string;
  readonly completed: boolean;
  readonly scheduledTime: string | null;
}

export interface MorningOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly startedAt: Date | null;
  readonly waterCompletedAt: Date | null;
  readonly waterAmountMl: number | null;
  readonly physicalStatus: MorningPhysicalStatus;
  readonly mainAction: MorningMainActionPresentation | null;
  readonly progress: number;
  readonly ready: boolean;
  readonly nextStep: MorningNextStep;
}

export interface MorningOverviewSource {
  readonly date: DayDate;
  readonly currentDate: DayDate;
  readonly cycle: MorningCycle | null;
  readonly plan: TomorrowPlan | null;
  readonly decisions: readonly Decision[];
  readonly lifeActions: readonly LifeAction[];
  readonly occurrences: readonly EffectiveRoutineOccurrence[];
}

export class GetMorningOverview {
  public constructor(
    private readonly cycles: MorningCycleRepository,
    private readonly plans: TomorrowPlanRepository,
    private readonly decisions: DecisionRepository,
    private readonly lifeActions: LifeActionRepository,
    private readonly routineBlocks: Pick<GetRoutineBlocksForDate, 'execute'>,
    private readonly currentDate: CurrentDateProvider,
  ) {}

  public async execute(date: DayDate): Promise<MorningOverview> {
    const [cycle, plan, decisions, lifeActions, occurrences] = await Promise.all([
      this.cycles.findByDateKey(date),
      this.plans.findByTargetDate(date),
      this.decisions.findByDate(date),
      this.lifeActions.findByDate(date),
      this.routineBlocks.execute(date),
    ]);
    return resolveMorningOverview({
      date,
      currentDate: this.currentDate.getCurrentDate(),
      cycle,
      plan,
      decisions,
      lifeActions,
      occurrences,
    });
  }
}

export function resolveMorningOverview(source: MorningOverviewSource): MorningOverview {
  const action = selectMainAction(source.plan, source.decisions, source.lifeActions);
  const scheduled = action === null ? null : findScheduledOccurrence(action, source.occurrences);
  const mainAction =
    action === null
      ? null
      : Object.freeze({
          id: action.id,
          title: action.title.toString(),
          completed: action.status === LIFE_ACTION_STATUS.completed,
          scheduledTime:
            scheduled === null
              ? null
              : `${scheduled.effectiveStartTime}–${scheduled.effectiveEndTime}`,
        });
  const started = source.cycle?.startedAt != null;
  const waterDone = source.cycle?.waterCompletedAt != null;
  const physicalDone =
    source.cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.done ||
    source.cycle?.physicalStatus === MORNING_PHYSICAL_STATUS.skipped;
  const mainActionReady = mainAction?.completed === true || mainAction?.scheduledTime !== null;
  const progress = [started, waterDone, physicalDone, mainActionReady].filter(Boolean).length * 25;
  const ready = progress === 100;

  return Object.freeze({
    date: source.date,
    mutable: source.date.equals(source.currentDate),
    startedAt: source.cycle?.startedAt ?? null,
    waterCompletedAt: source.cycle?.waterCompletedAt ?? null,
    waterAmountMl: source.cycle?.waterAmountMl ?? null,
    physicalStatus: source.cycle?.physicalStatus ?? MORNING_PHYSICAL_STATUS.notConfigured,
    mainAction,
    progress,
    ready,
    nextStep: resolveNextStep(started, waterDone, physicalDone, mainAction),
  });
}

function resolveNextStep(
  started: boolean,
  waterDone: boolean,
  physicalDone: boolean,
  mainAction: MorningMainActionPresentation | null,
): MorningNextStep {
  if (!started) return MORNING_NEXT_STEP.startMorning;
  if (!waterDone) return MORNING_NEXT_STEP.water;
  if (!physicalDone) return MORNING_NEXT_STEP.physical;
  if (mainAction === null) return MORNING_NEXT_STEP.defineMainAction;
  if (!mainAction.completed && mainAction.scheduledTime === null) {
    return MORNING_NEXT_STEP.scheduleMainAction;
  }
  return MORNING_NEXT_STEP.goToDay;
}

function selectMainAction(
  plan: TomorrowPlan | null,
  decisions: readonly Decision[],
  actions: readonly LifeAction[],
): LifeAction | null {
  const eligible = actions.filter(isEligibleAction);
  if (plan?.firstActionId != null) {
    const planned = eligible.find((action) => action.id.equals(plan.firstActionId!));
    if (planned !== undefined) return planned;
  }
  const firstMain = [...decisions]
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
  if (firstMain === undefined) return null;
  return (
    eligible
      .filter((action) => action.decisionId?.equals(firstMain.id) === true)
      .sort(
        (left, right) =>
          actionRank(left) - actionRank(right) ||
          left.createdAt.getTime() - right.createdAt.getTime(),
      )[0] ?? null
  );
}

function isEligibleAction(action: LifeAction): boolean {
  return (
    !action.isArchived() &&
    (action.status === LIFE_ACTION_STATUS.inProgress ||
      action.status === LIFE_ACTION_STATUS.ready ||
      action.status === LIFE_ACTION_STATUS.completed)
  );
}

function actionRank(action: LifeAction): number {
  if (action.status === LIFE_ACTION_STATUS.inProgress) return 0;
  if (action.status === LIFE_ACTION_STATUS.ready) return 1;
  return 2;
}

function findScheduledOccurrence(
  action: LifeAction,
  occurrences: readonly EffectiveRoutineOccurrence[],
): EffectiveRoutineOccurrence | null {
  return (
    occurrences.find(
      (occurrence) =>
        !occurrence.isSkipped &&
        occurrence.effectiveAssignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction &&
        occurrence.effectiveAssignment.actionId.equals(action.id),
    ) ?? null
  );
}
