import { describe, expect, it } from 'vitest';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
  validateAutopilotPreferences,
  validateAutopilotDayDraft,
} from './AutopilotPreferences';
import { captureAutopilotTemplate, applyAutopilotTemplate } from './AutopilotOrganization';
describe('autopilot organization settings', () => {
  it('applies a template without copying another day or overriding global action rules and pins', () => {
    const oldPrefs = {
      ...defaultAutopilotPreferences(),
      actionRules: [{ actionId: 'a', context: null, prerequisiteIds: ['b'] }],
    };
    const template = captureAutopilotTemplate('t', 'Дом', oldPrefs, {
      ...defaultAutopilotDayDraft('2026-10-10'),
      startMinute: 600,
      endMinute: 1200,
      pinnedWindows: [{ actionId: 'a', startMinute: 600, durationMinutes: 30 }],
    });
    const prefs = {
      ...defaultAutopilotPreferences(),
      actionRules: [{ actionId: 'c', context: 'Дом', prerequisiteIds: [] }],
      templates: [template],
    };
    const draft = {
      ...defaultAutopilotDayDraft('2026-10-11'),
      pinnedWindows: [{ actionId: 'c', startMinute: 700, durationMinutes: 30 }],
    };
    const applied = applyAutopilotTemplate(template, prefs, draft);
    expect(applied.preferences.actionRules?.[0]?.actionId).toBe('c');
    expect(applied.draft).toMatchObject({
      date: '2026-10-11',
      startMinute: 600,
      endMinute: 1200,
      pinnedWindows: [{ actionId: 'c', startMinute: 700, durationMinutes: 30 }],
    });
    expect('actionRules' in template.options).toBe(false);
  });
  it('retains balance, grouping and prerequisite rules in saved preferences', () => {
    const value = {
      ...defaultAutopilotPreferences(),
      balance: [
        { directionId: 'invest', percent: 60 },
        { directionId: 'home', percent: 40 },
      ],
      groupSimilar: true,
      actionRules: [{ actionId: 'exam', context: 'Компьютер', prerequisiteIds: ['study'] }],
    };
    expect(validateAutopilotPreferences(value)).toMatchObject({
      balance: value.balance,
      groupSimilar: true,
      actionRules: value.actionRules,
    });
  });
  it.each([
    { balance: [{ directionId: 'a', percent: 80 }] },
    {
      balance: [
        { directionId: 'a', percent: 50 },
        { directionId: 'a', percent: 50 },
      ],
    },
    { actionRules: [{ actionId: 'a', context: null, prerequisiteIds: ['a'] }] },
    {
      actionRules: [
        { actionId: 'a', context: null, prerequisiteIds: ['b'] },
        { actionId: 'b', context: null, prerequisiteIds: ['a'] },
      ],
    },
  ])('rejects invalid balance or cyclic prerequisites: %j', (organization) => {
    expect(() =>
      validateAutopilotPreferences({ ...defaultAutopilotPreferences(), ...organization }),
    ).toThrow();
  });
  it('retains the exact pinned window for its day', () => {
    expect(
      validateAutopilotDayDraft({
        ...defaultAutopilotDayDraft('2026-10-11'),
        pinnedWindows: [{ actionId: 'study', startMinute: 540, durationMinutes: 60 }],
      }),
    ).toMatchObject({
      pinnedWindows: [{ actionId: 'study', startMinute: 540, durationMinutes: 60 }],
    });
  });
  it('rejects a pin extending into the next day', () => {
    expect(() =>
      validateAutopilotDayDraft({
        ...defaultAutopilotDayDraft('2026-10-11'),
        pinnedWindows: [{ actionId: 'study', startMinute: 1430, durationMinutes: 60 }],
      }),
    ).toThrow();
  });
  it('retains a named template and its settings without requiring new fields on old records', () => {
    const options = defaultAutopilotPreferences();
    const template = {
      id: 'template-invest',
      name: 'Инвестиции',
      options,
      startMinute: 540,
      endMinute: 1260,
      wishes: '',
      wishReferences: [],
    };
    expect(validateAutopilotPreferences({ ...options, templates: [template] })).toMatchObject({
      templates: [template],
    });
    expect(validateAutopilotPreferences(options)).toEqual(options);
  });
});
