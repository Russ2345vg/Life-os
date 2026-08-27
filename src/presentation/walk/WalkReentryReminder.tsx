interface WalkReentryReminderProps {
  readonly onContinue: () => void;
  readonly error: string | null;
  readonly onRetry: () => void;
}

export function WalkReentryReminder({ onContinue, error, onRetry }: WalkReentryReminderProps) {
  return (
    <section className="walk-reentry-reminder" aria-label="Возвращение после прогулки">
      <span className="walk-reentry-reminder-marker" aria-hidden="true">
        ✓
      </span>
      <div className="walk-reentry-reminder-copy">
        <p>После прогулки</p>
        <strong>Завершить возвращение</strong>
        <span>Сохранён следующий спокойный шаг.</span>
      </div>
      {error === null ? (
        <button className="walk-reentry-reminder-action" type="button" onClick={onContinue}>
          Продолжить
        </button>
      ) : (
        <div className="walk-reentry-reminder-error" role="alert">
          <p>{error}</p>
          <button className="walk-reentry-reminder-retry" type="button" onClick={onRetry}>
            Повторить
          </button>
        </div>
      )}
    </section>
  );
}
