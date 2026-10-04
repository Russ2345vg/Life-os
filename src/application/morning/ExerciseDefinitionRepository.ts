import type { ExerciseDefinition } from '../../domain';

export interface ExerciseDefinitionRepository {
  list(): Promise<readonly ExerciseDefinition[]>;
}
