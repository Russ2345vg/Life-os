import { describe, expect, it } from 'vitest';
import {
  advancePomodoro,
  createPomodoro,
  pausePomodoro,
  readPomodoro,
  pomodoroRemaining,
  startPomodoroPhase,
} from './ActionPomodoroCycle';

describe('action pomodoro phases', () => {
  it('keeps custom durations across pause, reload and later cycles', () => {
    const settings = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20 };
    let cycle = startPomodoroPhase(createPomodoro('action', 'Read', settings), 1_000, 'session');
    cycle = readPomodoro(JSON.stringify(pausePomodoro(cycle, 61_000)))!;
    expect(cycle.remainingMs).toBe(49 * 60_000);
    cycle = startPomodoroPhase(cycle, 121_000);
    expect(cycle.deadline).toBe(121_000 + 49 * 60_000);
    cycle = advancePomodoro(cycle, cycle.deadline!);
    expect(cycle.remainingMs).toBe(10 * 60_000);
    expect(cycle.sessionId).toBeNull();
    cycle = advancePomodoro(cycle, cycle.deadline!);
    expect(cycle.remainingMs).toBe(50 * 60_000);
  });

  it('restores legacy snapshots with default settings and rejects invalid settings', () => {
    const legacy = JSON.stringify({
      actionId: 'a',
      title: 'Read',
      phase: 'paused',
      completedFocuses: 0,
      remainingMs: 60_000,
      deadline: null,
      sessionId: 's',
    });
    expect(readPomodoro(legacy)?.settings.focusMinutes).toBe(25);
    expect(() =>
      createPomodoro('a', 'Read', { focusMinutes: 0, shortBreakMinutes: 5, longBreakMinutes: 15 }),
    ).toThrow();
  });
  it('counts down a 25-minute focus from an absolute deadline', () => {
    const ready = createPomodoro('action', 'Read');
    const focus = startPomodoroPhase(ready, 1_000);
    expect(pomodoroRemaining(focus, 61_000)).toBe(24 * 60_000);
    expect(pomodoroRemaining(focus, 2_000_000)).toBe(0);
  });

  it('uses a long break after four completed focus intervals', () => {
    let cycle = createPomodoro('action', 'Read');
    for (let index = 0; index < 4; index += 1) {
      cycle = advancePomodoro(
        startPomodoroPhase(cycle, index * 2_000),
        index * 2_000 + 25 * 60_000,
      );
      expect(cycle.phase).toBe('break');
      expect(cycle.remainingMs).toBe(index === 3 ? 15 * 60_000 : 5 * 60_000);
      cycle = advancePomodoro(cycle, cycle.deadline!);
      expect(cycle.phase).toBe('ready');
    }
    expect(cycle.completedFocuses).toBe(4);
  });
});
