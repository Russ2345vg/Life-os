import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../../application/evening-settings';
import { LOCAL_SETTINGS_STORAGE_KEY } from '../../app/settings/BrowserLocalSettingsStore';
import {
  LIFE_OS_LOCAL_STORAGE_POLICY,
  LIFE_OS_LOCAL_STORAGE_SYNC_ALLOWLIST,
  classifyLifeOsLocalStorageKey,
  projectMeaningfulLocalSettings,
} from './LifeOsLocalStoragePolicy';

describe('LifeOS localStorage sync policy', () => {
  it('allows only the structured local-settings projection and denies unknown keys by default', () => {
    expect(LIFE_OS_LOCAL_STORAGE_SYNC_ALLOWLIST).toEqual([LOCAL_SETTINGS_STORAGE_KEY]);
    expect(classifyLifeOsLocalStorageKey('lifeos.unregistered')).toBe('deny_unknown');
  });

  it('classifies every currently discovered key explicitly', () => {
    expect(LIFE_OS_LOCAL_STORAGE_POLICY).toEqual([
      {
        key: LOCAL_SETTINGS_STORAGE_KEY,
        classification: 'sync_now',
        meaningfulFields: ['eveningRitual'],
      },
    ]);
    expect(classifyLifeOsLocalStorageKey(LOCAL_SETTINGS_STORAGE_KEY)).toBe('sync_now');
    expect(classifyLifeOsLocalStorageKey('lifeos.sidebar-collapsed.v1')).toBe('deny_unknown');
    expect(classifyLifeOsLocalStorageKey('lifeos.today-action-selection.v1')).toBe('deny_unknown');
    expect(classifyLifeOsLocalStorageKey('lifeos.action-list-filters.v1')).toBe('deny_unknown');
  });

  it('projects only validated evening ritual settings for a local safety snapshot', () => {
    const eveningRitual = {
      ...DEFAULT_EVENING_RITUAL_SETTINGS,
      notificationEnabled: true,
    };
    const raw = JSON.stringify({
      defaultSection: 'today',
      interfaceDensity: 'comfortable',
      reduceMotion: false,
      showMobileWeekday: true,
      eveningRitual,
    });

    expect(projectMeaningfulLocalSettings(raw)).toEqual({ eveningRitual });
    expect(projectMeaningfulLocalSettings('{invalid')).toBeNull();
    expect(projectMeaningfulLocalSettings(JSON.stringify({ eveningRitual: { wakeTime: 7 } }))).toBe(
      null,
    );
  });
});
