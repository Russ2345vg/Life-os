import {
  validateAutopilotPreferences,
  validateAutopilotDayDraft,
  type AutopilotPreferences,
  type AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import type {
  AutopilotSettingsStore,
  AutopilotStored,
} from '../../application/ports/AutopilotSettingsStore';
import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../../domain/day/DayDate';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { done, request } from '../sync/attachments/AttachmentRegistration';

export const AUTOPILOT_PREFERENCES_KEY = 'day-autopilot-preferences:v1';
export function autopilotDraftKey(date: string): string {
  DayDate.create(date);
  return `day-autopilot-draft:v1:${date}`;
}
export function parseAutopilotStored<T>(
  raw: unknown,
  key: string,
  validate: (value: unknown) => T,
): AutopilotStored<T> {
  if (!raw || typeof raw !== 'object') throw invalidRecord();
  const record = raw as Record<string, unknown>;
  if (
    record.id !== key ||
    record.schemaVersion !== 1 ||
    typeof record.version !== 'number' ||
    !Number.isInteger(record.version) ||
    record.version < 1
  )
    throw invalidRecord();
  try {
    return { schemaVersion: 1, version: record.version, value: validate(record.value) };
  } catch {
    throw invalidRecord();
  }
}
function invalidRecord(): DomainError {
  return new DomainError(
    'day_autopilot.invalid_record',
    'Настройки автопилота повреждены. Исходная запись сохранена; используйте восстановление данных.',
  );
}
export class IndexedDbAutopilotSettingsStore implements AutopilotSettingsStore {
  public constructor(private readonly database: LifeOsIndexedDb) {}
  public readPreferences(): Promise<AutopilotStored<AutopilotPreferences> | null> {
    return this.read(AUTOPILOT_PREFERENCES_KEY, validateAutopilotPreferences);
  }
  public async readDraft(date: string): Promise<AutopilotStored<AutopilotDayDraft> | null> {
    const record = await this.read(autopilotDraftKey(date), validateAutopilotDayDraft);
    if (record && record.value.date !== date) throw invalidRecord();
    return record;
  }
  public writePreferences(
    value: AutopilotPreferences,
    expectedVersion: number | null,
  ): Promise<AutopilotStored<AutopilotPreferences>> {
    return this.write(
      AUTOPILOT_PREFERENCES_KEY,
      value,
      expectedVersion,
      validateAutopilotPreferences,
    );
  }
  public writeDraft(
    value: AutopilotDayDraft,
    expectedVersion: number | null,
  ): Promise<AutopilotStored<AutopilotDayDraft>> {
    return this.write(
      autopilotDraftKey(value.date),
      value,
      expectedVersion,
      validateAutopilotDayDraft,
    );
  }
  private async read<T>(
    key: string,
    validate: (value: unknown) => T,
  ): Promise<AutopilotStored<T> | null> {
    const db = await this.database.open();
    const raw = await request<unknown>(
      db.transaction('sync_settings').objectStore('sync_settings').get(key),
    );
    return raw === undefined ? null : parseAutopilotStored(raw, key, validate);
  }
  private async write<T>(
    key: string,
    value: T,
    expectedVersion: number | null,
    validate: (value: unknown) => T,
  ): Promise<AutopilotStored<T>> {
    const valid = validate(value);
    const db = await this.database.open();
    const tx = db.transaction('sync_settings', 'readwrite');
    const completion = done(tx);
    void completion.catch(() => undefined);
    try {
      const store = tx.objectStore('sync_settings');
      const raw = await request<unknown>(store.get(key));
      const current = raw === undefined ? null : parseAutopilotStored(raw, key, validate);
      if ((current?.version ?? null) !== expectedVersion)
        throw new DomainError(
          'day_autopilot.settings_conflict',
          'Настройки изменились в другом окне. Ваш текст сохранён в форме; обновите настройки перед повторным сохранением.',
        );
      const saved: AutopilotStored<T> = {
        schemaVersion: 1,
        version: (expectedVersion ?? 0) + 1,
        value: valid,
      };
      store.put({ id: key, ...saved });
      await completion;
      return saved;
    } catch (error: unknown) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already be closed. */
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }
}
