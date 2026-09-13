import { describe, expect, it } from 'vitest';
import { canDropGoal, createGoalTouchGesture, GOAL_TOUCH_HOLD_MS } from './plannerGoalDrag';

describe('Goal Kanban drag gesture', () => {
  it('keeps ordinary tap and early horizontal or vertical swipe out of drag', () => {
    expect(GOAL_TOUCH_HOLD_MS).toBeGreaterThan(300);
    expect(createGoalTouchGesture(100, 100).end()).toBe(false);
    const scrollPaths: [number, number][] = [
      [112, 100],
      [100, 112],
    ];
    for (const [x, y] of scrollPaths) {
      const gesture = createGoalTouchGesture(100, 100);
      expect(gesture.move(x, y)).toBe('scroll');
      expect(gesture.hold()).toBe('scroll');
      expect(gesture.end()).toBe(false);
    }
    const held = createGoalTouchGesture(100, 100);
    expect(held.move(104, 104)).toBe('waiting');
    expect(held.hold()).toBe('drag');
    expect(held.move(112, 100)).toBe('drag');
    expect(held.end()).toBe(true);
  });

  it('allows another column but never drags archived Goals or performs a no-op', () => {
    expect(canDropGoal('future', 'active')).toBe(true);
    expect(canDropGoal('future', 'future')).toBe(false);
    expect(canDropGoal('archived', 'active')).toBe(false);
  });
});
