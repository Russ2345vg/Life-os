import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import type { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';

export const EXERCISE_MEASUREMENT_TYPE = {
  repetitions: 'REPETITIONS',
  duration: 'DURATION',
} as const;

export type ExerciseMeasurementType =
  (typeof EXERCISE_MEASUREMENT_TYPE)[keyof typeof EXERCISE_MEASUREMENT_TYPE];

export function isExerciseMeasurementType(value: unknown): value is ExerciseMeasurementType {
  return (Object.values(EXERCISE_MEASUREMENT_TYPE) as readonly unknown[]).includes(value);
}

export const EXERCISE_DEFINITION_SOURCE = {
  system: 'SYSTEM',
  custom: 'CUSTOM',
} as const;

export type ExerciseDefinitionSource =
  (typeof EXERCISE_DEFINITION_SOURCE)[keyof typeof EXERCISE_DEFINITION_SOURCE];

export function isExerciseDefinitionSource(value: unknown): value is ExerciseDefinitionSource {
  return (Object.values(EXERCISE_DEFINITION_SOURCE) as readonly unknown[]).includes(value);
}

export const SYSTEM_EXERCISE_DEFINITION_ID = {
  warmUp: 'morning-exercise.warm-up',
  pullUps: 'morning-exercise.pull-ups',
  pushUps: 'morning-exercise.push-ups',
  squats: 'morning-exercise.squats',
  plank: 'morning-exercise.plank',
  abs: 'morning-exercise.abs',
  stretching: 'morning-exercise.stretching',
} as const;

export const SYSTEM_EXERCISE_DEFINITION_SEEDS = [
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.warmUp,
    name: 'Разминка',
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
  },
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.pullUps,
    name: 'Подтягивания',
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
  },
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.pushUps,
    name: 'Отжимания',
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
  },
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.squats,
    name: 'Приседания',
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
  },
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.plank,
    name: 'Планка',
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
  },
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.abs,
    name: 'Пресс',
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
  },
  {
    id: SYSTEM_EXERCISE_DEFINITION_ID.stretching,
    name: 'Растяжка',
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
  },
] as const;

export interface ExerciseDefinitionCreationData {
  readonly id: EntityId;
  readonly name: string;
  readonly measurementType: ExerciseMeasurementType;
  readonly source: ExerciseDefinitionSource;
  readonly occurredAt: Date;
}

export interface ExerciseDefinitionRehydrationData {
  readonly id: EntityId;
  readonly name: string;
  readonly normalizedName: string;
  readonly measurementType: ExerciseMeasurementType;
  readonly source: ExerciseDefinitionSource;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly version: number;
}

export class ExerciseDefinition extends Entity {
  readonly #name: string;
  readonly #normalizedName: string;
  readonly #measurementType: ExerciseMeasurementType;
  readonly #source: ExerciseDefinitionSource;
  readonly #createdAt: Date;
  #updatedAt: Date;
  #archivedAt: Date | null;
  #version: number;

  private constructor(data: ExerciseDefinitionRehydrationData) {
    super(data.id);
    this.#name = data.name;
    this.#normalizedName = data.normalizedName;
    this.#measurementType = data.measurementType;
    this.#source = data.source;
    this.#createdAt = copyDate(data.createdAt);
    this.#updatedAt = copyDate(data.updatedAt);
    this.#archivedAt = copyOptionalDate(data.archivedAt);
    this.#version = data.version;
  }

  public static create(data: ExerciseDefinitionCreationData): ExerciseDefinition {
    const name = normalizeExerciseDefinitionDisplayName(data.name);
    assertMeasurementType(data.measurementType);
    assertSource(data.source);
    assertDate(data.occurredAt);
    return new ExerciseDefinition({
      id: data.id,
      name,
      normalizedName: normalizeExerciseDefinitionName(name),
      measurementType: data.measurementType,
      source: data.source,
      createdAt: data.occurredAt,
      updatedAt: data.occurredAt,
      archivedAt: null,
      version: 1,
    });
  }

  public static rehydrate(data: ExerciseDefinitionRehydrationData): ExerciseDefinition {
    const name = normalizeExerciseDefinitionDisplayName(data.name);
    if (data.normalizedName !== normalizeExerciseDefinitionName(name)) throw invalidDefinition();
    assertMeasurementType(data.measurementType);
    assertSource(data.source);
    assertDate(data.createdAt);
    assertDate(data.updatedAt);
    if (data.updatedAt.getTime() < data.createdAt.getTime()) throw invalidDefinition();
    if (data.archivedAt !== null) {
      assertDate(data.archivedAt);
      if (data.archivedAt.getTime() < data.createdAt.getTime()) throw invalidDefinition();
    }
    if (!Number.isInteger(data.version) || data.version < 1) throw invalidDefinition();
    return new ExerciseDefinition({ ...data, name });
  }

  public get name(): string {
    return this.#name;
  }

  public get normalizedName(): string {
    return this.#normalizedName;
  }

  public get measurementType(): ExerciseMeasurementType {
    return this.#measurementType;
  }

  public get source(): ExerciseDefinitionSource {
    return this.#source;
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }

  public get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }

  public get archivedAt(): Date | null {
    return copyOptionalDate(this.#archivedAt);
  }

  public get version(): number {
    return this.#version;
  }

  public archive(occurredAt: Date): boolean {
    if (this.#archivedAt !== null) return false;
    assertDate(occurredAt);
    if (occurredAt.getTime() < this.#createdAt.getTime()) throw invalidDefinition();
    this.#archivedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }
}

export function normalizeExerciseDefinitionName(value: string): string {
  return normalizeExerciseDefinitionDisplayName(value).toLocaleLowerCase('ru-RU');
}

function normalizeExerciseDefinitionDisplayName(value: string): string {
  if (typeof value !== 'string') throw invalidName();
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0 || normalized.length > 80) throw invalidName();
  return normalized;
}

function assertMeasurementType(value: unknown): asserts value is ExerciseMeasurementType {
  if (!isExerciseMeasurementType(value)) {
    throw invalidDefinition();
  }
}

function assertSource(value: unknown): asserts value is ExerciseDefinitionSource {
  if (!isExerciseDefinitionSource(value)) {
    throw invalidDefinition();
  }
}

function assertDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw invalidDefinition();
}

function invalidName(): DomainError {
  return new DomainError(
    'exercise_definition.invalid_name',
    'Название упражнения указано неверно.',
  );
}

function invalidDefinition(): DomainError {
  return new DomainError(
    'exercise_definition.invalid_data',
    'Определение упражнения указано неверно.',
  );
}
