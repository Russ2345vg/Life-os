import { describe, expect, it } from 'vitest';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
  validateAutopilotPreferences,
  validateAutopilotDayDraft,
} from './AutopilotPreferences';

describe('autopilot input validation', () => {
  it('rejects invalid limits and non-whole minute durations', () => {
    for (const maxActions of [0, 13, 1.5])
      expect(() =>
        validateAutopilotPreferences({ ...defaultAutopilotPreferences(), maxActions }),
      ).toThrow();
    for (const morningMinutes of [-1, 0, 2.5, 1441])
      expect(() =>
        validateAutopilotPreferences({ ...defaultAutopilotPreferences(), morningMinutes }),
      ).toThrow();
  });
  it('requires valid dates, ordered explicit ranges and unique positive duration overrides', () => {
    const draft = defaultAutopilotDayDraft('2026-10-10');
    expect(() => validateAutopilotDayDraft({ ...draft, date: '2026-02-30' })).toThrow();
    expect(() =>
      validateAutopilotDayDraft({ ...draft, startMinute: 600, endMinute: 500 }),
    ).toThrow();
    expect(() =>
      validateAutopilotDayDraft({ ...draft, durationOverrides: [{ actionId: 'a', minutes: 0 }] }),
    ).toThrow();
    expect(() =>
      validateAutopilotDayDraft({
        ...draft,
        durationOverrides: [
          { actionId: 'a', minutes: 30 },
          { actionId: 'a', minutes: 40 },
        ],
      }),
    ).toThrow();
    expect(validateAutopilotDayDraft({ ...draft, startMinute: 0, endMinute: 1440 }).endMinute).toBe(
      1440,
    );
  });
});
