import { IDBFactory } from 'fake-indexeddb';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbAutopilotSettingsStore } from '../../infrastructure/persistence/IndexedDbAutopilotSettingsStore';
import { AutopilotSettingsService } from '../../application/planner/AutopilotSettingsService';
export function autopilotSettingsTestFactory() {
  const db = new LifeOsIndexedDb(new IDBFactory());
  return { db, service: new AutopilotSettingsService(new IndexedDbAutopilotSettingsStore(db)) };
}
