import { useCallback, useEffect, useRef, useState, type DragEvent, type RefObject } from 'react';
import { isGoalStatus, type Goal, type GoalStatus } from '../../domain';
import { canDropGoal, createGoalTouchGesture, GOAL_TOUCH_HOLD_MS } from './plannerGoalDrag';
import type { PlannerViews } from './plannerViewsModel';

interface TouchDrag {
  goalId: string;
  identifier: number;
  x: number;
  y: number;
  active: boolean;
  holdTimer: number | null;
  scrollTimer: number | null;
  gesture: ReturnType<typeof createGoalTouchGesture>;
}

function statusAt(x: number, y: number): GoalStatus | null {
  const status = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-goal-status]')
    ?.dataset.goalStatus;
  return isGoalStatus(status) ? status : null;
}

export function usePlannerGoalDrag(
  boardRef: RefObject<HTMLDivElement | null>,
  data: PlannerViews,
  busy: boolean,
  onGoalStatus: (goal: Goal, status: GoalStatus) => Promise<void>,
  enabled: boolean,
) {
  const touchRef = useRef<TouchDrag | null>(null);
  const sourceRef = useRef<string | null>(null);
  const suppressClickUntil = useRef(0);
  const latest = useRef({ data, busy, onGoalStatus });
  useEffect(() => {
    latest.current = { data, busy, onGoalStatus };
  }, [data, busy, onGoalStatus]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<GoalStatus | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    sourceRef.current = null;
    setDraggedId(null);
    setTargetStatus(null);
    setPoint(null);
  };
  const commit = useCallback((goalId: string, status: GoalStatus | null) => {
    const current = latest.current;
    const goal = current.data.goalById.get(goalId);
    if (!goal || !status || current.busy || !canDropGoal(goal.status, status)) return;
    setError(null);
    void current.onGoalStatus(goal, status).catch(() => {
      // The original Goal stays in its column until persistence and reload succeed.
      setError('Не удалось перенести цель. Повторите попытку.');
    });
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !enabled) return;
    const stop = () => {
      const drag = touchRef.current;
      if (!drag) return;
      if (drag.holdTimer !== null) window.clearTimeout(drag.holdTimer);
      if (drag.scrollTimer !== null) window.clearInterval(drag.scrollTimer);
      touchRef.current = null;
      sourceRef.current = null;
      setDraggedId(null);
      setTargetStatus(null);
      setPoint(null);
    };
    const update = (drag: TouchDrag) => {
      const goal = latest.current.data.goalById.get(drag.goalId);
      const status = statusAt(drag.x, drag.y);
      setTargetStatus(goal && status && canDropGoal(goal.status, status) ? status : null);
      setPoint({ x: drag.x, y: drag.y });
    };
    const onStart = (event: TouchEvent) => {
      if (touchRef.current || event.touches.length !== 1 || latest.current.busy) return;
      if (!(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>('[data-goal-id]');
      if (!card || event.target.closest('button, select, summary, details')) return;
      const goalId = card.dataset.goalId;
      const goal = goalId && latest.current.data.goalById.get(goalId);
      if (!goal || goal.status === 'archived') return;
      const touch = event.changedTouches.item(0);
      if (!touch) return;
      const drag: TouchDrag = {
        goalId: goal.id.toString(),
        identifier: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        active: false,
        holdTimer: null,
        scrollTimer: null,
        gesture: createGoalTouchGesture(touch.clientX, touch.clientY),
      };
      drag.holdTimer = window.setTimeout(() => {
        if (touchRef.current !== drag) return;
        if (drag.gesture.hold() !== 'drag') return;
        drag.active = true;
        sourceRef.current = drag.goalId;
        suppressClickUntil.current = Date.now() + 700;
        setDraggedId(drag.goalId);
        update(drag);
        drag.scrollTimer = window.setInterval(() => {
          const bounds = board.getBoundingClientRect();
          if (drag.x < bounds.left + 36) board.scrollLeft -= 12;
          if (drag.x > bounds.right - 36) board.scrollLeft += 12;
          update(drag);
        }, 24);
      }, GOAL_TOUCH_HOLD_MS);
      touchRef.current = drag;
    };
    const onMove = (event: TouchEvent) => {
      const drag = touchRef.current;
      if (!drag) return;
      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === drag.identifier,
      );
      if (!touch) return;
      drag.x = touch.clientX;
      drag.y = touch.clientY;
      if (!drag.active) {
        if (drag.gesture.move(drag.x, drag.y) === 'scroll') stop();
        return;
      }
      drag.gesture.move(drag.x, drag.y);
      event.preventDefault();
      update(drag);
    };
    const onEnd = (event: TouchEvent) => {
      const drag = touchRef.current;
      if (!drag) return;
      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === drag.identifier,
      );
      if (!touch) return;
      if (drag.gesture.end()) {
        suppressClickUntil.current = Date.now() + 700;
        commit(drag.goalId, statusAt(touch.clientX, touch.clientY));
      }
      stop();
    };
    board.addEventListener('touchstart', onStart, { passive: true });
    board.addEventListener('touchmove', onMove, { passive: false });
    board.addEventListener('touchend', onEnd);
    board.addEventListener('touchcancel', stop);
    return () => {
      stop();
      board.removeEventListener('touchstart', onStart);
      board.removeEventListener('touchmove', onMove);
      board.removeEventListener('touchend', onEnd);
      board.removeEventListener('touchcancel', stop);
    };
  }, [boardRef, enabled, commit]);

  return {
    draggedId,
    targetStatus,
    point,
    error,
    draggedGoal: draggedId ? data.goalById.get(draggedId) : undefined,
    suppressClick(event: { preventDefault: () => void; stopPropagation: () => void }) {
      if (Date.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    },
    suppressContextMenu(event: { preventDefault: () => void }) {
      if (touchRef.current?.active) event.preventDefault();
    },
    startDesktop(goal: Goal, event: DragEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest('button, select, summary, details')
      ) {
        event.preventDefault();
        return;
      }
      sourceRef.current = goal.id.toString();
      setDraggedId(goal.id.toString());
      setError(null);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', goal.id.toString());
    },
    endDesktop() {
      suppressClickUntil.current = Date.now() + 250;
      clear();
    },
    overDesktop(status: GoalStatus, event: DragEvent) {
      const goal = sourceRef.current && data.goalById.get(sourceRef.current);
      if (!goal || !canDropGoal(goal.status, status)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setTargetStatus(status);
    },
    leaveDesktop(event: DragEvent) {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setTargetStatus(null);
    },
    dropDesktop(status: GoalStatus, event: DragEvent) {
      event.preventDefault();
      const source = sourceRef.current;
      if (source) commit(source, status);
      clear();
    },
  };
}
