import { useEffect, useRef, type ReactNode } from 'react';

/** Contextual editor. Native dialog provides focus trapping and restores the opener. */
export function PlannerSheet({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="planner-sheet"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className="planner-sheet-close"
        aria-label="Закрыть панель"
        onClick={onClose}
      >
        ×
      </button>
      {children}
    </dialog>
  );
}
