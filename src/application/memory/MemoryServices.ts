import type { MemoryPhotoReader } from '../ports/MemoryPhotoReader';
import type { MemoryApplicationService } from './MemoryService';
import type { MemoryQueries } from './MemoryQueries';
import type { MemoryDiaryImport } from './MemoryDiaryImport';

export interface MemoryServices {
  readonly commands: Pick<
    MemoryApplicationService,
    'enabled' | 'prepareCreate' | 'save' | 'remove' | 'restore'
  >;
  readonly queries: Pick<MemoryQueries, 'get' | 'getSummary' | 'list' | 'getYear' | 'getOnThisDay'>;
  readonly diaryImport: Pick<MemoryDiaryImport, 'prepare' | 'sourceStatus'>;
  readonly photoReader: MemoryPhotoReader;
}
