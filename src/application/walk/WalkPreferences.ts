import { DomainError } from '../../shared/errors/DomainError';

export const WALK_PREFERENCES_CHANGED = 'lifeos:walk-preferences-changed';

export interface WalkRegularityPreferences {
  readonly weeklyCount: number | null;
  readonly weeklyMinutes: number | null;
}
export interface WalkPreferencesStore {
  read(): Promise<WalkRegularityPreferences>;
  write(value: WalkRegularityPreferences): Promise<void>;
}
export class WalkPreferences {
  public constructor(private readonly store: WalkPreferencesStore) {}
  public get() {
    return this.store.read();
  }
  public async save(value: WalkRegularityPreferences): Promise<WalkRegularityPreferences> {
    if (!valid(value.weeklyCount, 7) || !valid(value.weeklyMinutes, 10080))
      throw new DomainError(
        'walk.invalid_preferences',
        'Укажите целую положительную цель: до 7 прогулок или до 10080 минут в неделю.',
      );
    await this.store.write(value);
    return value;
  }
}
function valid(value: number | null, maximum: number) {
  return value === null || (Number.isInteger(value) && value >= 1 && value <= maximum);
}
