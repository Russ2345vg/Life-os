import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { parseApplicationRoute } from '../../presentation/navigation/ApplicationRoute';

describe('current workspace gate', () => {
  it('boots the only application runtime and accepts only current routes', async () => {
    const application = await createLifeOsApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
    });

    expect(parseApplicationRoute('#/v2/today')).toEqual({ view: 'today' });
    expect(parseApplicationRoute('#/v2/goals')).toEqual({ view: 'goals' });
    expect(parseApplicationRoute('#/routine/evening')).toBeNull();
    expect(parseApplicationRoute('#/goals')).toBeNull();
    expect(application.plannerCatalog).toBeDefined();
    expect(application.plannerInbox).toBeDefined();
    expect(application.planning).toBeDefined();
    expect('morningCycle' in application).toBe(false);
    expect('eveningCycle' in application).toBe(false);
    expect('createWalk' in application).toBe(false);

    application.close();
  });
});
