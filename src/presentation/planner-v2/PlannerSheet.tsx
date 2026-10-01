import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  clampPlannerSheetWidth,
  DEFAULT_PLANNER_SHEET_WIDTH,
  MAX_PLANNER_SHEET_WIDTH,
  MIN_PLANNER_SHEET_WIDTH,
  nextPlannerSheetWidthFromKey,
  PLANNER_SHEET_WIDTH_STORAGE_KEY,
  resizePlannerSheetFromPointer,
} from './PlannerSheetResize';
import { QuickAccessTrigger } from './QuickAccessContext';
import { acquirePlannerDialogScrollLock } from './PlannerDialogScrollLock';

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}

function initialWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_PLANNER_SHEET_WIDTH;
  try {
    const stored = Number(window.localStorage.getItem(PLANNER_SHEET_WIDTH_STORAGE_KEY));
    return clampPlannerSheetWidth(
      Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_PLANNER_SHEET_WIDTH,
      viewportWidth(),
    );
  } catch {
    return clampPlannerSheetWidth(DEFAULT_PLANNER_SHEET_WIDTH, viewportWidth());
  }
}

function saveWidth(width: number): void {
  try {
    window.localStorage.setItem(PLANNER_SHEET_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // A blocked localStorage must not prevent editing.
  }
}

/** Contextual editor. Native dialog provides focus trapping and restores the opener. */
export function PlannerSheet({
  title,
  onClose,
  children,
  quickAccess = false,
  lockScroll = quickAccess,
  initialFocus,
  returnFocus,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly quickAccess?: boolean;
  readonly lockScroll?: boolean;
  readonly initialFocus?: () => HTMLElement | null;
  readonly returnFocus?: () => HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialFocusRef = useRef(initialFocus);
  const returnFocusRef = useRef(returnFocus);
  useLayoutEffect(() => {
    initialFocusRef.current = initialFocus;
    returnFocusRef.current = returnFocus;
  }, [initialFocus, returnFocus]);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);
  const [width, setWidth] = useState(initialWidth);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const releaseScroll = lockScroll ? acquirePlannerDialogScrollLock(document) : () => undefined;
    element?.showModal();
    const target =
      initialFocusRef.current?.() ??
      element?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
      );
    target?.focus({ preventScroll: true });
    return () => {
      element?.close();
      releaseScroll();
      const restore = returnFocusRef.current?.() ?? opener;
      if (restore instanceof HTMLElement && restore.isConnected)
        restore.focus({ preventScroll: true });
    };
  }, [quickAccess, lockScroll]);
  useEffect(() => {
    const clampToViewport = () =>
      setWidth((current) => clampPlannerSheetWidth(current, viewportWidth()));
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, []);

  const resizeFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    const next = resizePlannerSheetFromPointer(
      current.startWidth,
      current.startX,
      event.clientX,
      viewportWidth(),
    );
    current.currentWidth = next;
    setWidth(next);
  };
  const finishResize = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    saveWidth(current.currentWidth);
  };
  const resizeFromKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = nextPlannerSheetWidthFromKey(width, event.key, viewportWidth());
    if (next === null) return;
    event.preventDefault();
    setWidth(next);
    saveWidth(next);
  };
  return (
    <dialog
      ref={dialog}
      className={`planner-sheet${quickAccess ? ' planner-quick-sheet' : ''}`}
      style={{ '--planner-sheet-width': `${width}px` } as CSSProperties}
      aria-label={title}
      onKeyDown={(event) => {
        if (quickAccess && event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {!quickAccess && (
        <div
          className="planner-sheet-resize"
          role="separator"
          aria-label="Изменить ширину панели"
          aria-orientation="vertical"
          aria-valuemin={MIN_PLANNER_SHEET_WIDTH}
          aria-valuemax={MAX_PLANNER_SHEET_WIDTH}
          aria-valuenow={width}
          aria-valuetext={`${width} пикселей`}
          tabIndex={0}
          onPointerDown={(event) => {
            if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
            drag.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startWidth: width,
              currentWidth: width,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={resizeFromPointer}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={resizeFromKeyboard}
        />
      )}
      {!quickAccess && (
        <div className="planner-sheet-quick">
          <QuickAccessTrigger compact />
        </div>
      )}
      <button
        type="button"
        className="planner-sheet-close"
        aria-label={quickAccess ? 'Закрыть быстрый доступ' : 'Закрыть панель'}
        onClick={onClose}
      >
        ×
      </button>
      {children}
    </dialog>
  );
}
