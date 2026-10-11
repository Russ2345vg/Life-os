import {
  defaultSunsetWalkSettings,
  validateSunsetWalkSettings,
  type SunsetWalkSettingsStore,
  type SunsetWalkSettingsValue,
} from '../../application/walk/SunsetWalkSettings';
import type { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { done, request } from '../sync/attachments/AttachmentRegistration';
export const SUNSET_WALK_SETTINGS_KEY = 'sunset-walk-settings:v1';
export class IndexedDbSunsetWalkSettingsStore implements SunsetWalkSettingsStore {
  public constructor(private readonly database: LifeOsIndexedDb) {}
  public async read(): Promise<SunsetWalkSettingsValue> {
    const db = await this.database.open();
    const value = await request<unknown>(
      db.transaction('sync_settings').objectStore('sync_settings').get(SUNSET_WALK_SETTINGS_KEY),
    );
    return value === undefined ? defaultSunsetWalkSettings() : validateSunsetWalkSettings(value);
  }
  public async write(value: SunsetWalkSettingsValue): Promise<void> {
    const normalized = validateSunsetWalkSettings(value);
    const db = await this.database.open();
    const tx = db.transaction('sync_settings', 'readwrite');
    tx.objectStore('sync_settings').put({ id: SUNSET_WALK_SETTINGS_KEY, ...normalized });
    await done(tx);
  }
}
