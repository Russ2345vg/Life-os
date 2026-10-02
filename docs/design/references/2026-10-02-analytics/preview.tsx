import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppIcon, type AppIconName } from '../../../../src/presentation/components/AppIcon';
import '../../../../src/presentation/styles/global.css';
import '../../../../src/presentation/planner-v2/quick-access.css';
import '../../../../src/presentation/planner-v2/planner-v2.css';
import '../../../../src/presentation/planner-v2/planner-master.css';
import '../../../../src/presentation/planner-v2/planner-premium.css';
import './preview.css';

// Review-only visual fixture. Sample data stays in memory; no application services or storage.
type Topic = 'overview' | 'results' | 'time' | 'goals' | 'balance' | 'state' | 'rest' | 'memory';
type Metric = 'time' | 'results' | 'state';
type ScreenState = 'ready' | 'empty' | 'partial' | 'loading' | 'error';
const labels: Record<Topic, string> = {
  overview: 'Обзор',
  results: 'Действия',
  time: 'Время',
  goals: 'Цели',
  balance: 'Баланс',
  state: 'Состояние',
  rest: 'Восстановление',
  memory: 'События',
};
const nav: [string, AppIconName, string, boolean][] = [
  ['Сегодня', 'today', 'today', false],
  ['Сферы', 'goals', 'spheres', true],
  ['Направления', 'goals', 'directions', true],
  ['Потребности', 'goals', 'needs', true],
  ['Цели', 'goals', 'goals', false],
  ['Действия', 'actions', 'actions', false],
  ['Входящие', 'history', 'inbox', true],
  ['Дневник', 'history', 'diary', false],
  ['Память жизни', 'history', 'memory', true],
  ['Прогулки', 'walks', 'walks', true],
];
const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const current: Record<Metric, readonly (number | null)[]> = {
  time: [160, 210, 180, 270, 180, 75, 45],
  results: [4, 5, 3, 6, 4, 1, 1],
  state: [4, 4, 3, 4, 4, null, null],
};
const previous: Record<Metric, readonly (number | null)[]> = {
  time: [130, 180, 160, 220, 160, 90, 30],
  results: [2, 3, 4, 5, 2, 1, 1],
  state: [3, 4, 3, 4, 3, null, null],
};
const goalRows = [
  ['Развивать LifeOS', 'Работа и дело', '4 результата', 64, '32 из 50 этапов'],
  ['Вернуться к регулярному движению', 'Здоровье', '3 тренировки', 60, '12 из 20 тренировок'],
  ['Читать каждый день', 'Развитие', '84 страницы', 48, '240 из 500 страниц'],
  ['Больше времени вместе', 'Отношения', '1 встреча', 25, '1 из 4 встреч'],
] as const;
const sphereRows = [
  ['Работа и дело', 620, 7.2, 8],
  ['Здоровье', 200, 6.5, 8],
  ['Развитие', 150, 7.0, 7],
  ['Отношения', 90, 5.0, 8],
  ['Без сферы', 60, null, null],
] as const;
const taskTitles = [
  'Подготовить структуру аналитики',
  'Разобрать заметки проекта',
  'Прочитать главу',
  'Спланировать тренировку',
  'Завершить рабочий этап',
  'Подвести итоги дня',
];
const formatTime = (n: number) =>
  n < 60 ? `${n} мин` : `${Math.floor(n / 60)} ч${n % 60 ? ` ${n % 60} мин` : ''}`;
const decimal = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

function Preview() {
  const initial = new URLSearchParams(location.search).get('state');
  const [screen, setScreen] = useState<ScreenState>(
    ['empty', 'partial', 'loading', 'error'].includes(initial ?? '')
      ? (initial as ScreenState)
      : 'ready',
  );
  const [topic, setTopic] = useState<Topic>('overview');
  const [metric, setMetric] = useState<Metric>('time');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [older, setOlder] = useState(false);
  const [more, setMore] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const month = period === 'month';
  const multiplier = 1;
  const series = older ? previous : current;
  const visibleSpheres = sphereRows.map(
    ([name, minutes, score, target], index) =>
      [name, older ? [520, 180, 140, 80, 50][index]! : minutes, score, target] as const,
  );
  const dateLabel = month ? 'Сентябрь 2026' : older ? '14 — 20 сентября' : '21 — 27 сентября';
  const baseDay = older ? 14 : 21;
  const sum = (key: Metric) => series[key].reduce<number>((a, n) => a + (n ?? 0), 0) * multiplier;
  const energy = older ? 3.4 : 3.8;
  function open(next: Topic, day: number | null = null) {
    setTopic(next);
    setSelectedDay(day);
    setNotice('');
    setMore(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  const detailLink = (next: Topic, text = 'Подробнее') => (
    <button className="analytics-link" onClick={() => open(next)}>
      {text}
      <span aria-hidden="true">↗</span>
    </button>
  );
  function panelHeader(title: string, next: Topic, extra?: string) {
    return (
      <div className="analytics-section-heading">
        <div>
          <h2>{title}</h2>
          {extra && <p>{extra}</p>}
        </div>
        {detailLink(next)}
      </div>
    );
  }
  function chart() {
    const values =
      metric === 'state' && screen === 'partial' ? days.map(() => null) : series[metric];
    const compare =
      older || month || (metric === 'state' && screen === 'partial') ? null : previous[metric];
    const maximum = metric === 'state' ? 5 : metric === 'time' ? 360 : 8;
    const unit = metric === 'time' ? 'Часы' : metric === 'results' ? 'Действия' : 'Оценка · 1–5';
    const describe = (value: number | null) =>
      value === null
        ? 'Нет оценки'
        : metric === 'time'
          ? formatTime(value * multiplier)
          : decimal(value * (metric === 'state' ? 1 : multiplier));
    return (
      <section className="analytics-chart-panel" aria-label="Динамика за период">
        <div className="analytics-section-heading">
          <div>
            <span className="analytics-kicker">{month ? 'Ритм месяца' : 'Ритм недели'}</span>
            <h2>
              {metric === 'time'
                ? 'Куда уходит время'
                : metric === 'results'
                  ? 'Завершённые действия'
                  : 'Как меняется энергия'}
            </h2>
          </div>
          <div className="planner-segments" aria-label="Показатель графика">
            {(['time', 'results', 'state'] as const).map((k) => (
              <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)}>
                {k === 'time' ? 'Время' : k === 'results' ? 'Действия' : 'Энергия'}
              </button>
            ))}
          </div>
        </div>
        <div className="analytics-chart-summary">
          <strong>
            {metric === 'time'
              ? formatTime(sum('time'))
              : metric === 'results'
                ? sum('results')
                : screen === 'partial'
                  ? '—'
                  : `${decimal(energy)} / 5`}
          </strong>
          <span>
            {metric === 'time'
              ? 'по записанным сессиям'
              : metric === 'results'
                ? 'действия завершены'
                : screen === 'partial'
                  ? 'нет оценок в дневнике'
                  : `дневник заполнен за ${5 * multiplier} дней`}
          </span>
        </div>
        <div className="analytics-legend">
          <span>
            <i />
            Выбранный период
          </span>
          {compare && (
            <span>
              <i className="is-previous" />
              Предыдущий период
            </span>
          )}
        </div>
        <div className="analytics-plot">
          <div className="analytics-y-axis">
            <small>{unit}</small>
            {[1, 0.75, 0.5, 0.25, 0].map((n) => (
              <span key={n}>
                {decimal(
                  n *
                    maximum *
                    (metric === 'time' ? multiplier / 60 : metric === 'state' ? 1 : multiplier),
                )}
              </span>
            ))}
          </div>
          <div className="analytics-bars">
            {values.map((value, i) => (
              <div
                key={i}
                className="analytics-day"
                role="img"
                aria-label={`${days[i]}, ${baseDay + i} сентября: ${describe(value)}`}
              >
                <span className="analytics-bar-pair">
                  {compare && (
                    <span
                      className="analytics-bar is-previous"
                      style={{ height: `${((compare[i] ?? 0) / maximum) * 100}%` }}
                    />
                  )}
                  {value === null ? (
                    <span className="analytics-missing">—</span>
                  ) : (
                    <span
                      className="analytics-bar"
                      style={{ height: `${(value / maximum) * 100}%` }}
                    />
                  )}
                </span>
                <span className="analytics-day-label">
                  {days[i]}
                  <small>{baseDay + i}</small>
                </span>
                <span className="analytics-tip">{describe(value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="analytics-chart-footer">
          <span>
            {month
              ? 'В примере записи есть за 21–27 сентября'
              : 'Выберите день, чтобы увидеть записи'}
          </span>
          <select
            aria-label="Записи выбранного дня"
            value=""
            onChange={(e) => open(metric, Number(e.target.value))}
          >
            <option value="" disabled>
              Выбрать день
            </option>
            {days.map((day, i) => (
              <option key={day} value={i}>
                {day}, {baseDay + i} сентября
              </option>
            ))}
          </select>
          {detailLink(metric, 'Все записи')}
        </div>
      </section>
    );
  }
  function balance() {
    return (
      <section className="analytics-secondary-panel">
        {panelHeader('Внимание к сферам', 'balance', 'Распределение учтённого времени')}
        <div className="analytics-distribution">
          {visibleSpheres.map(([name, minutes]) => (
            <button key={name} className="analytics-sphere-row" onClick={() => open('balance')}>
              <span>{name}</span>
              <strong>{formatTime(minutes * multiplier)}</strong>
              <span className="analytics-track">
                <i style={{ width: `${(minutes / sum('time')) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
        <p className="analytics-footnote">
          По текущим связям целей со сферами. Это учтённое время, а не весь день.
        </p>
      </section>
    );
  }
  function goals() {
    return (
      <section className="analytics-secondary-panel">
        {panelHeader('Движение к целям', 'goals', 'Результаты за период · текущий прогресс')}
        <div className="analytics-goal-list">
          {goalRows.slice(0, older ? 3 : 4).map(([title, sphere, gain, percent, progress]) => (
            <button key={title} className="analytics-goal-row" onClick={() => open('goals')}>
              <div>
                <strong>{title}</strong>
                <small>{sphere}</small>
              </div>
              <span className="analytics-goal-gain">+ {gain}</span>
              <span className="analytics-goal-progress">
                {percent !== null && (
                  <span className="analytics-track">
                    <i style={{ width: `${percent}%` }} />
                  </span>
                )}
                <small>{progress}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }
  function statePanel() {
    return (
      <section className="analytics-secondary-panel">
        {panelHeader(
          'Состояние',
          'state',
          `Самооценки из дневника · ${screen === 'partial' ? 0 : 5 * multiplier} дней с записями`,
        )}
        {screen === 'partial' ? (
          <div className="analytics-inline-empty">
            <p>В этом периоде ещё нет оценок.</p>
            <a href="/#/v2/diary">Открыть дневник →</a>
          </div>
        ) : (
          <div className="analytics-ratings">
            {[
              ['Энергия', energy],
              ['Настроение', 4.2],
              ['Продуктивность', 3.6],
              ['Оценка дня', 4],
            ].map(([name, value]) => (
              <button key={name} onClick={() => open('state')}>
                <span>{name}</span>
                <strong>
                  {decimal(Number(value))}
                  <small> / 5</small>
                </strong>
                <span className="analytics-rating-dots" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i className={n <= Math.round(Number(value)) ? 'is-filled' : ''} key={n} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }
  function overview() {
    const kpis: [Topic, AppIconName, string, ReactNode, string][] = [
      [
        'results',
        'completed',
        'Выполнено действий',
        sum('results'),
        older || month ? 'По сохранённым выполнениям' : `На ${6 * multiplier} больше, чем ранее`,
      ],
      [
        'time',
        'routine',
        'Учтено времени',
        formatTime(sum('time')),
        older || month ? 'По записанным сессиям' : `На ${formatTime(150 * multiplier)} больше`,
      ],
      ['goals', 'goals', 'Целей с вкладом', older ? 3 : 4, 'Есть записанные результаты'],
      [
        'state',
        'focus',
        'Энергия',
        screen === 'partial' ? (
          '—'
        ) : (
          <>
            {decimal(energy)}
            <small> / 5</small>
          </>
        ),
        screen === 'partial' ? 'Нет оценок в дневнике' : `${5 * multiplier} дней с оценкой`,
      ],
    ];
    return (
      <>
        <div className="analytics-kpis">
          {kpis.map(([next, icon, title, value, note]) => (
            <button key={next} onClick={() => open(next)} className="analytics-kpi">
              <span>
                <AppIcon name={icon} />
                {title}
                <span className="analytics-kpi-arrow" aria-hidden="true">
                  ↗
                </span>
              </span>
              <strong>{value}</strong>
              <small>{note}</small>
            </button>
          ))}
        </div>
        <div className="analytics-primary-grid">
          {chart()}
          <aside className="analytics-context">
            <h2>Что заметно</h2>
            <article>
              <span className="analytics-observation-mark">01</span>
              <p>
                <strong>
                  {older || month ? 'Завершённые действия' : 'Больше завершённых действий'}
                </strong>
                <span>
                  {sum('results')} за период{older || month ? '' : ` вместо ${18 * multiplier}`}.
                  Это количество, а не оценка важности.
                </span>
              </p>
            </article>
            <article>
              <span className="analytics-observation-mark">02</span>
              <p>
                <strong>Больше всего времени — на работу</strong>
                <span>
                  {formatTime(older ? 520 : 620)} из {formatTime(sum('time'))} учтённого времени.
                </span>
              </p>
            </article>
            <article>
              <span className="analytics-observation-mark">03</span>
              <p>
                <strong>
                  {screen === 'partial'
                    ? 'Для оценки состояния нужны записи'
                    : older || month
                      ? 'Энергия по дневнику'
                      : 'Энергия по дневнику выше'}
                </strong>
                <span>
                  {screen === 'partial'
                    ? 'Оценки появятся после заполнения дневника.'
                    : `Среднее ${decimal(energy)} из 5. Оценки заполнены за 5 дней.`}
                </span>
              </p>
            </article>
            <div className="analytics-coverage">
              <AppIcon name="history" />
              <div>
                <strong>Из чего сложился период</strong>
                <span>
                  Выполнения, сессии и {screen === 'partial' ? '0' : 5 * multiplier} записей
                  дневника.
                </span>
                <button className="analytics-link" onClick={() => open('time')}>
                  Посмотреть источники ↗
                </button>
              </div>
            </div>
          </aside>
        </div>
        <div className="analytics-secondary-grid">
          {balance()}
          {goals()}
        </div>
        <div className="analytics-secondary-grid">
          {statePanel()}
          <section className="analytics-secondary-panel">
            {panelHeader('Восстановление и события', 'rest', 'То, что было помимо рабочих задач')}
            <button className="analytics-life-row" onClick={() => open('rest')}>
              <AppIcon name="walks" />
              <span>
                <strong>Прогулки</strong>
                <small>3 завершённые прогулки</small>
              </span>
              <b>1 ч 35 мин</b>
              <span aria-hidden="true">↗</span>
            </button>
            <button className="analytics-life-row" onClick={() => open('rest')}>
              <AppIcon name="routine" />
              <span>
                <strong>Подготовка ко сну</strong>
                <small>Дни с завершённой подготовкой</small>
              </span>
              <b>4 дня</b>
              <span aria-hidden="true">↗</span>
            </button>
            <button className="analytics-life-row" onClick={() => open('memory')}>
              <AppIcon name="history" />
              <span>
                <strong>Память жизни</strong>
                <small>Сохранённые события периода</small>
              </span>
              <b>2 события</b>
              <span aria-hidden="true">↗</span>
            </button>
          </section>
        </div>
      </>
    );
  }
  function details() {
    return (
      <section className="analytics-details">
        <div className="analytics-section-heading">
          <div>
            <span className="analytics-kicker">
              {selectedDay === null
                ? 'Весь период'
                : `${days[selectedDay]}, ${baseDay + selectedDay} сентября`}
            </span>
            <h2>{labels[topic]}</h2>
          </div>
          {selectedDay !== null && <button onClick={() => setSelectedDay(null)}>Все дни</button>}
        </div>
        {topic === 'balance' ? (
          <>
            {balance()}
            <h3>Состояние сфер</h3>
            <p className="analytics-footnote">
              Оценки на конец сентября из сохранённых месячных снимков. Время и оценка сферы —
              разные показатели.
            </p>
            {sphereRows
              .filter((r) => r[2] !== null)
              .map(([name, , score, target]) => (
                <div className="analytics-detail-row" key={name}>
                  <strong>{name}</strong>
                  <span>{decimal(score!)} / 10</span>
                  <small>Желаемый уровень: {target}</small>
                </div>
              ))}
          </>
        ) : topic === 'goals' ? (
          <>
            {goals()}
            <p className="analytics-footnote">
              Начальные значения исключены. Процент рассчитан по текущим параметрам цели; прошлые
              целевые значения не восстанавливаются.
            </p>
          </>
        ) : topic === 'state' ? (
          <>
            {screen === 'partial' ? (
              <p>Нет оценок. Пропуск не считается нулём.</p>
            ) : (
              <>
                <p>
                  Средняя энергия — {decimal(energy)} / 5. Учтены только заполненные оценки
                  завершённых записей.
                </p>
                {series.state.map(
                  (value, i) =>
                    (selectedDay === null || selectedDay === i) && (
                      <div key={i} className="analytics-detail-row">
                        <strong>{baseDay + i} сентября</strong>
                        <span>{value === null ? 'Нет оценки' : `${value} / 5`}</span>
                        <a href="/#/v2/diary">Открыть дневник ↗</a>
                      </div>
                    ),
                )}
              </>
            )}
          </>
        ) : topic === 'rest' ? (
          <>
            <p>3 прогулки · 95 минут. Подготовка ко сну завершена в 4 днях.</p>
            {[
              ['21 сентября', 'Прогулка', '35 минут'],
              ['23 сентября', 'Прогулка', '25 минут'],
              ['26 сентября', 'Прогулка', '35 минут'],
            ].map(([date, title, value]) => (
              <div key={date} className="analytics-detail-row">
                <strong>{title}</strong>
                <span>{date}</span>
                <span>{value}</span>
              </div>
            ))}
            <p className="analytics-footnote">
              Недостаточно пар оценок до и после для наблюдения. Подготовка ко сну не измеряет
              длительность сна.
            </p>
            <a href="/#/v2/walks">Открыть прогулки ↗</a>
          </>
        ) : topic === 'memory' ? (
          <>
            <p>
              События придают числам контекст. Количество записей не оценивает насыщенность жизни.
            </p>
            {['Завершён важный этап проекта', 'Поездка с близкими'].map((title, i) => (
              <div key={title} className="analytics-detail-row">
                <strong>{title}</strong>
                <span>{24 + i * 2} сентября</span>
                <a href="/#/v2/memory">Открыть память ↗</a>
              </div>
            ))}
          </>
        ) : (
          <>
            <p>
              {topic === 'time'
                ? 'Рабочие интервалы без пауз. Ручная общая оценка времени действия здесь не прибавляется.'
                : 'Сохранённые выполнения, включая архивные действия. Отменённое выполнение и удалённые действия исключены.'}
            </p>
            {series[topic === 'time' ? 'time' : 'results'].map(
              (value, i) =>
                (selectedDay === null || selectedDay === i) && (
                  <div key={i} className="analytics-day-detail">
                    <h3>
                      {days[i]}, {baseDay + i} сентября{' '}
                      <span>{topic === 'time' ? formatTime(value ?? 0) : `${value} действия`}</span>
                    </h3>
                    {Array.from({ length: topic === 'time' ? 1 : (value ?? 0) }, (_, j) => (
                      <div key={j} className="analytics-detail-row">
                        <strong>
                          {topic === 'time'
                            ? 'Рабочая сессия · развитие LifeOS'
                            : taskTitles[(i + j) % taskTitles.length]}
                        </strong>
                        <small>{topic === 'time' ? formatTime(value ?? 0) : 'Выполнено'}</small>
                        <button
                          className="analytics-link"
                          onClick={() =>
                            setNotice(
                              'Это запись примера. В приложении здесь откроется исходное действие.',
                            )
                          }
                        >
                          Открыть ↗
                        </button>
                      </div>
                    ))}
                  </div>
                ),
            )}
          </>
        )}
        <details className="analytics-method">
          <summary>Как считается показатель</summary>
          <p>
            Показаны демонстрационные записи для согласования интерфейса. В приложении список будет
            состоять из тех же записей, по которым рассчитан показатель. Открытие аналитики не
            изменяет исходные данные.
          </p>
        </details>
      </section>
    );
  }
  return (
    <div className="planner-v2 analytics-preview">
      <a className="planner-skip" href="#analytics-main">
        К содержимому
      </a>
      <aside className="planner-sidebar">
        <a className="planner-brand" href="/#/v2/today">
          LifeOS
        </a>
        <button
          className="planner-quick-trigger"
          onClick={() => setNotice('В приложении здесь работает общий поиск LifeOS.')}
        >
          <AppIcon name="search" />
          <span>Поиск и добавление</span>
          <kbd>Ctrl K</kbd>
        </button>
        <a className="planner-data-status-link" href="/#/v2/account">
          <AppIcon name="account" />
          <span>Состояние данных</span>
        </a>
        <nav aria-label="Рабочий интерфейс">
          {nav.map(([label, icon, route, secondary]) => (
            <span key={route} className={secondary ? 'planner-nav-secondary' : undefined}>
              <a href={`/#/v2/${route}`}>
                <AppIcon name={icon} />
                <span>{label}</span>
              </a>
            </span>
          ))}
          <span className="planner-nav-secondary">
            <a
              href="#overview"
              aria-current="page"
              onClick={(e) => {
                e.preventDefault();
                open('overview');
              }}
            >
              <AppIcon name="statistics" />
              <span>Аналитика</span>
            </a>
          </span>
          <button
            className="planner-nav-more"
            aria-current="page"
            aria-expanded={more}
            aria-controls="analytics-more"
            onClick={() => setMore(!more)}
          >
            <AppIcon name="history" />
            <span>Ещё</span>
          </button>
        </nav>
        <div id="analytics-more" className="planner-more-menu" hidden={!more}>
          <button onClick={() => open('overview')}>
            <AppIcon name="statistics" />
            Аналитика
          </button>
          <a href="/#/v2/walks">Прогулки</a>
          <a href="/#/v2/spheres">Сферы</a>
          <a href="/#/v2/sleep">Подготовка ко сну</a>
        </div>
      </aside>
      <main className="planner-content" id="analytics-main">
        <header className="planner-page-heading">
          <div>
            <h1 ref={heading} tabIndex={-1}>
              Аналитика
            </h1>
            <p className="planner-eyebrow">Общая картина жизни · Макет на данных примера</p>
          </div>
          <div className="planner-segments" aria-label="Период аналитики">
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => {
                  setPeriod(p);
                  setOlder(false);
                  open('overview');
                }}
              >
                {p === 'week' ? 'Неделя' : 'Месяц'}
              </button>
            ))}
          </div>
        </header>
        <div className="analytics-period">
          <div className="analytics-date">
            <button
              aria-label="Предыдущий период"
              disabled={older || month}
              onClick={() => {
                setOlder(true);
                open('overview');
              }}
            >
              ‹
            </button>
            <strong>{dateLabel}</strong>
            <button
              aria-label="Следующий период"
              disabled={!older}
              onClick={() => {
                setOlder(false);
                open('overview');
              }}
            >
              ›
            </button>
          </div>
          <span>
            {older
              ? 'Предыдущий период · пример без базы сравнения'
              : month
                ? 'Полный месяц · в примере записи за одну неделю'
                : 'Полная неделя · сравнение с 14–20 сентября'}
          </span>
        </div>
        <nav className="analytics-tabs" aria-label="Раздел аналитики">
          {(['overview', 'results', 'time', 'goals', 'balance', 'state'] as const).map((t) => (
            <button key={t} aria-current={topic === t ? 'page' : undefined} onClick={() => open(t)}>
              {labels[t]}
            </button>
          ))}
        </nav>
        {topic !== 'overview' && (
          <button className="analytics-back" onClick={() => open('overview')}>
            ← К обзору
          </button>
        )}
        {notice && (
          <p className="analytics-notice" role="status">
            {notice}
            <button aria-label="Закрыть сообщение" onClick={() => setNotice('')}>
              ×
            </button>
          </p>
        )}
        {screen === 'loading' ? (
          <section className="analytics-loading" aria-busy="true" aria-label="Загрузка аналитики">
            <p>Собираем картину периода…</p>
            <div className="analytics-kpis">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} />
              ))}
            </div>
            <div className="analytics-skeleton-chart" />
          </section>
        ) : screen === 'error' ? (
          <section className="analytics-empty" role="alert">
            <AppIcon name="statistics" />
            <h2>Не удалось загрузить аналитику</h2>
            <p>Исходные записи сохранены. Попробуйте загрузить обзор ещё раз.</p>
            <button
              className="planner-primary"
              onClick={() => {
                setScreen('ready');
                setNotice('Обзор обновлён');
              }}
            >
              Повторить
            </button>
          </section>
        ) : screen === 'empty' ? (
          <section className="analytics-empty">
            <AppIcon name="statistics" />
            <h2>Здесь появится ваша картина жизни</h2>
            <p>
              Завершайте действия, учитывайте время и отмечайте состояние в дневнике. Обзор будет
              складываться из этих записей.
            </p>
            <a className="planner-primary" href="/#/v2/today">
              Открыть «Сегодня»
            </a>
            <button className="analytics-link" onClick={() => setScreen('ready')}>
              Посмотреть пример
            </button>
          </section>
        ) : topic === 'overview' ? (
          overview()
        ) : (
          details()
        )}
        <div className="analytics-review-tools">
          <span>Макет · данные примера</span>
          <label>
            Состояние{' '}
            <select
              aria-label="Состояние макета"
              value={screen}
              onChange={(e) => {
                setScreen(e.target.value as ScreenState);
                open('overview');
              }}
            >
              {Object.entries({
                ready: 'Есть данные',
                partial: 'Неполные данные',
                empty: 'Первый запуск',
                loading: 'Загрузка',
                error: 'Ошибка',
              }).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="analytics-footer">
          <span>Данные LifeOS · {month ? 'месячный' : 'недельный'} обзор</span>
          <details>
            <summary>О данных и расчётах</summary>
            <p>
              Нет записи — не значит ноль. Время учитывается только по сессиям; оценки состояния —
              по дневнику. Архивирование сохраняет результаты. Изменение и удаление исходных записей
              могут изменить прошлые итоги.
            </p>
          </details>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
