import type { OpenDayConflictSnapshot } from '../../application';
import { DayDate } from '../../domain';

interface OpenDayRecoveryPanelProps {
  readonly currentDate: DayDate;
  readonly snapshot: OpenDayConflictSnapshot;
  readonly selectedKeepOpenDayId: string | null;
  readonly isResolving: boolean;
  readonly error: string | null;
  readonly onSelectKeepOpenDay: (dayId: string | null) => void;
  readonly onResolve: () => void;
  readonly onRetry: () => void;
}

export function OpenDayRecoveryPanel({
  currentDate,
  snapshot,
  selectedKeepOpenDayId,
  isResolving,
  error,
  onSelectKeepOpenDay,
  onResolve,
  onRetry,
}: OpenDayRecoveryPanelProps) {
  const selectedClosesSessionDay =
    snapshot.unfinishedSessionDayId !== null &&
    selectedKeepOpenDayId !== snapshot.unfinishedSessionDayId.toString();
  const blocked = snapshot.hasOrphanedUnfinishedSession || selectedClosesSessionDay;
  const currentDayIsOpen = snapshot.openDays.some((item) => item.day.date.equals(currentDate));

  return (
    <section className="open-day-recovery" aria-labelledby="open-day-recovery-title">
      <div className="open-day-recovery-header">
        <div>
          <p className="section-kicker danger">Восстановление целостности</p>
          <h2 id="open-day-recovery-title">Обнаружено несколько активных дней</h2>
          <p>
            LifeOS остановил запуск нового дня, чтобы не создать ещё один конфликт. Выберите, какой
            день действительно нужно оставить открытым, либо безопасно закройте все конфликтующие
            дни.
          </p>
        </div>
        <span className="day-start-status day-start-status-error">
          {snapshot.openDays.length} активных
        </span>
      </div>

      <fieldset className="open-day-recovery-options" disabled={isResolving}>
        <legend>Как восстановить состояние</legend>
        <label className="open-day-recovery-option">
          <input
            type="radio"
            name="keep-open-day"
            checked={selectedKeepOpenDayId === null}
            onChange={() => onSelectKeepOpenDay(null)}
          />
          <span>
            <strong>Закрыть все конфликтующие дни</strong>
            <small>
              {currentDayIsOpen
                ? 'Сегодняшний открытый день тоже будет завершён. Итоговый текст не придумывается.'
                : 'Подходит, если найденные дни остались открытыми по ошибке. После восстановления можно начать сегодня.'}
            </small>
          </span>
        </label>

        {snapshot.openDays.map(({ day, hasUnfinishedSession }) => (
          <label className="open-day-recovery-option" key={day.id.toString()}>
            <input
              type="radio"
              name="keep-open-day"
              checked={selectedKeepOpenDayId === day.id.toString()}
              onChange={() => onSelectKeepOpenDay(day.id.toString())}
            />
            <span>
              <strong>Оставить открытым {formatRecoveryDate(day.date)}</strong>
              <small>
                Открыт {formatRecoveryTime(day.openedAt)} · версия {day.version}
                {hasUnfinishedSession ? ' · здесь находится незавершённая сессия' : ''}
              </small>
            </span>
          </label>
        ))}
      </fieldset>

      {snapshot.hasOrphanedUnfinishedSession ? (
        <p className="form-error" role="alert">
          Найдена незавершённая сессия, которую нельзя безопасно связать с одним из активных дней.
          Завершите восстановление сессии перед исправлением дней.
        </p>
      ) : selectedClosesSessionDay ? (
        <p className="form-error" role="alert">
          Выбранный вариант закроет день с активной или приостановленной сессией. Сначала завершите
          сессию либо оставьте её день открытым.
        </p>
      ) : null}

      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="open-day-recovery-footer">
        <div>
          <strong>Данные действий и сессий не удаляются</strong>
          <p>Закрываются только конфликтующие записи дней. Операция выполняется атомарно.</p>
        </div>
        <div className="open-day-recovery-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onRetry}
            disabled={isResolving}
          >
            Проверить снова
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onResolve}
            disabled={isResolving || blocked}
          >
            {isResolving ? 'Восстанавливаем…' : 'Восстановить состояние'}
          </button>
        </div>
      </div>
    </section>
  );
}

function formatRecoveryDate(date: DayDate): string {
  const [year, month, day] = date.toString().split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}

function formatRecoveryTime(value: Date | null): string {
  if (value === null) {
    return 'время неизвестно';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
