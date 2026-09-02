import {
  EXERCISE_DEFINITION_SOURCE,
  ExerciseDefinition,
  type ExerciseMeasurementType,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { ExerciseDefinitionRepository } from '../ports/ExerciseDefinitionRepository';
import type { IdGenerator } from '../ports/IdGenerator';

export class MorningExerciseCatalogService {
  public constructor(
    private readonly definitions: ExerciseDefinitionRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  public async createCustom(
    name: string,
    measurementType: ExerciseMeasurementType,
  ): Promise<ExerciseDefinition> {
    const definition = ExerciseDefinition.create({
      id: this.ids.generate(),
      name,
      measurementType,
      source: EXERCISE_DEFINITION_SOURCE.custom,
      occurredAt: this.clock.now(),
    });
    if (!(await this.definitions.add(definition))) {
      throw new DomainError(
        'exercise_definition.duplicate_name',
        'Упражнение с таким названием уже существует.',
      );
    }
    return definition;
  }
}
