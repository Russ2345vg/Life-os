import { describe, expect, it } from 'vitest';
import {
  advancePomodoro,
  createPomodoro,
  pomodoroRemaining,
  startPomodoroPhase,
} from './ActionPomodoroCycle';

describe('action pomodoro phases', () => {
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
