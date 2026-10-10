import type {
  AutopilotPreferences,
  AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
export interface AutopilotStored<T> {
  readonly schemaVersion: 1;
  readonly version: number;
  readonly value: T;
}
export interface AutopilotSettingsStore {
  readPreferences(): Promise<AutopilotStored<AutopilotPreferences> | null>;
  readDraft(date: string): Promise<AutopilotStored<AutopilotDayDraft> | null>;
  writePreferences(
    value: AutopilotPreferences,
    expectedVersion: number | null,
  ): Promise<AutopilotStored<AutopilotPreferences>>;
  writeDraft(
    value: AutopilotDayDraft,
    expectedVersion: number | null,
  ): Promise<AutopilotStored<AutopilotDayDraft>>;
}
