import type { ExerciseDefinitionRepository } from '../../application/ports/ExerciseDefinitionRepository';
import {
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
  type EntityId,
  type ExerciseDefinition,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { ExerciseDefinitionRecordMapper } from './mappers/ExerciseDefinitionRecordMapper';

export class IndexedDbExerciseDefinitionRepository implements ExerciseDefinitionRepository {
  public constructor(private readonly indexedDb: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async findById(id: EntityId): Promise<ExerciseDefinition | null> {
    const database = await this.indexedDb.open();
    const value = await executeIndexedDbRequest<unknown>(
      database,
      LIFE_OS_STORE.exerciseDefinitions,
      'readonly',
      (store) => store.get(id.toString()),
    );
    return value === undefined ? null : ExerciseDefinitionRecordMapper.fromRecord(value);
  }

  public async findAll(): Promise<readonly ExerciseDefinition[]> {
    const database = await this.indexedDb.open();
    const values = await executeIndexedDbRequest<unknown[]>(
      database,
      LIFE_OS_STORE.exerciseDefinitions,
      'readonly',
      (store) => store.getAll(),
    );
    const systemOrder = new Map<string, number>(
      SYSTEM_EXERCISE_DEFINITION_SEEDS.map((seed, index) => [seed.id, index]),
    );
    return values
      .map((value) => ExerciseDefinitionRecordMapper.fromRecord(value))
      .sort((left, right) => {
        const leftOrder = systemOrder.get(left.id.toString());
        const rightOrder = systemOrder.get(right.id.toString());
        if (leftOrder !== undefined || rightOrder !== undefined) {
          return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
        }
        return (
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.name.localeCompare(right.name, 'ru')
        );
      });
  }

  public async add(definition: ExerciseDefinition): Promise<boolean> {
    const database = await this.indexedDb.open();
    try {
      await executeIndexedDbRequest(
        database,
        LIFE_OS_STORE.exerciseDefinitions,
        'readwrite',
        (store) => store.add(ExerciseDefinitionRecordMapper.toRecord(definition)),
      );
      return true;
    } catch (error: unknown) {
      if (error instanceof DomainError && error.code === 'persistence.constraint_violation') {
        return false;
      }
      throw error;
    }
  }
}
