export function PlannerUnsavedChangesConfirmation({
  onContinue,
  onDiscard,
  continueLabel = 'Продолжить редактирование',
  discardLabel = 'Закрыть без сохранения',
}: {
  readonly onContinue: () => void;
  readonly onDiscard: () => void;
  readonly continueLabel?: string;
  readonly discardLabel?: string;
}) {
  return (
    <section
      className="planner-action-panel__confirm"
      role="alertdialog"
      aria-label="Несохранённые изменения"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onContinue();
        }
      }}
    >
      <p>Есть несохранённые изменения.</p>
      <div className="planner-inline-actions">
        <button type="button" onClick={onContinue} autoFocus>
          {continueLabel}
        </button>
        <button type="button" onClick={onDiscard}>
          {discardLabel}
        </button>
      </div>
    </section>
  );
}
