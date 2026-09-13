export const GOAL_TOUCH_HOLD_MS = 350;
export const GOAL_TOUCH_MOVE_PX = 8;

export function touchMovedForScroll(startX: number, startY: number, x: number, y: number): boolean {
  return Math.hypot(x - startX, y - startY) > GOAL_TOUCH_MOVE_PX;
}

export function createGoalTouchGesture(startX: number, startY: number) {
  let state: 'waiting' | 'scroll' | 'drag' | 'ended' = 'waiting';
  return {
    move(x: number, y: number) {
      if (state === 'waiting' && touchMovedForScroll(startX, startY, x, y)) state = 'scroll';
      return state;
    },
    hold() {
      if (state === 'waiting') state = 'drag';
      return state;
    },
    end() {
      const wasDrag = state === 'drag';
      state = 'ended';
      return wasDrag;
    },
  };
}

export function canDropGoal(sourceStatus: string, targetStatus: string): boolean {
  return sourceStatus !== 'archived' && sourceStatus !== targetStatus;
}
