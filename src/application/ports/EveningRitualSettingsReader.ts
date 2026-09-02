import type { EveningRitualSettings } from '../evening-settings';

export interface EveningRitualSettingsReader {
  loadEveningRitualSettings(): EveningRitualSettings;
}
