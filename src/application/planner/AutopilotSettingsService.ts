import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
  validateAutopilotPreferences,
  validateAutopilotDayDraft,
  type AutopilotPreferences,
  type AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import type { AutopilotSettingsStore, AutopilotStored } from '../ports/AutopilotSettingsStore';
export class AutopilotSettingsService {
  public constructor(private readonly store: AutopilotSettingsStore) {}
  public async getPreferences(): Promise<AutopilotStored<AutopilotPreferences>> {
    return (
      (await this.store.readPreferences()) ?? {
        schemaVersion: 1,
        version: 0,
        value: defaultAutopilotPreferences(),
      }
    );
  }
  public async getDraft(date: string): Promise<AutopilotStored<AutopilotDayDraft>> {
    const defaults = defaultAutopilotDayDraft(date);
    return (await this.store.readDraft(date)) ?? { schemaVersion: 1, version: 0, value: defaults };
  }
  public async savePreferences(
    value: AutopilotPreferences,
    expectedVersion: number,
  ): Promise<AutopilotStored<AutopilotPreferences>> {
    return this.store.writePreferences(
      validateAutopilotPreferences(value),
      expectedVersion === 0 ? null : expectedVersion,
    );
  }
  public async saveDraft(
    value: AutopilotDayDraft,
    expectedVersion: number,
  ): Promise<AutopilotStored<AutopilotDayDraft>> {
    return this.store.writeDraft(
      validateAutopilotDayDraft(value),
      expectedVersion === 0 ? null : expectedVersion,
    );
  }
}
