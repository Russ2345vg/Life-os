import type { ExerciseDefinitionRepository } from '../../application/ports/ExerciseDefinitionRepository';
import type { EntityId, ExerciseDefinition } from '../../domain';

export class InMemoryExerciseDefinitionRepository implements ExerciseDefinitionRepository {
  readonly #definitions = new Map<string, ExerciseDefinition>();

  public constructor(definitions: readonly ExerciseDefinition[] = []) {
    for (const definition of definitions) {
      this.#definitions.set(definition.id.toString(), definition);
    }
  }

  public async findById(id: EntityId): Promise<ExerciseDefinition | null> {
    return this.#definitions.get(id.toString()) ?? null;
  }

  public async findAll(): Promise<readonly ExerciseDefinition[]> {
    return [...this.#definitions.values()];
  }

  public async add(definition: ExerciseDefinition): Promise<boolean> {
    if (
      this.#definitions.has(definition.id.toString()) ||
      [...this.#definitions.values()].some(
        (stored) => stored.normalizedName === definition.normalizedName,
      )
    ) {
      return false;
    }
    this.#definitions.set(definition.id.toString(), definition);
    return true;
  }
}
