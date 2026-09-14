import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LongPressController } from './LongPressController';
import './entity-context-menu.css';

export interface EntityMenuAction {
  readonly label: string;
  readonly run: () => Promise<void> | void;
  readonly destructive?: boolean;
}

export function EntityContextMenu({
  title,
  entityLabel,
  actions,
  children,
}: {
  readonly title: string;
  readonly entityLabel: string;
  readonly actions: readonly EntityMenuAction[];
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [confirm, setConfirm] = useState<EntityMenuAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const touchPointerActive = useRef(false);
  const openMenu = useCallback(() => {
    const top = root.current?.getBoundingClientRect().top ?? 0;
    const menuHeight = actions.length * 44 + 12;
    setAbove(window.innerHeight - top - 80 < menuHeight + 47 && top >= menuHeight);
    setOpen(true);
  }, [actions.length]);
  const gesture = useRef<LongPressController | null>(null);
  useEffect(() => {
    const controller = new LongPressController(openMenu);
    gesture.current = controller;
    return () => {
      controller.cancel();
      if (gesture.current === controller) gesture.current = null;
    };
  }, [openMenu]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (open || confirm)) {
        setOpen(false);
        setConfirm(null);
        moreButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, confirm]);
  useEffect(() => {
    if (confirm) cancelButton.current?.focus();
  }, [confirm]);
  const run = async (action: EntityMenuAction) => {
    if (action.destructive) {
      setConfirm(action);
      setOpen(false);
      return;
    }
    setBusy(true);
    setOpen(false);
    setError(null);
    try {
      await action.run();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  };
  if (actions.length === 0) return <div className="planner-entity-context">{children}</div>;
  return (
    <div
      ref={root}
      className="planner-entity-context"
      onContextMenu={(event) => {
        event.preventDefault();
        if (
          touchPointerActive.current ||
          ('pointerType' in event.nativeEvent && event.nativeEvent.pointerType === 'touch')
        )
          gesture.current?.suppressTouchContextClick();
        else gesture.current?.cancel();
        openMenu();
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch' || !event.isPrimary) return;
        touchPointerActive.current = true;
        gesture.current?.down(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => gesture.current?.move(event.clientX, event.clientY)}
      onPointerUp={() => {
        touchPointerActive.current = false;
        gesture.current?.end();
      }}
      onPointerCancel={() => {
        touchPointerActive.current = false;
        gesture.current?.cancel();
      }}
      onClickCapture={(event) => {
        if (!gesture.current?.consumeClick()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="planner-entity-content">{children}</div>
      <button
        ref={moreButton}
        className="planner-entity-more"
        type="button"
        aria-label={`Действия: ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          className={`planner-entity-popup${above ? ' planner-entity-popup--above' : ''}`}
          role="menu"
          aria-label={`Действия: ${title}`}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                void run(action);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {confirm && (
        <div
          className="planner-entity-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={`Подтвердить: ${confirm.label}`}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            if (event.shiftKey && document.activeElement === cancelButton.current) {
              event.preventDefault();
              confirmButton.current?.focus();
            } else if (!event.shiftKey && document.activeElement === confirmButton.current) {
              event.preventDefault();
              cancelButton.current?.focus();
            }
          }}
        >
          <p>
            {confirm.label} {entityLabel} «{title}»?
          </p>
          <div>
            <button
              ref={cancelButton}
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirm(null);
                moreButton.current?.focus();
              }}
            >
              Отмена
            </button>
            <button
              ref={confirmButton}
              type="button"
              className="planner-entity-danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void Promise.resolve()
                  .then(() => confirm.run())
                  .then(() => setConfirm(null))
                  .catch((reason: unknown) =>
                    setError(
                      reason instanceof Error ? reason.message : 'Не удалось удалить запись.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {confirm.label}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
    </div>
  );
}
