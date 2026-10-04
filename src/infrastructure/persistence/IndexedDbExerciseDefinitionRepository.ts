import type { ExerciseDefinitionRepository } from '../../application/morning/ExerciseDefinitionRepository';
import type { ExerciseDefinition } from '../../domain';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { ExerciseDefinitionRecordMapper } from './mappers/ExerciseDefinitionRecordMapper';

export class IndexedDbExerciseDefinitionRepository implements ExerciseDefinitionRepository {
  public constructor(private readonly database: LifeOsIndexedDb = new LifeOsIndexedDb()) {}

  public async list(): Promise<readonly ExerciseDefinition[]> {
    const database = await this.database.open();
    const records = await executeIndexedDbRequest(
      database,
      LIFE_OS_STORE.exerciseDefinitions,
      'readonly',
      (store) => store.getAll(),
    );
    return records.map((record) => ExerciseDefinitionRecordMapper.fromRecord(record));
  }
}
