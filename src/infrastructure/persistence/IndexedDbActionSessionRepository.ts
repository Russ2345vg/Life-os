import type { ActionSession, EntityId } from '../../domain';
import type { ActionSessionRepository } from '../../application/ports/ActionSessionRepository';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';
import type { ActionSessionRecord } from './records/ActionSessionRecord';
import { request } from '../sync/attachments/AttachmentRegistration';

export class IndexedDbActionSessionRepository implements ActionSessionRepository {
  public constructor(readonly db: LifeOsIndexedDb) {}

  public async all(): Promise<readonly ActionSession[]> {
    const database = await this.db.open();
    const records = await request<ActionSessionRecord[]>(
      database
        .transaction(LIFE_OS_STORE.actionSessions)
        .objectStore(LIFE_OS_STORE.actionSessions)
        .getAll(),
    );
    return records.map(ActionSessionRecordMapper.fromRecord);
  }

  public async findById(id: EntityId): Promise<ActionSession | null> {
    const database = await this.db.open();
    const record = await request<ActionSessionRecord | undefined>(
      database
        .transaction(LIFE_OS_STORE.actionSessions)
        .objectStore(LIFE_OS_STORE.actionSessions)
        .get(id.toString()),
    );
    return record === undefined ? null : ActionSessionRecordMapper.fromRecord(record);
  }
}
