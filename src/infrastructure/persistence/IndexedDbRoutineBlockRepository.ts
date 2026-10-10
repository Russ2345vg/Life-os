import type { RoutineBlockRepository } from '../../application/ports/RoutineBlockRepository';
import type { RoutineBlock } from '../../domain/routine-block/RoutineBlock';
import { request } from '../sync/attachments/AttachmentRegistration';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { RoutineBlockRecordMapper } from './mappers/RoutineBlockRecordMapper';
export class IndexedDbRoutineBlockRepository implements RoutineBlockRepository {
  public constructor(private readonly database: LifeOsIndexedDb) {}
  public async findAll(): Promise<readonly RoutineBlock[]> {
    const db = await this.database.open();
    const raw = await request<unknown[]>(
      db.transaction('routineBlocks').objectStore('routineBlocks').getAll(),
    );
    return raw.map(RoutineBlockRecordMapper.fromRecord);
  }
}
