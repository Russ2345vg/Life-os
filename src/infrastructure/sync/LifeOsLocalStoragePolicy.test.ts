import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../../application/evening-settings';
import { ACTION_LIST_FILTERS_STORAGE_KEY } from '../../app/settings/BrowserActionListFiltersStore';
import { LOCAL_SETTINGS_STORAGE_KEY } from '../../app/settings/BrowserLocalSettingsStore';
import { SIDEBAR_PREFERENCE_STORAGE_KEY } from '../../app/settings/BrowserSidebarPreferenceStore';
import { TODAY_ACTION_SELECTION_STORAGE_KEY } from '../../app/settings/BrowserTodayActionSelectionStore';
import {
  LIFE_OS_LOCAL_STORAGE_POLICY,
  LIFE_OS_LOCAL_STORAGE_SYNC_ALLOWLIST,
  classifyLifeOsLocalStorageKey,
  projectMeaningfulLocalSettings,
} from './LifeOsLocalStoragePolicy';

const SYSTEM_UPDATE_KEY = 'lifeos.system-update.last-check';

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
      {
        key: SIDEBAR_PREFERENCE_STORAGE_KEY,
        classification: 'ui_local_only',
        meaningfulFields: [],
      },
      {
        key: TODAY_ACTION_SELECTION_STORAGE_KEY,
        classification: 'ui_local_only',
        meaningfulFields: [],
      },
      {
        key: ACTION_LIST_FILTERS_STORAGE_KEY,
        classification: 'ui_local_only',
        meaningfulFields: [],
      },
      {
        key: SYSTEM_UPDATE_KEY,
        classification: 'technical_local_only',
        meaningfulFields: [],
      },
    ]);
    expect(classifyLifeOsLocalStorageKey(LOCAL_SETTINGS_STORAGE_KEY)).toBe('sync_now');
    expect(classifyLifeOsLocalStorageKey(SYSTEM_UPDATE_KEY)).toBe('technical_local_only');
    expect(classifyLifeOsLocalStorageKey(SIDEBAR_PREFERENCE_STORAGE_KEY)).toBe('ui_local_only');
    expect(classifyLifeOsLocalStorageKey(TODAY_ACTION_SELECTION_STORAGE_KEY)).toBe('ui_local_only');
    expect(classifyLifeOsLocalStorageKey(ACTION_LIST_FILTERS_STORAGE_KEY)).toBe('ui_local_only');
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
