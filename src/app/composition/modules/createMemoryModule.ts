import {
  MemoryApplicationService,
  MemoryContextResolver,
  MemoryDiaryImport,
  MemoryQueries,
} from '../../../application/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import type { Clock } from '../../../application/ports/Clock';
import type { CurrentDateProvider } from '../../../application/ports/CurrentDateProvider';
import type { DiaryRepository } from '../../../application/ports/DiaryRepository';
import type { DirectionRepository } from '../../../application/ports/DirectionRepository';
import type { GoalRepository } from '../../../application/ports/GoalRepository';
import type { IdGenerator } from '../../../application/ports/IdGenerator';
import type { MemoryPhotoReader } from '../../../application/ports/MemoryPhotoReader';
import type { SphereRepository } from '../../../application/ports/SphereRepository';
import { IndexedDbMemoryRepository } from '../../../infrastructure/persistence/IndexedDbMemoryRepository';
import type { LifeOsIndexedDb } from '../../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';

export interface MemoryModuleDependencies {
  readonly database: LifeOsIndexedDb;
  readonly clock: Clock;
  readonly currentDateProvider: CurrentDateProvider;
  readonly idGenerator: IdGenerator;
  readonly writesEnabled: boolean;
  readonly diary: DiaryRepository;
  readonly spheres: Pick<SphereRepository, 'findById'>;
  readonly directions: Pick<DirectionRepository, 'findById'>;
  readonly goals: Pick<GoalRepository, 'findById'>;
  readonly photoReader: MemoryPhotoReader;
}

export function createMemoryModule(dependencies: MemoryModuleDependencies): MemoryServices {
  const repository = new IndexedDbMemoryRepository(dependencies.database);
  const commands = new MemoryApplicationService(
    repository,
    dependencies.clock,
    dependencies.currentDateProvider,
    dependencies.idGenerator,
    dependencies.writesEnabled,
    new MemoryContextResolver(dependencies.spheres, dependencies.directions, dependencies.goals),
  );
  return {
    commands,
    queries: new MemoryQueries(repository),
    diaryImport: new MemoryDiaryImport(dependencies.diary, commands),
    photoReader: dependencies.photoReader,
  };
}
