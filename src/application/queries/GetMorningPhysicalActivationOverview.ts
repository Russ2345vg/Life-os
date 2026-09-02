import {
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  MORNING_PHYSICAL_STATUS,
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
  summarizeMorningPhysicalPlan,
  type DayDate,
  type EntityId,
  type ExerciseDefinition,
  type ExerciseMeasurementType,
  type MorningPhysicalPlanSummary,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { ExerciseDefinitionRepository } from '../ports/ExerciseDefinitionRepository';
import type { MorningCycleRepository } from '../ports/MorningCycleRepository';

export interface MorningPhysicalLibraryItem {
  readonly id: EntityId;
  readonly name: string;
  readonly measurementType: ExerciseMeasurementType;
  readonly selected: boolean;
}

export type MorningPhysicalSelectedItem =
  | {
      readonly id: EntityId;
      readonly name: string;
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.repetitions;
      readonly sets: number;
      readonly targetReps: number;
    }
  | {
      readonly id: EntityId;
      readonly name: string;
      readonly measurementType: typeof EXERCISE_MEASUREMENT_TYPE.duration;
      readonly sets: number;
      readonly targetDurationSeconds: number;
    };

export interface MorningPhysicalActivationOverview {
  readonly date: DayDate;
  readonly mutable: boolean;
  readonly canEditPlan: boolean;
  readonly canCreateCustom: boolean;
  readonly library: readonly MorningPhysicalLibraryItem[];
  readonly selectedItems: readonly MorningPhysicalSelectedItem[];
  readonly summary: MorningPhysicalPlanSummary;
}

export class GetMorningPhysicalActivationOverview {
  public constructor(
    private readonly cycles: MorningCycleRepository,
    private readonly definitions: ExerciseDefinitionRepository,
    private readonly currentDate: CurrentDateProvider,
  ) {}

  public async execute(date: DayDate): Promise<MorningPhysicalActivationOverview> {
    const [cycle, definitions] = await Promise.all([
      this.cycles.findByDateKey(date),
      this.definitions.findAll(),
    ]);
    const mutable = date.equals(this.currentDate.getCurrentDate());
    const canEditPlan =
      mutable &&
      cycle?.isActive() === true &&
      (cycle.physicalStatus === MORNING_PHYSICAL_STATUS.notConfigured ||
        cycle.physicalStatus === MORNING_PHYSICAL_STATUS.ready);
    const allById = new Map(
      definitions.map((definition) => [definition.id.toString(), definition]),
    );
    const planItems = cycle?.physicalPlanItems ?? [];
    const selectedIds = new Set(planItems.map((item) => item.exerciseDefinitionId.toString()));
    const selectedItems = planItems.map((item): MorningPhysicalSelectedItem => {
      const definition = allById.get(item.exerciseDefinitionId.toString());
      if (definition === undefined || definition.measurementType !== item.measurementType) {
        throw missingDefinition();
      }
      return Object.freeze(
        item.measurementType === EXERCISE_MEASUREMENT_TYPE.repetitions
          ? {
              id: item.exerciseDefinitionId,
              name: definition.name,
              measurementType: item.measurementType,
              sets: item.sets,
              targetReps: item.targetReps,
            }
          : {
              id: item.exerciseDefinitionId,
              name: definition.name,
              measurementType: item.measurementType,
              sets: item.sets,
              targetDurationSeconds: item.targetDurationSeconds,
            },
      );
    });
    const library = [...definitions]
      .filter((definition) => definition.archivedAt === null)
      .sort(compareDefinitions)
      .map((definition) =>
        Object.freeze({
          id: definition.id,
          name: definition.name,
          measurementType: definition.measurementType,
          selected: selectedIds.has(definition.id.toString()),
        }),
      );

    return Object.freeze({
      date,
      mutable,
      canEditPlan,
      canCreateCustom: canEditPlan,
      library: Object.freeze(library),
      selectedItems: Object.freeze(selectedItems),
      summary: summarizeMorningPhysicalPlan(planItems),
    });
  }
}

const SYSTEM_ORDER = new Map<string, number>(
  SYSTEM_EXERCISE_DEFINITION_SEEDS.map((seed, index) => [seed.id, index]),
);

function compareDefinitions(left: ExerciseDefinition, right: ExerciseDefinition): number {
  if (left.source !== right.source) {
    return left.source === EXERCISE_DEFINITION_SOURCE.system ? -1 : 1;
  }
  if (left.source === EXERCISE_DEFINITION_SOURCE.system) {
    return (
      (SYSTEM_ORDER.get(left.id.toString()) ?? Number.MAX_SAFE_INTEGER) -
      (SYSTEM_ORDER.get(right.id.toString()) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return (
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.name.localeCompare(right.name, 'ru')
  );
}

function missingDefinition(): DomainError {
  return new DomainError(
    'persistence.missing_exercise_definition',
    'План физической активации ссылается на отсутствующее упражнение.',
  );
}
