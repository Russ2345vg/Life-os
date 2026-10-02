import type {
  WalkPreferencesStore,
  WalkRegularityPreferences,
} from '../../application/walk/WalkPreferences';
import type { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { done, request } from '../sync/attachments/AttachmentRegistration';
import { WALK_PREFERENCES_CHANGED } from '../../application/walk/WalkPreferences';

export const WALK_PREFERENCES_KEY = 'walk-preferences:v1';
export function notifyWalkPreferencesChanged(): void {
  if (typeof globalThis.dispatchEvent === 'function')
    globalThis.dispatchEvent(new Event(WALK_PREFERENCES_CHANGED));
}
export class IndexedDbWalkPreferencesStore implements WalkPreferencesStore {
  public constructor(
    private readonly database: LifeOsIndexedDb,
    private readonly onCommitted: () => void = () => undefined,
  ) {}
  public async read(): Promise<WalkRegularityPreferences> {
    const db = await this.database.open();
    const value = await request<
      { weeklyCount?: number | null; weeklyMinutes?: number | null } | undefined
    >(db.transaction('sync_settings').objectStore('sync_settings').get(WALK_PREFERENCES_KEY));
    return { weeklyCount: value?.weeklyCount ?? null, weeklyMinutes: value?.weeklyMinutes ?? null };
  }
  public async write(value: WalkRegularityPreferences): Promise<void> {
    const db = await this.database.open();
    const tx = db.transaction('sync_settings', 'readwrite');
    tx.objectStore('sync_settings').put({ id: WALK_PREFERENCES_KEY, ...value });
    await done(tx);
    notifyWalkPreferencesChanged();
    this.onCommitted();
  }
}
