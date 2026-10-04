import { useEffect, useState } from 'react';
import type { ActionSession, LifeAction } from '../../domain';
import {
  MORNING_FOCUS_MINIMUM_MS,
  MORNING_FOCUS_TARGET_MS,
  morningFocusWorkedMilliseconds,
  readMorningFocusLedger,
} from './MorningFocusLedger';
import './morning-focus.css';

export function MorningFocusCard({
  dateKey,
  action,
  sessions,
  onStart,
  unlocked = true,
}: {
  readonly dateKey: string;
  readonly action: LifeAction | null;
  readonly sessions: readonly ActionSession[] | null;
  readonly onStart?: ((action: LifeAction) => void) | undefined;
  readonly unlocked?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const interval = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const ledger =
    action && typeof window !== 'undefined'
      ? readMorningFocusLedger(window.localStorage, dateKey, action.id.toString())
      : null;
  const worked = morningFocusWorkedMilliseconds(ledger, sessions ?? [], now);
  const workedMinutes = Math.floor(worked / 60_000);
  const minimumReached = worked >= MORNING_FOCUS_MINIMUM_MS;
  const targetReached = worked >= MORNING_FOCUS_TARGET_MS;

  return (
    <section
      className="morning-focus"
      aria-labelledby="morning-focus-title"
      aria-disabled={!unlocked}
    >
      <div className="morning-focus__copy">
        <p className="planner-eyebrow">Утренний ритуал</p>
        <h2 id="morning-focus-title">Главная задача дня</h2>
        {action ? (
          <p className="morning-focus__action">{action.title.toString()}</p>
        ) : (
          <p className="planner-muted">Выберите главное действие в плане на сегодня.</p>
        )}
        <p className="planner-muted">25 минут работы · 5 минут отдыха</p>
        {!unlocked ? (
          <p className="planner-muted">Сначала завершите или пропустите зарядку.</p>
        ) : null}
      </div>
      {action && (
        <div className="morning-focus__progress" aria-live="polite">
          <strong>{workedMinutes} / 60 мин</strong>
          <progress
            value={Math.min(worked, MORNING_FOCUS_MINIMUM_MS)}
            max={MORNING_FOCUS_MINIMUM_MS}
          >
            {workedMinutes} из 60 минут
          </progress>
          <span>
            {targetReached
              ? 'Три полных интервала выполнены'
              : minimumReached
                ? 'Утренний минимум выполнен · можно закончить третий интервал'
                : 'Цель: 3 интервала · 75 минут работы'}
          </span>
        </div>
      )}
      {action && onStart && (
        <button
          className="planner-primary"
          type="button"
          disabled={!unlocked}
          onClick={() => onStart(action)}
        >
          {minimumReached ? 'Продолжить фокус' : worked > 0 ? 'Вернуться к фокусу' : 'Начать фокус'}
        </button>
      )}
    </section>
  );
}
