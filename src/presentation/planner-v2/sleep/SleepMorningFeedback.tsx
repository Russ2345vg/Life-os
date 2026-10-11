import { useId } from 'react';
import type {
  SleepMorningFeedback as MorningFeedback,
  SleepMorningFeedbackPatch,
} from '../../../domain/sleep/SleepMorningFeedback';
import { sleepQualityChoices, morningEnergyChoices } from './sleepMorningFeedbackModel';

export function SleepMorningFeedback({
  feedback,
  busy,
  disabledReason,
  status,
  error,
  onSelect,
  onClear,
  onRetry,
}: {
  readonly feedback: MorningFeedback | undefined;
  readonly busy: boolean;
  readonly disabledReason: string | null;
  readonly status: string | null;
  readonly error: string | null;
  readonly onSelect: (patch: SleepMorningFeedbackPatch) => void;
  readonly onClear: () => void;
  readonly onRetry: () => void;
}) {
  const headingId = useId();
  const reasonId = useId();
  const disabled = busy || disabledReason !== null;
  return (
    <section
      className="sleep-morning-feedback"
      aria-labelledby={headingId}
      aria-describedby={disabledReason ? reasonId : undefined}
    >
      <h3 id={headingId}>Как прошла ночь?</h3>
      <div className="sleep-morning-feedback__groups">
        <div>
          <p>Качество сна</p>
          <div className="planner-segments" role="group" aria-label="Качество сна">
            {sleepQualityChoices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                disabled={disabled}
                aria-pressed={feedback?.sleepQuality === choice.value}
                onClick={() => onSelect({ sleepQuality: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p>Самочувствие утром</p>
          <div className="planner-segments" role="group" aria-label="Самочувствие утром">
            {morningEnergyChoices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                disabled={disabled}
                aria-pressed={feedback?.energy === choice.value}
                onClick={() => onSelect({ energy: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {disabledReason ? (
        <p id={reasonId} className="sleep-morning-feedback__hint">
          {disabledReason}
        </p>
      ) : null}
      <div className="sleep-morning-feedback__footer">
        <div>
          {busy ? (
            <p role="status">Сохраняем оценку…</p>
          ) : error ? (
            <>
              <p role="alert">{error}</p>
              <button type="button" disabled={disabled} onClick={onRetry}>
                Повторить сохранение оценки
              </button>
            </>
          ) : status ? (
            <p role="status">{status}</p>
          ) : (
            <p className="sleep-morning-feedback__hint">
              Оценки можно сохранить отдельно от времени сна.
            </p>
          )}
        </div>
        {feedback ? (
          <button type="button" disabled={disabled} onClick={onClear}>
            Сбросить оценку
          </button>
        ) : null}
      </div>
    </section>
  );
}
