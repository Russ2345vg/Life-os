import { EveningVisualIcon } from '../components/EveningVisualIcon';
import '../styles/evening-final-scenes.css';
import type {
  EveningRecoverySceneModel,
  EveningShutdownSceneModel,
  EveningTomorrowPreview,
} from './EveningFinalPresentation';

export type ShutdownSceneError = Readonly<{
  kind: 'blocking' | 'technical';
  message: string;
}>;

interface EveningShutdownSceneProps {
  readonly model: EveningShutdownSceneModel;
  readonly isSubmitting: boolean;
  readonly error: ShutdownSceneError | null;
  readonly readOnly?: boolean;
  readonly onComplete: () => void;
  readonly onResolveBlocker: () => void;
}

export function EveningShutdownScene({
  model,
  isSubmitting,
  error,
  readOnly = false,
  onComplete,
  onResolveBlocker,
}: EveningShutdownSceneProps) {
  if (error?.kind === 'blocking') {
    return (
      <section
        className="evening-final-scene evening-shutdown-blocking"
        aria-labelledby="shutdown-blocking-title"
      >
        <span className="evening-shutdown-blocking-mark" aria-hidden="true">
          !
        </span>
        <div className="evening-shutdown-blocking-copy">
          <p className="evening-final-kicker">Завершение дня</p>
          <h3 id="shutdown-blocking-title">День пока нельзя закрыть</h3>
          <p>{error.message}</p>
          <button className="secondary-button" type="button" onClick={onResolveBlocker}>
            Разобрать <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`evening-final-scene evening-shutdown-scene is-${model.tone}`}
      aria-labelledby="evening-shutdown-title"
    >
      <div className="evening-shutdown-workspace">
        <div className="evening-shutdown-visual-panel">
          <ShutdownVisual />
        </div>

        <div className="evening-shutdown-content">
          <header className="evening-final-hero evening-shutdown-heading">
            <p className="evening-final-kicker">Завершение</p>
            <h3 id="evening-shutdown-title">{model.title}</h3>
            <p>{model.lead}</p>
          </header>

          {model.facts.length === 0 ? null : <ReadinessList facts={model.facts} />}
          <TomorrowPreview preview={model.tomorrow} variant="shutdown" />

          {model.note === null ? null : <p className="evening-final-note">{model.note}</p>}

          {error === null ? null : (
            <p className="evening-final-command-error" role="alert">
              {error.message}
            </p>
          )}

          {readOnly ? (
            <p className="evening-shutdown-archived-note">
              <EveningVisualIcon name="check" size={17} />
              Итог завершения сохранён
            </p>
          ) : (
            <>
              <button
                className="primary-button evening-complete-day-action"
                type="button"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                onClick={onComplete}
              >
                <EveningVisualIcon name="check" size={20} />
                {isSubmitting ? 'Завершаем день…' : error === null ? 'Завершить день' : 'Повторить'}
              </button>
              <p className="evening-shutdown-aftercare">
                <span aria-hidden="true">i</span>
                После завершения дня откроется режим восстановления.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

interface EveningRecoverySceneProps {
  readonly model: EveningRecoverySceneModel;
  readonly onClose: () => void;
}

export function EveningRecoveryScene({ model, onClose }: EveningRecoverySceneProps) {
  return (
    <section
      className="evening-final-scene evening-recovery-scene"
      aria-labelledby="evening-recovery-title"
    >
      <section className="evening-recovery-overview">
        <div className="evening-recovery-visual-panel">
          <RecoveryVisual />
        </div>
        <div className="evening-recovery-content">
          <header className="evening-recovery-summary">
            <h3 id="evening-recovery-title">День завершён</h3>
            <p className="evening-final-date">{model.dateLabel}</p>
            <p className="evening-recovery-lead">{model.lead}</p>
          </header>
          <TomorrowPreview preview={model.tomorrow} variant="recovery" />
        </div>
      </section>

      <section className="evening-recovery-state" aria-labelledby="evening-recovery-state-title">
        <span className="evening-recovery-state-icon" aria-hidden="true">
          <EveningVisualIcon name="moon" size={32} />
        </span>
        <div className="evening-recovery-state-copy">
          <h4 id="evening-recovery-state-title">Восстановление</h4>
          <p>Рабочий день закрыт. Сон, тишина и восстановление сейчас важнее новых решений.</p>
        </div>
        <ul aria-label="Режим восстановления">
          <li>
            <EveningVisualIcon name="check" size={15} />
            Дайте телу отдых
          </li>
          <li>
            <EveningVisualIcon name="check" size={15} />
            Снизьте нагрузку на разум
          </li>
          <li>
            <EveningVisualIcon name="check" size={15} />
            Проснитесь с ясностью
          </li>
        </ul>
      </section>

      <button className="evening-recovery-close" type="button" onClick={onClose}>
        Закрыть
      </button>
    </section>
  );
}

function ShutdownVisual() {
  return (
    <span className="evening-shutdown-visual" aria-hidden="true">
      <span className="evening-shutdown-visual-core">
        <EveningVisualIcon name="check" size={52} />
      </span>
    </span>
  );
}

function RecoveryVisual() {
  return (
    <span className="evening-recovery-visual" aria-hidden="true">
      <span className="evening-recovery-stars" />
      <EveningVisualIcon name="moon" size={58} className="evening-recovery-moon" />
      <span className="evening-recovery-mountains is-far" />
      <span className="evening-recovery-mountains is-near" />
      <span className="evening-recovery-reflection" />
      <span className="evening-recovery-check">
        <EveningVisualIcon name="check" size={29} />
      </span>
    </span>
  );
}

function ReadinessList({ facts }: { readonly facts: readonly string[] }) {
  return (
    <section className="evening-shutdown-readiness" aria-labelledby="evening-final-status-title">
      <h4 id="evening-final-status-title">Готовность сегодня</h4>
      <ul className="evening-final-facts" aria-label="Итог вечера">
        {facts.map((fact) => (
          <li key={fact}>
            <span aria-hidden="true">
              <EveningVisualIcon name="check" size={14} />
            </span>
            {fact}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TomorrowPreview({
  preview,
  variant,
}: {
  readonly preview: EveningTomorrowPreview;
  readonly variant: 'shutdown' | 'recovery';
}) {
  if (preview.primaryDecisionTitle === null && preview.firstStepTitle === null) return null;

  const titleId = `evening-final-tomorrow-${variant}-title`;

  return (
    <section
      className={`evening-final-card evening-final-tomorrow is-${variant}`}
      aria-labelledby={titleId}
    >
      <div
        className={`evening-final-tomorrow-heading${variant === 'recovery' ? ' visually-hidden' : ''}`}
      >
        {variant === 'shutdown' ? <EveningVisualIcon name="sun" size={25} /> : null}
        <h4 id={titleId}>Завтра</h4>
      </div>
      <dl>
        {preview.primaryDecisionTitle === null ? null : (
          <div className="evening-final-tomorrow-primary">
            <dt>
              {variant === 'recovery' ? <EveningVisualIcon name="calendar" size={21} /> : null}
              <span>Главное завтра</span>
            </dt>
            <dd>{preview.primaryDecisionTitle}</dd>
          </div>
        )}
        {preview.firstStepTitle === null ? null : (
          <div className="evening-final-tomorrow-step">
            <dt>
              {variant === 'recovery' ? <EveningVisualIcon name="target" size={21} /> : null}
              <span>Первый шаг</span>
            </dt>
            <dd>{preview.firstStepTitle}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
