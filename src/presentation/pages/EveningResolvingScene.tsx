import {
  OPEN_LOOP_RESOLUTION,
  type OpenLoopEntityType,
  type OpenLoopResolutionKind,
} from '../../domain';
import type { EveningReviewSnapshot } from '../../application';
import type { ReactNode } from 'react';
import { EveningVisualIcon } from '../components/EveningVisualIcon';
import {
  createEveningResolvingViewModel,
  pendingResolutionLabel,
  type EveningResolutionFeedback,
  type PendingOpenLoopResolution,
} from './EveningResolvingPresentation';

interface EveningResolvingSceneProps {
  readonly snapshot: EveningReviewSnapshot;
  readonly notes: Readonly<Record<string, string>>;
  readonly disabled: boolean;
  readonly now?: Date;
  readonly error: string | null;
  readonly feedback: EveningResolutionFeedback | null;
  readonly pendingResolution: PendingOpenLoopResolution | null;
  readonly preferredKey: string | null;
  readonly onNoteChange: (key: string, value: string) => void;
  readonly onResolve: (
    entityType: OpenLoopEntityType,
    entityId: string,
    resolution: OpenLoopResolutionKind,
  ) => void;
  readonly onReturnToWork: () => void;
  readonly onContinue: () => void;
  readonly onResolveOpenAction: (actionIds: readonly string[]) => void;
  readonly onRetry: () => void;
}

export function EveningResolvingScene({
  snapshot,
  notes,
  disabled,
  now = new Date(),
  error,
  feedback,
  pendingResolution,
  preferredKey,
  onNoteChange,
  onResolve,
  onReturnToWork,
  onContinue,
  onResolveOpenAction,
  onRetry,
}: EveningResolvingSceneProps) {
  const view = createEveningResolvingViewModel(snapshot, now, preferredKey);
  const current = view.current;

  if (current === null) {
    return (
      <TodaySceneFrame resolved={view.resolved} total={view.total} empty>
        <div className="evening-resolving-card-stage" aria-live="polite">
          <article className="evening-e9-card evening-e9-empty-card evening-today-object-card is-empty">
            <div className="evening-today-object-layout">
              <VisualIcon name="check" className="evening-today-object-icon is-confirmed" />
              <div className="evening-today-object-content">
                <header className="evening-today-object-heading">
                  <p className="evening-e9-card-type">Сегодня закрыто</p>
                  <h4>Ничего важного не осталось без решения.</h4>
                  <p className="evening-today-object-description">Всё необходимое учтено.</p>
                </header>
                <div className="evening-resolving-primary-actions evening-today-empty-actions">
                  <button
                    className="primary-button"
                    type="button"
                    aria-label="Продолжить →"
                    disabled={disabled}
                    onClick={onContinue}
                  >
                    <ButtonContent icon="arrow-right">Продолжить</ButtonContent>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </TodaySceneFrame>
    );
  }

  const note = notes[current.key] ?? '';
  if (current.kind === 'active-session') {
    return (
      <TodaySceneFrame resolved={view.resolved} total={view.total}>
        <div className="evening-resolving-card-stage" aria-live="polite">
          <article
            className="evening-e9-card evening-active-session-card evening-today-object-card is-active-session"
            key={current.key}
            data-item={current.key}
          >
            <div className="evening-today-object-layout">
              <VisualIcon name="clock" className="evening-today-object-icon" />
              <div className="evening-today-object-content">
                <header className="evening-today-object-heading">
                  <p className="evening-e9-card-type">Работа ещё идёт</p>
                  <h4>{current.title}</h4>
                  <ul className="evening-resolving-context" aria-label="Метаданные рабочей сессии">
                    <li>{current.sessionLabel}</li>
                    <li>{current.durationLabel}</li>
                  </ul>
                  <p className="evening-today-object-description">
                    Чтобы закрыть день, сначала определите состояние работы.
                  </p>
                </header>
                <ResolutionFeedback
                  feedback={feedback}
                  fallbackError={error}
                  disabled={disabled}
                  onResolveOpenAction={onResolveOpenAction}
                  onRetry={onRetry}
                />
                <div className="evening-session-actions evening-today-session-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onResolve(current.entityType, current.entityId, OPEN_LOOP_RESOLUTION.complete)
                    }
                  >
                    <ButtonContent icon="check">
                      {pendingLabel(
                        pendingResolution,
                        current.key,
                        OPEN_LOOP_RESOLUTION.complete,
                        'Завершить сессию',
                      )}
                    </ButtonContent>
                  </button>
                  <button className="secondary-button" type="button" onClick={onReturnToWork}>
                    <ButtonContent icon="arrow-right">Вернуться к работе</ButtonContent>
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </TodaySceneFrame>
    );
  }

  const supports = (resolution: OpenLoopResolutionKind) =>
    current.allowedResolutions.includes(resolution);
  return (
    <TodaySceneFrame resolved={view.resolved} total={view.total}>
      <div className="evening-resolving-card-stage" aria-live="polite">
        <article
          className="evening-e9-card evening-resolving-card evening-today-object-card"
          key={current.key}
          data-item={current.key}
        >
          <div className="evening-today-object-layout">
            <VisualIcon name="target" className="evening-today-object-icon" />
            <div className="evening-today-object-content">
              <header className="evening-today-object-heading">
                <p className="evening-e9-card-type">{current.typeLabel}</p>
                <h4>{current.title}</h4>
                <ul className="evening-resolving-context" aria-label="Метаданные элемента">
                  {current.context.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="evening-resolving-lead">{remainingMessage(view.remaining)}</p>
              </header>

              <label className="evening-resolving-note evening-today-result-field">
                <span>Короткий итог или причина</span>
                <input
                  value={note}
                  disabled={disabled}
                  required
                  placeholder="Несколько слов о результате"
                  onChange={(event) => onNoteChange(current.key, event.target.value)}
                />
              </label>
              <ResolutionFeedback
                feedback={feedback}
                fallbackError={error}
                disabled={disabled}
                onResolveOpenAction={onResolveOpenAction}
                onRetry={onRetry}
              />

              <div className="evening-resolving-primary-actions">
                <button
                  className="evening-resolving-complete"
                  type="button"
                  disabled={
                    disabled || !supports(OPEN_LOOP_RESOLUTION.complete) || note.trim().length === 0
                  }
                  onClick={() =>
                    onResolve(current.entityType, current.entityId, OPEN_LOOP_RESOLUTION.complete)
                  }
                >
                  <ButtonContent icon="check">
                    {pendingLabel(
                      pendingResolution,
                      current.key,
                      OPEN_LOOP_RESOLUTION.complete,
                      'Завершить',
                    )}
                  </ButtonContent>
                </button>
                <button
                  className="evening-resolving-carry"
                  type="button"
                  disabled={disabled || !supports(OPEN_LOOP_RESOLUTION.carryForward)}
                  onClick={() =>
                    onResolve(
                      current.entityType,
                      current.entityId,
                      OPEN_LOOP_RESOLUTION.carryForward,
                    )
                  }
                >
                  <ButtonContent icon="carry">
                    {pendingLabel(
                      pendingResolution,
                      current.key,
                      OPEN_LOOP_RESOLUTION.carryForward,
                      'Перенести',
                    )}
                  </ButtonContent>
                </button>
              </div>
              <div className="evening-resolving-secondary-actions">
                <button
                  type="button"
                  disabled={disabled || !supports(OPEN_LOOP_RESOLUTION.revise)}
                  onClick={() =>
                    onResolve(current.entityType, current.entityId, OPEN_LOOP_RESOLUTION.revise)
                  }
                >
                  <ButtonContent icon="pencil">
                    {pendingLabel(
                      pendingResolution,
                      current.key,
                      OPEN_LOOP_RESOLUTION.revise,
                      'Изменить',
                    )}
                  </ButtonContent>
                </button>
                <button
                  type="button"
                  disabled={disabled || !supports(OPEN_LOOP_RESOLUTION.drop)}
                  onClick={() =>
                    onResolve(current.entityType, current.entityId, OPEN_LOOP_RESOLUTION.drop)
                  }
                >
                  <ButtonContent icon="ban">
                    {pendingLabel(
                      pendingResolution,
                      current.key,
                      OPEN_LOOP_RESOLUTION.drop,
                      'Отказаться',
                    )}
                  </ButtonContent>
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </TodaySceneFrame>
  );
}

function TodaySceneFrame({
  resolved,
  total,
  empty = false,
  children,
}: {
  readonly resolved: number;
  readonly total: number;
  readonly empty?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={`evening-e9-scene evening-resolving-scene evening-today-scene${empty ? ' is-empty' : ''}`}
      aria-labelledby="today-title"
      data-scene-label="Сегодня · Решения"
    >
      <header className="evening-today-hero">
        <VisualIcon name="sun" className="evening-today-hero-icon" />
        <div className="evening-today-hero-copy">
          <h3 id="today-title">Сегодня</h3>
          <p>Закройте всё, что мешает завершить день</p>
        </div>
      </header>
      <div className="evening-today-divider" aria-hidden="true" />
      {children}
      <ResolvingProgress resolved={resolved} total={total} />
    </section>
  );
}

type TodayVisualIconName =
  'sun' | 'target' | 'check' | 'carry' | 'pencil' | 'ban' | 'clock' | 'arrow-right';

function VisualIcon({
  name,
  className,
}: {
  readonly name: TodayVisualIconName;
  readonly className: string;
}) {
  return (
    <span className={className} data-icon={name} aria-hidden="true">
      <EveningVisualIcon name={name} />
    </span>
  );
}

function ButtonContent({
  icon,
  children,
}: {
  readonly icon: TodayVisualIconName;
  readonly children: ReactNode;
}) {
  return (
    <span className="evening-button-content">
      <VisualIcon name={icon} className="evening-button-icon" />
      <span>{children}</span>
    </span>
  );
}

function ResolutionFeedback({
  feedback,
  fallbackError,
  disabled,
  onResolveOpenAction,
  onRetry,
}: {
  readonly feedback: EveningResolutionFeedback | null;
  readonly fallbackError: string | null;
  readonly disabled: boolean;
  readonly onResolveOpenAction: (actionIds: readonly string[]) => void;
  readonly onRetry: () => void;
}) {
  if (feedback?.kind === 'decision-has-open-actions') {
    return (
      <div className="evening-resolution-blocker" role="alert">
        <strong>{feedback.message}</strong>
        <p>{openActionsMessage(feedback.openActionIds.length)}</p>
        <button
          className="secondary-button"
          type="button"
          disabled={disabled}
          onClick={() => onResolveOpenAction(feedback.openActionIds)}
        >
          Разобрать действие →
        </button>
      </div>
    );
  }
  const message = feedback?.message ?? fallbackError;
  if (message === null || message === undefined) return null;
  return (
    <div className="form-error evening-resolution-error" role="alert">
      <span>{message}</span>
      {feedback?.kind === 'technical' ? (
        <button className="secondary-button" type="button" disabled={disabled} onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}

function pendingLabel(
  pending: PendingOpenLoopResolution | null,
  key: string,
  resolution: OpenLoopResolutionKind,
  defaultLabel: string,
): string {
  return pending?.key === key && pending.resolution === resolution
    ? pendingResolutionLabel(resolution, defaultLabel)
    : defaultLabel;
}

function openActionsMessage(count: number): string {
  if (count === 1) return '1 действие ещё не закрыто';
  if (count > 1 && count < 5) return `${count} действия ещё не закрыты`;
  return `${count} действий ещё не закрыты`;
}

function ResolvingProgress({
  resolved,
  total,
}: {
  readonly resolved: number;
  readonly total: number;
}) {
  const safeTotal = Math.max(0, total);
  const safeResolved = Math.min(Math.max(0, resolved), safeTotal);
  const segmentCount = Math.max(1, safeTotal);

  return (
    <div className="evening-resolving-progress" data-progress={`${safeResolved}/${safeTotal}`}>
      <span className="evening-resolving-progress-copy">
        Разобрано {safeResolved} из {safeTotal}
      </span>
      <div
        className="evening-resolving-progress-segments"
        role={safeTotal > 0 ? 'progressbar' : undefined}
        aria-label="Прогресс разбора"
        aria-valuemin={safeTotal > 0 ? 0 : undefined}
        aria-valuemax={safeTotal > 0 ? safeTotal : undefined}
        aria-valuenow={safeTotal > 0 ? safeResolved : undefined}
        aria-valuetext={safeTotal > 0 ? `${safeResolved} из ${safeTotal}` : undefined}
      >
        {Array.from({ length: segmentCount }, (_, index) => (
          <span
            className={`${index < safeResolved || safeTotal === 0 ? 'is-resolved' : 'is-pending'}${
              safeTotal === 0 ? ' is-empty' : ''
            }`}
            key={index}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

function remainingMessage(remaining: number): string {
  if (remaining === 1) return 'Остался 1 элемент, который требует решения';
  if (remaining > 1 && remaining < 5)
    return `Осталось ${remaining} элемента, которые требуют решения`;
  return `Осталось ${remaining} элементов, которые требуют решения`;
}
