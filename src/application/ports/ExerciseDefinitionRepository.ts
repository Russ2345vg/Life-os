import type { EntityId, ExerciseDefinition } from '../../domain';

export interface ExerciseDefinitionRepository {
  findById(id: EntityId): Promise<ExerciseDefinition | null>;
  findAll(): Promise<readonly ExerciseDefinition[]>;
  add(definition: ExerciseDefinition): Promise<boolean>;
}
