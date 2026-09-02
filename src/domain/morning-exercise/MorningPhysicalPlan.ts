import { DomainError } from '../../shared/errors/DomainError';
import type { EntityId } from '../shared/EntityId';
import { EXERCISE_MEASUREMENT_TYPE, type ExerciseMeasurementType } from './ExerciseDefinition';

export const MORNING_PHYSICAL_PLAN_LIMIT = {
  minSets: 1,
  maxSets: 10,
  minReps: 1,
  maxReps: 100,
  minDurationSeconds: 5,
  maxDurationSeconds: 600,
  durationStepSeconds: 5,
  estimatedMinutesPerSet: 2,
} as const;

export interface MorningRepetitionPlanItem {
  readonly exerciseDefinitionId: EntityId;
  readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
  readonly sets: number;
  readonly targetReps: number;
}

export interface MorningDurationPlanItem {
  readonly exerciseDefinitionId: EntityId;
  readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
  readonly sets: number;
  readonly targetDurationSeconds: number;
}

export type MorningPhysicalPlanItem = MorningRepetitionPlanItem | MorningDurationPlanItem;

export type MorningPhysicalPlanAdjustment =
  | { readonly field: 'sets'; readonly delta: -1 | 1 }
  | { readonly field: 'target'; readonly delta: -1 | 1 };

export interface MorningPhysicalPlanSummary {
  readonly selectedCount: number;
  readonly totalSets: number;
  readonly estimatedMinutes: number;
}

export function createDefaultMorningPhysicalPlanItem(
  exerciseDefinitionId: EntityId,
  measurementType: ExerciseMeasurementType,
): MorningPhysicalPlanItem {
  return measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? {
        exerciseDefinitionId,
        measurementType,
        sets: 3,
        targetReps: 10,
      }
    : {
        exerciseDefinitionId,
        measurementType,
        sets: 3,
        targetDurationSeconds: 30,
      };
}

export function adjustMorningPhysicalPlanItem(
  item: MorningPhysicalPlanItem,
  adjustment: MorningPhysicalPlanAdjustment,
): MorningPhysicalPlanItem {
  assertMorningPhysicalPlanItems([item]);
  if (adjustment.delta !== -1 && adjustment.delta !== 1) throw invalidPlan();
  if (adjustment.field === 'sets') {
    return copyMorningPhysicalPlanItem({
      ...item,
      sets: clamp(
        item.sets + adjustment.delta,
        MORNING_PHYSICAL_PLAN_LIMIT.minSets,
        MORNING_PHYSICAL_PLAN_LIMIT.maxSets,
      ),
    });
  }
  return item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? {
        exerciseDefinitionId: item.exerciseDefinitionId,
        measurementType: item.measurementType,
        sets: item.sets,
        targetReps: clamp(
          item.targetReps + adjustment.delta,
          MORNING_PHYSICAL_PLAN_LIMIT.minReps,
          MORNING_PHYSICAL_PLAN_LIMIT.maxReps,
        ),
      }
    : {
        exerciseDefinitionId: item.exerciseDefinitionId,
        measurementType: item.measurementType,
        sets: item.sets,
        targetDurationSeconds: clamp(
          item.targetDurationSeconds +
            adjustment.delta * MORNING_PHYSICAL_PLAN_LIMIT.durationStepSeconds,
          MORNING_PHYSICAL_PLAN_LIMIT.minDurationSeconds,
          MORNING_PHYSICAL_PLAN_LIMIT.maxDurationSeconds,
        ),
      };
}

export function summarizeMorningPhysicalPlan(
  items: readonly MorningPhysicalPlanItem[],
): MorningPhysicalPlanSummary {
  assertMorningPhysicalPlanItems(items);
  const totalSets = items.reduce((total, item) => total + item.sets, 0);
  return Object.freeze({
    selectedCount: items.length,
    totalSets,
    estimatedMinutes: totalSets * MORNING_PHYSICAL_PLAN_LIMIT.estimatedMinutesPerSet,
  });
}

export function assertMorningPhysicalPlanItems(items: readonly MorningPhysicalPlanItem[]): void {
  if (!Array.isArray(items)) throw invalidPlan();
  const definitionIds = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'object' || item === null) throw invalidPlan();
    const definitionId = item.exerciseDefinitionId?.toString();
    if (definitionId === undefined || definitionIds.has(definitionId)) throw invalidPlan();
    if (!validInteger(item.sets, 1, 10)) throw invalidPlan();
    if (item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions) {
      if (!validInteger(item.targetReps, 1, 100) || Object.hasOwn(item, 'targetDurationSeconds')) {
        throw invalidPlan();
      }
    } else if (item.measurementType === EXERCISE_MEASUREMENT_TYPE.duration) {
      if (
        !validInteger(item.targetDurationSeconds, 5, 600) ||
        item.targetDurationSeconds % MORNING_PHYSICAL_PLAN_LIMIT.durationStepSeconds !== 0 ||
        Object.hasOwn(item, 'targetReps')
      ) {
        throw invalidPlan();
      }
    } else {
      throw invalidPlan();
    }
    definitionIds.add(definitionId);
  }
}

export function copyMorningPhysicalPlanItems(
  items: readonly MorningPhysicalPlanItem[],
): readonly MorningPhysicalPlanItem[] {
  assertMorningPhysicalPlanItems(items);
  return items.map(copyMorningPhysicalPlanItem);
}

function copyMorningPhysicalPlanItem(item: MorningPhysicalPlanItem): MorningPhysicalPlanItem {
  return item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
    ? {
        exerciseDefinitionId: item.exerciseDefinitionId,
        measurementType: item.measurementType,
        sets: item.sets,
        targetReps: item.targetReps,
      }
    : {
        exerciseDefinitionId: item.exerciseDefinitionId,
        measurementType: item.measurementType,
        sets: item.sets,
        targetDurationSeconds: item.targetDurationSeconds,
      };
}

function validInteger(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= min && value <= max;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function invalidPlan(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_physical_plan',
    'План физической активации указан неверно.',
  );
}
