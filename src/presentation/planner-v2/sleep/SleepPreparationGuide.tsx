import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { NightCycle } from '../../../domain/sleep/SleepSchedule';
import {
  selectPreparationStep,
  startPreparationTimer,
  pausePreparationTimer,
  resumePreparationTimer,
  preparationTimerRemaining,
  type PreparationTimer,
} from './sleepPreparationGuideModel';
import './sleep-preparation-guide.css';

export function SleepPreparationGuide({
  cycle,
  busy,
  onComplete,
  onFinish,
  stretchingItemId,
  stretchingMinutes,
  children,
}: {
  readonly cycle: NightCycle;
  readonly busy: boolean;
  readonly onComplete: (id: string) => void;
  readonly onFinish: () => void;
  readonly children?: ReactNode;
  readonly stretchingItemId: string | null;
  readonly stretchingMinutes: number;
}) {
  const [active, setActive] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = selectPreparationStep(cycle);
  useEffect(() => {
    if (active) heading.current?.focus({ preventScroll: true });
  }, [active, step.current?.id]);
  const finishedLabel =
    cycle.preparationCompletionKind === 'ALL_DONE'
      ? 'Подготовка выполнена'
      : cycle.preparationCompletionKind === 'SKIPPED_TODAY'
        ? 'Подготовка пропущена на сегодня'
        : 'Подготовка завершена с пропусками';
  return (
    <>
      <section
        className={`sleep-guide${active ? ' sleep-guide--active' : ''}`}
        aria-label="Пошаговая подготовка"
      >
        {!active ? (
          <div className="sleep-guide__start">
            <span>
              {step.current
                ? 'Пройдите подготовку по одному шагу'
                : step.total === 0
                  ? 'Добавьте пункты подготовки в список'
                  : finishedLabel}
            </span>
            {step.current ? (
              <button type="button" disabled={busy} onClick={() => setActive(true)}>
                Начать подготовку
              </button>
            ) : null}
          </div>
        ) : step.current ? (
          <>
            <p className="planner-eyebrow">
              {step.current.groupTitle} · Выполнено {step.done} из {step.total}
            </p>
            <h3 ref={heading} tabIndex={-1}>
              {step.current.title}
            </h3>
            {step.current.id === stretchingItemId ? (
              <SleepPreparationStepTimer
                key={`${step.current.id}:${stretchingMinutes}`}
                minutes={stretchingMinutes}
              />
            ) : null}
            {step.next ? (
              <p className="sleep-guide__next">Далее: {step.next.title}</p>
            ) : (
              <p className="sleep-guide__next">Это последний пункт подготовки.</p>
            )}
            <div className="sleep-guide__actions">
              <button
                type="button"
                className="planner-primary"
                disabled={busy}
                onClick={() => onComplete(step.current!.id)}
              >
                {busy ? 'Сохраняем…' : 'Готово — следующий'}
              </button>
              <button type="button" disabled={busy} onClick={onFinish}>
                Завершить с пропусками
              </button>
              <button type="button" disabled={busy} onClick={() => setActive(false)}>
                К списку
              </button>
            </div>
          </>
        ) : (
          <>
            <p role="status">{finishedLabel}</p>
            <button type="button" onClick={() => setActive(false)}>
              К списку
            </button>
          </>
        )}
      </section>
      {active ? null : children}
    </>
  );
}

function SleepPreparationStepTimer({ minutes }: { readonly minutes: number }) {
  const [timer, setTimer] = useState<PreparationTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const duration = Number(minutes);
  const valid = Number.isInteger(duration) && duration >= 1 && duration <= 120;
  const remaining = timer ? preparationTimerRemaining(timer, now) : valid ? duration * 60_000 : 0;
  const seconds = Math.ceil(remaining / 1000);
  const expired = timer !== null && remaining === 0;
  const running = timer?.deadline != null && !expired;
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running]);
  return (
    <div className="sleep-guide__timer" role="group" aria-label="Таймер растяжки">
      <span>Растяжка · {minutes} мин</span>
      {!valid ? <p role="alert">Выберите от 1 до 120 целых минут.</p> : null}
      <output aria-label="Осталось времени" aria-live="off">
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
      </output>
      <div className="sleep-guide__actions">
        {timer === null ? (
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              const at = Date.now();
              setNow(at);
              setTimer(startPreparationTimer(duration, at));
            }}
          >
            Запустить таймер
          </button>
        ) : expired ? null : running ? (
          <button
            type="button"
            onClick={() => {
              const at = Date.now();
              setNow(at);
              setTimer(pausePreparationTimer(timer, at));
            }}
          >
            Пауза
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const at = Date.now();
              setNow(at);
              setTimer(resumePreparationTimer(timer, at));
            }}
          >
            Продолжить таймер
          </button>
        )}
        {timer !== null ? (
          <button type="button" onClick={() => setTimer(null)}>
            Сбросить таймер
          </button>
        ) : null}
      </div>
      {expired ? (
        <p role="status">Время вышло. Отметьте пункт, когда он будет готов.</p>
      ) : (
        <small>Таймер не отмечает выполнение. При выходе из режима он сбросится.</small>
      )}
    </div>
  );
}
