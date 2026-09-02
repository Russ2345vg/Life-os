import { describe, expect, it } from 'vitest';
import { RELAXATION_PRACTICE } from '../../domain';
import {
  DEFAULT_EVENING_RITUAL_SETTINGS,
  EVENING_RITUAL_ITEM_CATALOG,
  isEveningRitualSettings,
  parseEveningRitualSettings,
} from './EveningRitualSettings';

describe('EveningRitualSettings', () => {
  it('задаёт безопасные R8 defaults', () => {
    expect(DEFAULT_EVENING_RITUAL_SETTINGS).toMatchObject({
      targetSleepTime: '23:00',
      defaultRelaxationPractice: RELAXATION_PRACTICE.reading,
      defaultScreenFreeDuration: 25,
      adaptiveRelaxationEnabled: true,
      notificationEnabled: false,
      allowConsciousSkip: true,
    });
    expect(DEFAULT_EVENING_RITUAL_SETTINGS.requiredCoreItems).toHaveLength(4);
    expect(DEFAULT_EVENING_RITUAL_SETTINGS.items).toHaveLength(EVENING_RITUAL_ITEM_CATALOG.length);
  });

  it.each([
    ['target sleep time', { targetSleepTime: '24:00' }],
    ['required core minimum', { requiredCoreItems: ['ENVIRONMENT:SLEEP:DIM_LIGHTS'] }],
    ['screen-free minimum', { defaultScreenFreeDuration: 19 }],
    ['screen-free maximum', { defaultScreenFreeDuration: 31 }],
    [
      'item duration',
      {
        items: DEFAULT_EVENING_RITUAL_SETTINGS.items.map((item, index) =>
          index === 0 ? { ...item, recommendedDurationMinutes: 0 } : item,
        ),
      },
    ],
  ])('отклоняет invalid %s', (_label, patch) => {
    expect(isEveningRitualSettings({ ...DEFAULT_EVENING_RITUAL_SETTINGS, ...patch })).toBe(false);
  });

  it('сохраняет пользовательский порядок и дополняет новые catalog items', () => {
    const reversed = [...DEFAULT_EVENING_RITUAL_SETTINGS.items].reverse().slice(0, -1);

    const result = parseEveningRitualSettings({
      ...DEFAULT_EVENING_RITUAL_SETTINGS,
      items: reversed,
    });

    expect(result.recoveredFromInvalidValue).toBe(true);
    expect(result.settings.items.slice(0, reversed.length)).toEqual(reversed);
    expect(result.settings.items).toHaveLength(EVENING_RITUAL_ITEM_CATALOG.length);
  });
});
