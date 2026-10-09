import { describe, expect, it } from 'vitest';
import { LocalPomodoroPreferences } from './LocalPomodoroPreferences';
describe('local Pomodoro preferences', () => {
  it('persists chosen durations and falls back safely for corrupt stored settings', () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const preferences = new LocalPomodoroPreferences(storage);
    expect(preferences.read().focusMinutes).toBe(25);
    preferences.save({ focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20 });
    expect(new LocalPomodoroPreferences(storage).read().focusMinutes).toBe(50);
    raw = '{"focusMinutes":0}';
    expect(preferences.read().focusMinutes).toBe(25);
    raw = 'bad JSON';
    expect(preferences.read().shortBreakMinutes).toBe(5);
  });
  it('reports denied persistence instead of falsely confirming a save', () => {
    const preferences = new LocalPomodoroPreferences({
      getItem: () => null,
      setItem: () => {
        throw new Error('storage denied');
      },
    });
    expect(() =>
      preferences.save({ focusMinutes: 50, shortBreakMinutes: 5, longBreakMinutes: 15 }),
    ).toThrow('storage denied');
  });
});
