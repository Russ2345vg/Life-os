import { APP_SECTION, type AppSection } from '../navigation/AppSection';
import {
  copyEveningRitualSettings,
  DEFAULT_EVENING_RITUAL_SETTINGS,
  type EveningRitualSettings,
} from '../../application/evening-settings';

export const INTERFACE_DENSITY = {
  comfortable: 'comfortable',
  compact: 'compact',
} as const;

export type InterfaceDensity = (typeof INTERFACE_DENSITY)[keyof typeof INTERFACE_DENSITY];

export interface LocalSettings {
  readonly defaultSection: AppSection;
  readonly interfaceDensity: InterfaceDensity;
  readonly reduceMotion: boolean;
  readonly showMobileWeekday: boolean;
  readonly eveningRitual: EveningRitualSettings;
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = Object.freeze({
  defaultSection: APP_SECTION.today,
  interfaceDensity: INTERFACE_DENSITY.comfortable,
  reduceMotion: false,
  showMobileWeekday: true,
  eveningRitual: DEFAULT_EVENING_RITUAL_SETTINGS,
});

export function copyLocalSettings(settings: LocalSettings): LocalSettings {
  return {
    defaultSection: settings.defaultSection,
    interfaceDensity: settings.interfaceDensity,
    reduceMotion: settings.reduceMotion,
    showMobileWeekday: settings.showMobileWeekday,
    eveningRitual: copyEveningRitualSettings(settings.eveningRitual),
  };
}

export function isAppSection(value: unknown): value is AppSection {
  return Object.values(APP_SECTION).some((section) => section === value);
}

export function isInterfaceDensity(value: unknown): value is InterfaceDensity {
  return Object.values(INTERFACE_DENSITY).some((density) => density === value);
}
