import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LongPressController } from './LongPressController';
import './entity-context-menu.css';

export interface EntityMenuAction {
  readonly label: string;
  readonly run: () => Promise<void> | void;
  readonly destructive?: boolean;
  readonly prepare?: () => Promise<{
    readonly message: string;
    readonly confirmLabel?: string;
    readonly alternative?: { readonly label: string; readonly run: () => Promise<void> | void };
  }>;
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
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [confirm, setConfirm] = useState<{
    action: EntityMenuAction;
    message: string;
    confirmLabel: string;
    alternative?: { readonly label: string; readonly run: () => Promise<void> | void };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const openedAnchor = useRef<Readonly<{ top: number; left: number }> | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const touchPointerActive = useRef(false);
  const openMenu = useCallback(() => {
    if (working.current) return;
    const rect = moreButton.current?.getBoundingClientRect();
    openedAnchor.current = rect ? { top: rect.top, left: rect.left } : null;
    setPortalTarget(root.current?.closest('.planner-v2') ?? document.body);
    setOpen(true);
  }, []);
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
      if (event.key === 'Escape' && (open || confirm) && !working.current) {
        setOpen(false);
        setConfirm(null);
        moreButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      const initial = openedAnchor.current;
      const current = moreButton.current?.getBoundingClientRect();
      // A queued scroll from before opening must not close the menu or clear
      // the held-touch click suppression. Real movement and resize still cancel.
      if (
        event.type === 'scroll' &&
        initial &&
        current &&
        initial.top === current.top &&
        initial.left === current.left
      )
        return;
      gesture.current?.cancel();
      setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [open, confirm]);
  useLayoutEffect(() => {
    if (!open) openedAnchor.current = null;
    const menu = popup.current;
    const anchor = moreButton.current;
    if (!open || !menu || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    menu.style.maxHeight = `${Math.max(44, window.innerHeight - margin * 2)}px`;
    const bounds = menu.getBoundingClientRect();
    const below = rect.bottom + 4;
    const top =
      below + bounds.height <= window.innerHeight - margin ? below : rect.top - bounds.height - 4;
    menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - bounds.height - margin))}px`;
    menu.style.left = `${Math.max(margin, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - margin))}px`;
    menu.style.visibility = 'visible';
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (confirm) cancelButton.current?.focus();
  }, [confirm]);
  const run = async (action: EntityMenuAction) => {
    if (working.current) return;
    working.current = true;
    if (action.destructive) {
      setOpen(false);
      setBusy(true);
      setError(null);
      try {
        const prepared = await action.prepare?.();
        setConfirm({
          action,
          message: prepared?.message ?? `${action.label} «${title}»?`,
          confirmLabel: prepared?.confirmLabel ?? action.label,
          ...(prepared?.alternative ? { alternative: prepared.alternative } : {}),
        });
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : 'Не удалось проверить связи.');
      } finally {
        working.current = false;
        setBusy(false);
      }
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
      working.current = false;
      setBusy(false);
    }
  };
  if (actions.length === 0) return <div className="planner-entity-context">{children}</div>;
  return (
    <div
      ref={root}
      className="planner-entity-context"
      onContextMenu={(event) => {
        if (!root.current?.contains(event.target as Node) || confirm) return;
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
        if (!root.current?.contains(event.target as Node) || confirm) return;
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
      {open &&
        createPortal(
          <div
            ref={popup}
            className="planner-entity-popup"
            role="menu"
            aria-label={`Действия: ${title}`}
            onKeyDown={(event) => {
              const items = Array.from(
                popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
              );
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                        items.length;
                items[next]?.focus();
              } else if (event.key === 'Tab') {
                setOpen(false);
                moreButton.current?.focus();
              }
            }}
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
          </div>,
          portalTarget ?? document.body,
        )}
      {confirm &&
        createPortal(
          <div
            className="planner-entity-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label={`Подтвердить: ${confirm.action.label} ${entityLabel}`}
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
              {confirm.message}
              {error && (
                <span role="alert" className="planner-error">
                  {error}
                </span>
              )}
            </p>
            <div>
              <button
                ref={cancelButton}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (working.current) return;
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
                  if (working.current) return;
                  working.current = true;
                  setBusy(true);
                  setError(null);
                  void Promise.resolve()
                    .then(() =>
                      confirm.alternative ? confirm.alternative.run() : confirm.action.run(),
                    )
                    .then(() => {
                      setConfirm(null);
                      moreButton.current?.focus();
                    })
                    .catch((reason: unknown) =>
                      setError(
                        reason instanceof Error ? reason.message : 'Не удалось удалить запись.',
                      ),
                    )
                    .finally(() => {
                      working.current = false;
                      setBusy(false);
                    });
                }}
              >
                {confirm.alternative?.label ?? confirm.confirmLabel}
              </button>
            </div>
          </div>,
          portalTarget ?? document.body,
        )}
      {error && !confirm && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
    </div>
  );
}
