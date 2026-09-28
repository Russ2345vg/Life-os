import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbTimeCapacityRepository } from '../../infrastructure/persistence/IndexedDbTimeCapacityRepository';
import { TimeCapacityService } from '../../application/time/TimeCapacityService';

describe('TimeCapacityService', () => {
  let db: LifeOsIndexedDb;
  let service: TimeCapacityService;
  beforeEach(() => {
    db = new LifeOsIndexedDb(new IDBFactory());
    service = new TimeCapacityService(new IndexedDbTimeCapacityRepository(db));
  });
  afterEach(() => db.close());

  it('leaves capacity unknown until the user specifies a weekday', async () => {
    expect(await service.get()).toEqual([null, null, null, null, null, null, null]);
    await service.setWeekday(0, 360);
    expect(await service.get()).toEqual([360, null, null, null, null, null, null]);
    await service.setWeekday(0, null);
    expect(await service.get()).toEqual([null, null, null, null, null, null, null]);
  });

  it('rejects invalid hours without changing the persisted setting', async () => {
    await expect(service.setWeekday(2, 0)).rejects.toThrow();
    await expect(service.setWeekday(7, 60)).rejects.toThrow();
    expect(await service.get()).toEqual([null, null, null, null, null, null, null]);
  });
});
