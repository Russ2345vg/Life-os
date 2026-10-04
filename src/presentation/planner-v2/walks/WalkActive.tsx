import { useEffect, useState } from 'react';
import type { Walk } from '../../../domain/walk/Walk';
import type { WalkCapture } from '../../../domain/walk-capture/WalkCapture';
import type { WalkServices } from '../../../application/walk/WalkServices';
import { AppIcon } from '../../components/AppIcon';
import { WalkCaptureComposer } from './WalkCaptureComposer';
import { useWalkMutation, walkDuration, walkError, walkIntentLabel } from './useWalkState';
import { getWalkPrompt } from '../../../application/walk/WalkGuidance';
import {
  getWalkReflectionStages,
  type WalkReflectionStage,
} from '../../../domain/walk/WalkReflectionTemplate';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';

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
  const [viewedStage, setViewedStage] = useState<WalkReflectionStage | null>(null);
  const stages = walk.reflectionTemplate ? getWalkReflectionStages(walk.reflectionTemplate) : [];
  const stage = viewedStage ?? walk.reflectionStage;
  const stageIndex = stage ? stages.indexOf(stage) : -1;
  const currentIndex = walk.reflectionStage ? stages.indexOf(walk.reflectionStage) : -1;
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
      <section
        className={`walk-panel walk-session ${walk.status === 'paused' ? 'is-paused' : ''} ${stage ? 'is-reflection' : ''}`}
      >
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
        {walk.reflectionQuestion && !stage && (
          <details className="walk-guidance">
            <summary>Вопрос для размышления</summary>
            <p>{walk.reflectionQuestion}</p>
          </details>
        )}
        {stage && (
          <section className="walk-guidance walk-reflection-guide">
            {walk.reflectionQuestion && (
              <p className="walk-reflection-topic">{walk.reflectionQuestion}</p>
            )}
            <span className="walk-muted">
              Вопрос {stageIndex + 1} из {stages.length}
            </span>
            <h3>{getWalkPrompt(stage)}</h3>
            <WalkReflectionAnswer
              key={stage}
              walkId={walk.id.toString()}
              stage={stage}
              services={services}
              answer={captures.find((capture) => capture.promptStage === stage) ?? null}
            />
            <div className="walk-guidance-actions">
              {stageIndex > 0 && (
                <button onClick={() => setViewedStage(stages[stageIndex - 1]!)}>
                  К предыдущему вопросу
                </button>
              )}
              {currentIndex === -1 ? (
                <button onClick={() => setViewedStage(null)}>Закрыть ответы</button>
              ) : stageIndex < currentIndex ? (
                <button onClick={() => setViewedStage(stages[stageIndex + 1]!)}>
                  К следующему вопросу
                </button>
              ) : (
                <button
                  disabled={mutation.busy}
                  onClick={() => {
                    setViewedStage(null);
                    command('advance');
                  }}
                >
                  Дальше
                </button>
              )}
              {currentIndex !== -1 && (
                <button
                  disabled={mutation.busy}
                  onClick={() => {
                    setViewedStage(null);
                    command('disable');
                  }}
                >
                  Без подсказок
                </button>
              )}
            </div>
          </section>
        )}
        {!stage &&
          stages.length > 0 &&
          captures.some((capture) => capture.promptStage !== null) && (
            <button onClick={() => setViewedStage(stages[stages.length - 1]!)}>
              Посмотреть ответы
            </button>
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

function WalkReflectionAnswer({
  walkId,
  stage,
  services,
  answer,
}: {
  walkId: string;
  stage: WalkReflectionStage;
  services: WalkServices;
  answer: WalkCapture | null;
}) {
  const [text, setText] = useState(answer?.content ?? '');
  const [saved, setSaved] = useState(false);
  const mutation = useWalkMutation();
  return (
    <form
      className="walk-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        void mutation.perform(
          `answer:${walkId}:${stage}:${answer?.id ?? 'new'}:${text}`,
          (requestId) =>
            answer
              ? services.captures.update({
                  captureId: answer.id.toString(),
                  expectedVersion: answer.version,
                  requestId,
                  content: text,
                })
              : services.captures.capture({ walkId, requestId, content: text, promptStage: stage }),
          () => setSaved(true),
        );
      }}
    >
      <label htmlFor={`walk-answer-${stage}`}>Ответ на вопрос — необязательно</label>
      <VoiceTextArea
        id={`walk-answer-${stage}`}
        rows={3}
        maxLength={500}
        value={text}
        onValueChange={(value) => {
          setText(value);
          setSaved(false);
        }}
        placeholder="Можно записать мысль или просто идти дальше"
      />
      <button disabled={mutation.busy || !text.trim() || text.trim() === answer?.content}>
        Сохранить ответ
      </button>
      {mutation.error && <p role="alert">{mutation.error}</p>}
      {saved && <p role="status">Ответ сохранён</p>}
    </form>
  );
}
