import { useEffect, useState } from 'react';
import type { Walk } from '../../../domain/walk/Walk';
import type { WalkCapture } from '../../../domain/walk-capture/WalkCapture';
import type { WalkServices } from '../../../application/walk/WalkServices';
import { AppIcon } from '../../components/AppIcon';
import { WalkCaptureComposer } from './WalkCaptureComposer';
import { useWalkMutation, walkDuration, walkError, walkIntentLabel } from './useWalkState';
import { getWalkPrompt } from '../../../application/walk/WalkGuidance';

export function WalkActive({
  walk,
  services,
  captures,
  onFinished,
}: {
  walk: Walk;
  services: WalkServices;
  captures: readonly WalkCapture[];
  onFinished: (walk: Walk) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const mutation = useWalkMutation();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  let duration = '—';
  let timeError = '';
  try {
    duration = walkDuration(walk, now);
  } catch (error: unknown) {
    timeError = walkError(error);
  }
  const command = (
    operation: 'pause' | 'resume' | 'complete' | 'abandon' | 'advance' | 'disable',
  ) =>
    void mutation.perform(
      `${operation}:${walk.id}:${walk.version}`,
      (requestId) =>
        services.commands[operation]({
          walkId: walk.id.toString(),
          expectedVersion: walk.version,
          requestId,
        }),
      (next) => {
        if (next.status === 'completed' || next.status === 'abandoned') onFinished(next);
      },
    );
  return (
    <div className="walk-grid">
      <section className={`walk-panel walk-session ${walk.status === 'paused' ? 'is-paused' : ''}`}>
        <div className="walk-session-top">
          <span className="walk-label">
            <AppIcon name="walks" />
            {walkIntentLabel(walk)}
          </span>
          <span className="walk-state">
            <i />
            {walk.status === 'paused' ? 'На паузе' : 'Идёт прогулка'}
          </span>
        </div>
        <div className="walk-clock">
          <span className="walk-muted">Время прогулки</span>
          <div aria-label="Время прогулки">{duration}</div>
          <p>
            {walk.status === 'paused'
              ? 'Время на паузе не учитывается.'
              : walk.mode === 'timer'
                ? `Ориентир — ${walk.timerTargetMinutes} мин. Завершите, когда будете готовы.`
                : 'Без ограничения времени'}
          </p>
        </div>
        {(timeError || mutation.error) && <p role="alert">{timeError || mutation.error}</p>}
        <div className="walk-session-actions">
          <button
            disabled={mutation.busy}
            onClick={() => command(walk.status === 'paused' ? 'resume' : 'pause')}
          >
            {walk.status === 'paused' ? 'Продолжить' : 'Пауза'}
          </button>
          <button
            className="planner-primary"
            disabled={mutation.busy}
            onClick={() => command('complete')}
          >
            Завершить прогулку
          </button>
        </div>
        <p className="walk-session-hint">Можно убрать телефон и просто идти.</p>
        {walk.reflectionQuestion && (
          <details className="walk-guidance">
            <summary>Вопрос для размышления</summary>
            <p>{walk.reflectionQuestion}</p>
          </details>
        )}
        {walk.reflectionStage && (
          <section className="walk-guidance">
            <p>{getWalkPrompt(walk.reflectionStage)}</p>
            <button disabled={mutation.busy} onClick={() => command('advance')}>
              Дальше
            </button>
            <button disabled={mutation.busy} onClick={() => command('disable')}>
              Без подсказок
            </button>
          </section>
        )}
        <details className="walk-guidance">
          <summary>Другие действия</summary>
          <p>Прерывание сохранит время и мысли, но не засчитает прогулку завершённой.</p>
          <button disabled={mutation.busy} onClick={() => command('abandon')}>
            Прервать прогулку
          </button>
        </details>
      </section>
      <WalkCaptureComposer
        key={walk.id.toString()}
        services={services}
        walkId={walk.id.toString()}
        captures={captures}
      />
    </div>
  );
}
