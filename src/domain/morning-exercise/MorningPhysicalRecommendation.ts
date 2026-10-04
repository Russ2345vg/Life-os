import { DomainError } from '../../shared/errors/DomainError';
import { EntityId } from '../shared/EntityId';
import { EXERCISE_MEASUREMENT_TYPE, SYSTEM_EXERCISE_DEFINITION_ID } from './ExerciseDefinition';
import {
  MORNING_PHYSICAL_SET_STATUS,
  type MorningPhysicalExecution,
} from './MorningPhysicalExecution';
import {
  adjustMorningPhysicalPlanItem,
  copyMorningPhysicalPlanItems,
  type MorningPhysicalPlanItem,
} from './MorningPhysicalPlan';

export const MORNING_PHYSICAL_RECOMMENDATION_STATUS = {
  pending: 'PENDING',
  accepted: 'ACCEPTED',
  dismissed: 'DISMISSED',
} as const;

export type MorningPhysicalRecommendationStatus =
  (typeof MORNING_PHYSICAL_RECOMMENDATION_STATUS)[keyof typeof MORNING_PHYSICAL_RECOMMENDATION_STATUS];

export interface MorningPhysicalRecommendation {
  readonly status: MorningPhysicalRecommendationStatus;
  readonly planItems: readonly MorningPhysicalPlanItem[];
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

const NON_PROGRESSING_EXERCISES = new Set<string>([
  SYSTEM_EXERCISE_DEFINITION_ID.warmUp,
  SYSTEM_EXERCISE_DEFINITION_ID.stretching,
]);

export function createReadyMorningPhysicalPlan(): readonly MorningPhysicalPlanItem[] {
  return copyMorningPhysicalPlanItems([
    duration(SYSTEM_EXERCISE_DEFINITION_ID.warmUp, 2, 150),
    repetitions(SYSTEM_EXERCISE_DEFINITION_ID.pullUps, 3, 4),
    repetitions(SYSTEM_EXERCISE_DEFINITION_ID.pushUps, 3, 10),
    repetitions(SYSTEM_EXERCISE_DEFINITION_ID.squats, 3, 15),
    duration(SYSTEM_EXERCISE_DEFINITION_ID.plank, 2, 30),
    duration(SYSTEM_EXERCISE_DEFINITION_ID.stretching, 2, 150),
  ]);
}

export function buildMorningPhysicalRecommendation(
  plan: readonly MorningPhysicalPlanItem[],
  execution: MorningPhysicalExecution,
): readonly MorningPhysicalPlanItem[] | null {
  if (execution.completedAt === null) {
    throw new DomainError(
      'morning_physical_recommendation.execution_incomplete',
      'Сначала завершите зарядку.',
    );
  }

  let changed = false;
  const next = plan.map((item) => {
    if (NON_PROGRESSING_EXERCISES.has(item.exerciseDefinitionId.toString())) return item;
    const sets = execution.sets.filter(({ exerciseDefinitionId }) =>
      exerciseDefinitionId.equals(item.exerciseDefinitionId),
    );
    if (sets.length !== item.sets) return item;

    const shouldDecrease = sets.some((set) => {
      if (set.status === MORNING_PHYSICAL_SET_STATUS.skipped) return true;
      if (set.status !== MORNING_PHYSICAL_SET_STATUS.completed) return false;
      const target =
        item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? item.targetReps
          : item.targetDurationSeconds;
      const actual =
        set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? set.actualReps
          : set.actualDurationSeconds;
      return actual < target * 0.8;
    });
    const shouldIncrease = sets.every((set) => {
      if (set.status !== MORNING_PHYSICAL_SET_STATUS.completed) return false;
      const target =
        item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? item.targetReps
          : item.targetDurationSeconds;
      const actual =
        set.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? set.actualReps
          : set.actualDurationSeconds;
      return actual >= target;
    });
    if (!shouldDecrease && !shouldIncrease) return item;
    const adjusted = adjustMorningPhysicalPlanItem(item, {
      field: 'target',
      delta: shouldDecrease ? -1 : 1,
    });
    changed ||= !sameTarget(item, adjusted);
    return adjusted;
  });

  return changed ? copyMorningPhysicalPlanItems(next) : null;
}

export function copyMorningPhysicalRecommendation(
  value: MorningPhysicalRecommendation,
): MorningPhysicalRecommendation {
  if (
    !Object.values(MORNING_PHYSICAL_RECOMMENDATION_STATUS).includes(value.status) ||
    !(value.createdAt instanceof Date) ||
    Number.isNaN(value.createdAt.getTime()) ||
    (value.decidedAt !== null &&
      (!(value.decidedAt instanceof Date) ||
        Number.isNaN(value.decidedAt.getTime()) ||
        value.decidedAt.getTime() < value.createdAt.getTime())) ||
    (value.status === MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending) !== (value.decidedAt === null)
  ) {
    throw invalidRecommendation();
  }
  const planItems = copyMorningPhysicalPlanItems(value.planItems);
  if (planItems.length === 0) throw invalidRecommendation();
  return {
    status: value.status,
    planItems,
    createdAt: new Date(value.createdAt.getTime()),
    decidedAt: value.decidedAt === null ? null : new Date(value.decidedAt.getTime()),
  };
}

function repetitions(id: string, sets: number, targetReps: number): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: EntityId.create(id),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets,
    targetReps,
  };
}

function duration(
  id: string,
  sets: number,
  targetDurationSeconds: number,
): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: EntityId.create(id),
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
    sets,
    targetDurationSeconds,
  };
}

function sameTarget(left: MorningPhysicalPlanItem, right: MorningPhysicalPlanItem): boolean {
  if (left.measurementType !== right.measurementType) return false;
  return left.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions &&
    right.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? left.targetReps === right.targetReps
    : left.measurementType === EXERCISE_MEASUREMENT_TYPE.duration &&
        right.measurementType === EXERCISE_MEASUREMENT_TYPE.duration &&
        left.targetDurationSeconds === right.targetDurationSeconds;
}

function invalidRecommendation(): DomainError {
  return new DomainError(
    'morning_physical_recommendation.invalid_data',
    'Предложение нагрузки указано неверно.',
  );
}
