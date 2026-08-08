import type { ActionSession } from '../../domain';
import { buildActionSessionOverview } from '../actionSessionOverview';
import { formatDuration } from '../session/sessionTimer';

interface ActionSessionOverviewPanelProps {
  readonly sessions: readonly ActionSession[];
  readonly now: Date;
}

export function ActionSessionOverviewPanel({ sessions, now }: ActionSessionOverviewPanelProps) {
  const overview = buildActionSessionOverview(sessions, now);

  return (
    <section className="action-session-overview" aria-labelledby="action-session-overview-title">
      <div className="section-heading action-session-overview-heading">
        <div>
          <p className="section-kicker">Рабочие сессии</p>
          <h3 id="action-session-overview-title">История работы</h3>
        </div>
        <span className="action-session-overview-count">{overview.totalSessionCount}</span>
      </div>

      {overview.totalSessionCount === 0 ? (
        <p className="empty-session-history">Завершённых сессий пока нет</p>
      ) : (
        <>
          <dl className="action-session-summary" aria-label="Сводка рабочих сессий">
            <div>
              <dt>Всего сессий</dt>
              <dd>{overview.totalSessionCount}</dd>
            </div>
            <div>
              <dt>Завершённые сессии</dt>
              <dd>{overview.completedSessionCount}</dd>
            </div>
            <div>
              <dt>Общее время</dt>
              <dd>{formatDuration(overview.totalWorkedDurationMs)}</dd>
            </div>
            <div>
              <dt>Средняя сессия</dt>
              <dd>
                {overview.completedSessionCount === 0
                  ? '—'
                  : formatDuration(overview.averageCompletedWorkedDurationMs)}
              </dd>
            </div>
            <div className="action-session-summary-latest">
              <dt>Последняя сессия</dt>
              <dd>
                {overview.latestSession === null
                  ? '—'
                  : `${formatSessionDateTime(overview.latestSession.startedAt)} · ${sessionStatusLabel(overview.latestSession)}`}
              </dd>
            </div>
          </dl>

          <div className="action-session-history-list">
            {overview.items.map((item, index) => (
              <article
                className={`action-session-history-card action-session-history-${sessionTone(item.session)}`}
                key={item.session.id.toString()}
              >
                <div className="action-session-history-head">
                  <div>
                    <span className="action-session-number">
                      Сессия {overview.totalSessionCount - index}
                    </span>
                    <time dateTime={item.session.startedAt.toISOString()}>
                      {formatSessionDateTime(item.session.startedAt)}
                    </time>
                  </div>
                  <div className="action-session-history-badges">
                    {item.isLatest ? <span className="session-latest-badge">Последняя</span> : null}
                    <span className={`session-state session-state-${sessionTone(item.session)}`}>
                      {sessionStatusLabel(item.session)}
                    </span>
                  </div>
                </div>

                <dl className="action-session-history-facts">
                  <div>
                    <dt>Работа</dt>
                    <dd>{formatDuration(item.workedDurationMs)}</dd>
                  </div>
                  <div>
                    <dt>Паузы</dt>
                    <dd>{formatDuration(item.pausedDurationMs)}</dd>
                  </div>
                  <div>
                    <dt>Начало</dt>
                    <dd>{formatTime(item.session.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>Завершение</dt>
                    <dd>
                      {item.session.completedAt === null
                        ? '—'
                        : formatTime(item.session.completedAt)}
                    </dd>
                  </div>
                </dl>

                <div className="action-session-result">
                  <span>Результат сессии</span>
                  <p>{sessionResultText(item.session)}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function sessionStatusLabel(session: ActionSession): string {
  if (session.isRunning()) {
    return 'Выполняется';
  }

  if (session.isPaused()) {
    return 'На паузе';
  }

  return session.isInterrupted() ? 'Прервана' : 'Завершена';
}

function sessionTone(session: ActionSession): 'running' | 'paused' | 'completed' | 'interrupted' {
  if (session.isRunning()) {
    return 'running';
  }

  if (session.isPaused()) {
    return 'paused';
  }

  return session.isInterrupted() ? 'interrupted' : 'completed';
}

function sessionResultText(session: ActionSession): string {
  if (!session.isCompleted()) {
    return 'Результат будет зафиксирован после завершения сессии.';
  }

  return session.resultNote?.toString() ?? 'Результат этой сессии не указан.';
}

function formatSessionDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
