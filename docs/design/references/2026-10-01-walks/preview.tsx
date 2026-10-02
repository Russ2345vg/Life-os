import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppIcon, type AppIconName } from '../../../../src/presentation/components/AppIcon';
import { VoiceTextArea } from '../../../../src/presentation/voice-input/VoiceTextArea';
import '../../../../src/presentation/styles/global.css';
import '../../../../src/presentation/planner-v2/quick-access.css';
import '../../../../src/presentation/planner-v2/planner-v2.css';
import '../../../../src/presentation/planner-v2/planner-master.css';
import '../../../../src/presentation/planner-v2/planner-premium.css';
import './preview.css';

// Review-only fixture. No application services, persistence, microphone or network writes.
const states = {
  overview: 'Обзор',
  empty: 'Первый запуск',
  active: 'Идёт прогулка',
  paused: 'Пауза',
  completion: 'Завершение',
  error: 'Ошибка сохранения',
  conflict: 'Конфликт устройств',
  history: 'История',
  captures: 'Мысли',
  loading: 'Загрузка',
} as const;
type Screen = keyof typeof states;
const history = [
  {
    date: 'Вчера, 30 сентября',
    title: 'Свободная прогулка',
    minutes: 32,
    text: 'Побыть на улице без спешки.',
    kind: 'Без оценки',
  },
  {
    date: '29 сентября',
    title: 'Восстановиться',
    minutes: 25,
    text: 'После рабочего дня стало спокойнее.',
    kind: 'Стало лучше',
  },
  {
    date: '27 сентября',
    title: 'Подумать о цели',
    minutes: 22,
    text: 'Начать с одного небольшого шага.',
    kind: 'Стало лучше',
  },
];
const nav: [string, AppIconName, string, boolean][] = [
  ['Сегодня', 'today', 'today', false],
  ['Сферы', 'goals', 'spheres', true],
  ['Направления', 'goals', 'directions', true],
  ['Цели', 'goals', 'goals', false],
  ['Действия', 'actions', 'actions', false],
  ['Входящие', 'history', 'inbox', true],
  ['Дневник', 'history', 'diary', false],
  ['Память жизни', 'history', 'memory', true],
];
function initialScreen(): Screen {
  const value = location.hash.slice(1);
  return value in states ? (value as Screen) : 'overview';
}
function Preview() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [ongoing, setOngoing] = useState<'active' | 'paused' | null>(() =>
    initialScreen() === 'paused' ? 'paused' : initialScreen() === 'active' ? 'active' : null,
  );
  const [more, setMore] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [intent, setIntent] = useState('Свободная прогулка');
  const [duration, setDuration] = useState('Без ограничения');
  const [question, setQuestion] = useState('');
  const [thought, setThought] = useState('');
  const [result, setResult] = useState('');
  const [impact, setImpact] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const session = screen === 'active' || screen === 'paused';
  const finishing = screen === 'completion' || screen === 'error';
  useEffect(() => {
    const changed = () => setScreen(initialScreen());
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  function go(next: Screen) {
    if (next === 'active' || next === 'paused') setOngoing(next);
    if (next === 'completion' || next === 'error') setOngoing(null);
    location.hash = next;
    setScreen(next);
    setNotice('');
    setMore(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function saveNote() {
    if (!thought.trim()) return;
    setNotes((current) => [...current, thought.trim()]);
    setThought('');
    setNotice('Мысль добавлена');
  }
  function finish() {
    setSaved(true);
    go('completion');
  }
  const recent = saved
    ? [
        {
          date: 'Сегодня, 1 октября',
          title: intent,
          minutes: 18,
          text: result || 'Итог можно добавить позже.',
          kind: impact || 'Без оценки',
        },
        ...history,
      ]
    : history;
  function rows() {
    return (
      <div className="walk-history">
        {recent.map((item, index) => (
          <article key={item.date} className="walk-row">
            <span className="walk-row-icon">
              <AppIcon name="walks" />
            </span>
            <div>
              <small>{item.date}</small>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
            <div className="walk-row-end">
              <strong>
                {item.minutes} <small>мин</small>
              </strong>
              <small>{item.kind}</small>
            </div>
            <button
              className="walk-detail-button"
              aria-label={`Открыть прогулку: ${item.title}`}
              onClick={() => {
                setNotice(`${item.date} · ${item.minutes} минут · ${item.text}`);
                if (index === 0 && saved) go('completion');
              }}
            >
              <AppIcon name="arrow-right" />
            </button>
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="planner-v2 walk-preview">
      <a className="planner-skip" href="#main">
        К содержимому
      </a>
      <aside className="planner-sidebar">
        <a className="planner-brand" href="/#/v2/today">
          LifeOS
        </a>
        <button
          className="planner-quick-trigger"
          onClick={() => setNotice('В приложении здесь откроется общий поиск LifeOS.')}
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
          {nav.map(([label, icon, route, secondary]) =>
            secondary ? (
              <span key={label} className="planner-nav-secondary">
                <a href={`/#/v2/${route}`}>
                  <AppIcon name={icon} />
                  <span>{label}</span>
                </a>
              </span>
            ) : (
              <a key={label} href={`/#/v2/${route}`}>
                <AppIcon name={icon} />
                <span>{label}</span>
              </a>
            ),
          )}
          <span className="planner-nav-secondary">
            <a
              href="#overview"
              aria-current="page"
              onClick={(event) => {
                event.preventDefault();
                go('overview');
              }}
            >
              <AppIcon name="walks" />
              <span>Прогулки</span>
            </a>
          </span>
          <button
            className="planner-nav-more"
            aria-expanded={more}
            aria-controls="walk-more"
            aria-current="page"
            onClick={() => setMore(!more)}
          >
            <AppIcon name="more" />
            <span>Ещё</span>
          </button>
        </nav>
        <div className="planner-more-menu" id="walk-more" hidden={!more}>
          <a href="#overview" onClick={() => go('overview')}>
            <AppIcon name="walks" />
            Прогулки
          </a>
          <a href="/#/v2/sleep">Подготовка ко сну</a>
        </div>
      </aside>
      <main className="planner-content" id="main">
        <div className="walk-review-tools">
          <span>Макет · данные примера</span>
          <label>
            Состояние{' '}
            <select
              aria-label="Состояние макета"
              value={screen}
              onChange={(event) => {
                setOngoing(null);
                go(event.target.value as Screen);
              }}
            >
              {Object.entries(states).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <header className="planner-page-heading">
          <div>
            <h1 ref={heading} tabIndex={-1}>
              Прогулки
            </h1>
            <p className="planner-eyebrow">Время для себя и свежих мыслей</p>
          </div>
          <span className="walk-date">Четверг, 1 октября</span>
        </header>
        {!session && !finishing && (
          <nav className="walk-tabs" aria-label="Раздел прогулок">
            {(['overview', 'history', 'captures'] as const).map((key) => (
              <button
                key={key}
                aria-current={
                  screen === key ||
                  (key === 'overview' && ['empty', 'conflict', 'loading'].includes(screen))
                    ? 'page'
                    : undefined
                }
                onClick={() => go(key)}
              >
                {states[key]}
              </button>
            ))}
          </nav>
        )}
        <div className="walk-announcement" role="status">
          {notice}
        </div>
        {screen === 'loading' ? (
          <section
            className="walk-panel walk-loading"
            aria-label="Загрузка прогулок"
            aria-busy="true"
          >
            <div />
            <div />
            <div />
            <p>Загружаем прогулки…</p>
          </section>
        ) : screen === 'conflict' ? (
          <section className="walk-panel walk-conflict">
            <span className="walk-label">Нужно выбрать</span>
            <h2>Открыты две прогулки</h2>
            <p>Они начаты на разных устройствах. Обе сохранены — выберите, какую продолжить.</p>
            {['На телефоне · начата в 15:10', 'На компьютере · начата в 15:18'].map(
              (name, index) => (
                <div className="walk-conflict-row" key={name}>
                  <span>
                    <strong>{index === 0 ? 'Свободная прогулка' : 'Восстановиться'}</strong>
                    <small>{name}</small>
                  </span>
                  <button
                    onClick={() => {
                      go('paused');
                      setNotice('Выбранная прогулка открыта. Вторую можно завершить отдельно.');
                    }}
                  >
                    Открыть
                  </button>
                </div>
              ),
            )}
            <p className="walk-muted">
              Новый старт будет доступен, когда останется одна активная прогулка.
            </p>
          </section>
        ) : session ? (
          <>
            <button className="walk-back" onClick={() => go('overview')}>
              ← К обзору
            </button>
            <div className="walk-grid">
              <section
                className={`walk-panel walk-session ${screen === 'paused' ? 'is-paused' : ''}`}
              >
                <div className="walk-session-top">
                  <span className="walk-label">
                    <AppIcon name="walks" />
                    {intent}
                  </span>
                  <span className="walk-state">
                    <i />
                    {screen === 'paused' ? 'На паузе' : 'Идёт прогулка'}
                  </span>
                </div>
                <div className="walk-clock">
                  <span className="walk-muted">Время прогулки</span>
                  <div aria-label="18 минут 42 секунды">
                    18<span>:</span>42
                  </div>
                  <p>
                    {screen === 'paused'
                      ? 'Время на паузе не учитывается.'
                      : duration === 'Без ограничения'
                        ? 'Без ограничения времени'
                        : `Ориентир — ${duration}`}
                  </p>
                </div>
                <div className="walk-session-actions">
                  <button onClick={() => go(screen === 'paused' ? 'active' : 'paused')}>
                    {screen === 'paused' ? 'Продолжить' : 'Пауза'}
                  </button>
                  <button className="planner-primary" onClick={finish}>
                    Завершить прогулку
                  </button>
                </div>
                <p className="walk-session-hint">
                  {screen === 'paused'
                    ? 'Продолжите, когда будете готовы.'
                    : 'Можно убрать телефон и просто идти.'}
                </p>
                <details className="walk-guidance">
                  <summary>
                    Вопрос для размышления <AppIcon name="chevron-down" />
                  </summary>
                  <p>{question || 'Что сейчас заслуживает вашего внимания?'}</p>
                  <button
                    onClick={(event) =>
                      event.currentTarget.closest('details')?.removeAttribute('open')
                    }
                  >
                    Без подсказок
                  </button>
                </details>
              </section>
              <aside className="walk-side">
                <h2>Мысли на ходу</h2>
                <p>Запишите коротко, чтобы вернуться позже.</p>
                <label htmlFor="capture">Новая мысль</label>
                <VoiceTextArea
                  id="capture"
                  value={thought}
                  onValueChange={setThought}
                  voiceInput={false}
                  maxLength={500}
                  rows={4}
                  placeholder="Что хочется сохранить?"
                />
                <div className="walk-composer-footer">
                  <small>{thought.length}/500</small>
                  <button disabled={!thought.trim()} onClick={saveNote}>
                    Сохранить мысль
                  </button>
                </div>
                <div className="walk-notes">
                  {notes.length ? (
                    notes.map((text, index) => (
                      <article key={index}>
                        <small>Во время прогулки</small>
                        <p>{text}</p>
                      </article>
                    ))
                  ) : (
                    <p className="walk-muted">
                      Здесь появятся ваши мысли.
                      <br />
                      Можно ничего не записывать.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          </>
        ) : finishing ? (
          <>
            <div className="walk-grid">
              <section className="walk-panel walk-completion">
                <span className="walk-label">
                  <AppIcon name="completed" />
                  Прогулка завершена
                </span>
                <h2>Время для себя</h2>
                <p>18 минут на свежем воздухе. Прогулка уже в истории.</p>
                <div className="walk-completion-facts">
                  <span>
                    <strong>18 мин</strong>активного времени
                  </span>
                  <span>
                    <strong>{notes.length}</strong>
                    {notes.length === 1 ? 'мысль сохранена' : 'мыслей сохранено'}
                  </span>
                </div>
                <details className="walk-optional" open={screen === 'error' ? true : undefined}>
                  <summary>
                    Добавить итог и оценку <AppIcon name="chevron-down" />
                  </summary>
                  <label htmlFor="reflection">
                    Что хочется запомнить? <small>Необязательно</small>
                  </label>
                  <VoiceTextArea
                    id="reflection"
                    voiceInput={false}
                    value={result}
                    onValueChange={setResult}
                    rows={3}
                    maxLength={1000}
                    placeholder="Мысль, наблюдение или просто впечатление"
                  />
                  <fieldset>
                    <legend>Как вы себя чувствуете?</legend>
                    <div className="walk-impact">
                      {['Лучше', 'Так же', 'Хуже'].map((value) => (
                        <button
                          key={value}
                          aria-pressed={impact === value}
                          onClick={() => setImpact(impact === value ? '' : value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <details className="walk-rating">
                    <summary>Оценить состояние подробнее</summary>
                    <div>
                      {['Энергия', 'Напряжение', 'Ясность'].map((label) => (
                        <label key={label}>
                          {label}
                          <select defaultValue="">
                            <option value="">Без оценки</option>
                            {Array.from({ length: 11 }, (_, index) => (
                              <option key={index}>{index}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                </details>
                {screen === 'error' && (
                  <div className="walk-error" role="alert">
                    <strong>Не удалось сохранить итог</strong>
                    <p>Прогулка сохранена. Текст остался здесь — попробуйте ещё раз.</p>
                  </div>
                )}
                <div className="walk-completion-actions">
                  <button
                    className="planner-primary"
                    onClick={() => {
                      setSaved(true);
                      go('history');
                      setNotice(
                        result || impact ? 'Итог сохранён' : 'Прогулка сохранена без оценки',
                      );
                    }}
                  >
                    {screen === 'error'
                      ? 'Повторить сохранение'
                      : result || impact
                        ? 'Сохранить итог'
                        : 'Готово'}
                  </button>
                  <button
                    onClick={() => {
                      setSaved(true);
                      go('history');
                    }}
                  >
                    К истории прогулок
                  </button>
                </div>
              </section>
              <aside className="walk-side">
                <h2>Дальше — как вам удобно</h2>
                <p>Можно вернуться к своим делам или оставить этот момент без выводов.</p>
                <a className="walk-return" href="/#/v2/today">
                  <AppIcon name="today" />
                  <span>Вернуться в «Сегодня»</span>
                  <AppIcon name="arrow-right" />
                </a>
                <div className="walk-side-note">
                  <AppIcon name="walks" />
                  <p>Не каждая прогулка должна приводить к решению.</p>
                </div>
              </aside>
            </div>
          </>
        ) : screen === 'history' ? (
          <section>
            <div className="walk-section-heading">
              <h2>История прогулок</h2>
              <span className="walk-muted">Последние 7 дней</span>
            </div>
            {rows()}
          </section>
        ) : screen === 'captures' ? (
          <section>
            <div className="walk-section-heading">
              <h2>Сохранённые мысли</h2>
              <span className="walk-muted">{notes.length}</span>
            </div>
            {notes.length ? (
              notes.map((text, index) => (
                <article className="walk-saved-note" key={index}>
                  <small>Сегодня · Свободная прогулка</small>
                  <p>{text}</p>
                </article>
              ))
            ) : (
              <div className="walk-panel walk-empty-notes">
                <AppIcon name="walks" />
                <h2>Мысли найдут здесь своё место</h2>
                <p>Записывайте их во время прогулки и возвращайтесь, когда будет удобно.</p>
                <button onClick={() => go('overview')}>К прогулкам</button>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="walk-grid">
              <section className="walk-panel walk-hero">
                <span className="walk-label">
                  <AppIcon name="walks" />
                  Пауза в ритме дня
                </span>
                <h2>{ongoing ? 'Ваша прогулка продолжается' : 'Выйти на прогулку'}</h2>
                <p className="walk-hero-copy">
                  {ongoing
                    ? '18 минут для себя. Вернитесь, когда будет удобно.'
                    : 'Сменить обстановку, немного пройтись.'}
                  <br />
                  {ongoing
                    ? ongoing === 'paused'
                      ? 'Сейчас прогулка на паузе.'
                      : 'Время прогулки продолжает идти.'
                    : 'Можно без цели и без плана.'}
                </p>
                <div className="walk-start-context">
                  <span>
                    <AppIcon name="walks" />
                    {intent}
                  </span>
                  <span>{duration}</span>
                </div>
                <div className="walk-start-actions">
                  <button
                    className="planner-primary"
                    onClick={() => {
                      if (ongoing) {
                        go(ongoing);
                        return;
                      }
                      setNotes([]);
                      setSaved(false);
                      go('active');
                    }}
                  >
                    {ongoing ? 'Вернуться к прогулке' : 'Начать прогулку'}{' '}
                    <AppIcon name="arrow-right" />
                  </button>
                  {!ongoing && (
                    <button aria-expanded={configure} onClick={() => setConfigure(!configure)}>
                      Настроить <AppIcon name="chevron-down" />
                    </button>
                  )}
                </div>
                {configure && !ongoing && (
                  <div className="walk-config">
                    <label>
                      Намерение
                      <select value={intent} onChange={(event) => setIntent(event.target.value)}>
                        {['Свободная прогулка', 'Восстановиться', 'Подумать'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Длительность
                      <select
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                      >
                        {[
                          'Без ограничения',
                          '10 минут',
                          '20 минут',
                          '30 минут',
                          '45 минут',
                          '60 минут',
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    {intent === 'Подумать' && (
                      <label>
                        О чём подумать? <small>Необязательно</small>
                        <input
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          placeholder="Вопрос или тема"
                          maxLength={500}
                        />
                      </label>
                    )}
                  </div>
                )}
                <p className="walk-start-hint">Без обязательных вопросов и оценок.</p>
              </section>
              <aside className="walk-side">
                <div className="walk-section-heading">
                  <h2>За 7 дней</h2>
                  <AppIcon name="statistics" />
                </div>
                <div className="walk-week">
                  <div>
                    <strong>{screen === 'empty' ? '—' : saved ? '4' : '3'}</strong>
                    <span>прогулки</span>
                  </div>
                  <div>
                    <strong>{screen === 'empty' ? '—' : saved ? '97' : '79'}</strong>
                    <span>минут для себя</span>
                  </div>
                </div>
                <div className="walk-week-days" aria-label="Дни с прогулками за последние 7 дней">
                  {['Пт', 'Сб', 'Вс', 'Пн', 'Вт', 'Ср', 'Чт'].map((day, index) => (
                    <div key={day}>
                      <i
                        className={
                          screen !== 'empty' && [2, 4, 5].includes(index) ? 'has-walk' : ''
                        }
                      />
                      <span>{day}</span>
                    </div>
                  ))}
                </div>
                <p className="walk-muted">
                  {screen === 'empty'
                    ? 'После первой прогулки здесь появится ваш ритм.'
                    : 'Каждая прогулка считается. Ритм выбираете вы.'}
                </p>
              </aside>
            </div>
            <section className="walk-recent">
              <div className="walk-section-heading">
                <h2>Последние прогулки</h2>
                {screen !== 'empty' && (
                  <button className="walk-text-action" onClick={() => go('history')}>
                    Вся история <AppIcon name="arrow-right" />
                  </button>
                )}
              </div>
              {screen === 'empty' ? (
                <p className="walk-first-empty">
                  Здесь будет история ваших прогулок — с мыслями, временем и впечатлениями.
                </p>
              ) : (
                rows()
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<Preview />);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => root.unmount());
}
