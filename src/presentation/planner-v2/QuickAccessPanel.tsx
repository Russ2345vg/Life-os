import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readQuickAccessCatalog,
  searchQuickAccess,
  type QuickAccessRecord,
} from '../../application/planner/QuickAccessCatalog';
import { LIFE_ACTION_STATUS } from '../../domain';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { PlannerSheet } from './PlannerSheet';
import { useQuickAccess } from './QuickAccessContext';
import type { PlannerServices } from './PlannerWorkspace';
import type { PlannerRoute } from './PlannerNavigation';
import { emptyActionDraft, submitPlannerAction } from './plannerFormSubmission';
import { planPlannerAction } from './plannerTodayCommands';
import './quick-access.css';

const kinds = { action: 'Действие', goal: 'Цель', direction: 'Направление', sphere: 'Сфера' };
const statuses: Record<string, string> = {
  draft: 'Черновик',
  ready: 'Запланировано',
  in_progress: 'В работе',
  active: 'Активно',
  paused: 'На паузе',
  future: 'На будущее',
  achieved: 'Достигнута',
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить запрос. Повторите попытку.';

export function QuickAccessPanel({
  services,
  today,
  onNavigate,
  onOpenAction,
  returnFocusId,
}: {
  readonly services: PlannerServices;
  readonly today: string;
  readonly onNavigate: (route: PlannerRoute) => Promise<boolean> | void;
  readonly onOpenAction?: (id: string) => Promise<boolean>;
  readonly returnFocusId?: string | null;
}) {
  const quick = useQuickAccess();
  const open = quick?.open ?? false;
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [dateChoice, setDateChoice] = useState('');
  const [records, setRecords] = useState<readonly QuickAccessRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dateId, setDateId] = useState<string | null>(null);
  const [pending, setPending] = useState<QuickAccessRecord | null>(null);
  const sequence = useRef(0);
  const saving = useRef(false);
  const mounted = useRef(true);
  const isOpen = useRef(open);
  const stayButton = useRef<HTMLButtonElement>(null);
  const firstResult = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const createInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (pending) stayButton.current?.focus();
  }, [pending]);
  useEffect(() => {
    if (open) (mode === 'search' ? searchInput : createInput).current?.focus();
  }, [open, mode]);
  useEffect(() => {
    if (!open || !returnFocusId || mode !== 'search') return;
    const result = [...document.querySelectorAll<HTMLButtonElement>('.planner-quick-result')].find(
      (button) => button.dataset.recordId === returnFocusId,
    );
    result?.focus({ preventScroll: true });
  }, [open, mode, records, returnFocusId]);
  const load = useCallback(async () => {
    if (!open || !isOpen.current || !mounted.current) return;
    const request = ++sequence.current;
    setLoading(true);
    setReadError(null);
    try {
      const next = await readQuickAccessCatalog(services);
      if (sequence.current === request) setRecords(next);
    } catch (reason: unknown) {
      if (sequence.current === request) {
        setReadError(message(reason));
        setRecords([]);
      }
    } finally {
      if (sequence.current === request) setLoading(false);
    }
  }, [open, services]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      sequence.current += 1;
    };
  }, [load]);
  useSyncContentChanged('lifeActions|goals|directions|spheres|recurrenceRules', load);
  const close = () => {
    isOpen.current = false;
    sequence.current += 1;
    setPending(null);
    setDateId(null);
    quick?.close();
  };
  const navigate = async (record: QuickAccessRecord, discard = false) => {
    const actionHandoff = record.kind === 'action' && onOpenAction;
    const guard = quick?.inspect(actionHandoff ? 'quick-access' : undefined);
    if (saving.current || guard?.busy) {
      setError('Дождитесь завершения сохранения.');
      return;
    }
    if (!discard && (guard?.dirty || title.trim() || dateChoice)) {
      setPending(record);
      return;
    }
    const accepted = actionHandoff
      ? await onOpenAction(record.id)
      : (await onNavigate({ view: record.kind, id: record.id })) !== false;
    if (!accepted) return;
    if (discard) {
      setTitle('');
      setDateChoice('');
    }
    close();
    if (!actionHandoff)
      requestAnimationFrame(() => document.getElementById('planner-main-content')?.focus());
  };
  const run = async (work: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await work();
      if (mounted.current) {
        quick?.changed();
        await load();
      }
    } catch (reason: unknown) {
      if (mounted.current) setError(message(reason));
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  if (!open) return null;
  const results = searchQuickAccess(records, query);
  const selectedDate = records.find((record) => record.kind === 'action' && record.id === dateId);
  const dateLabel = (date: string | null) =>
    date === today
      ? 'Сегодня'
      : date === addDays(today, 1)
        ? 'Завтра'
        : date
          ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(
              new Date(`${date}T12:00:00`),
            )
          : 'Без даты';
  const dates = [
    { value: today, label: 'Сегодня' },
    { value: addDays(today, 1), label: 'Завтра' },
    { value: '', label: 'Без даты' },
  ];
  return (
    <PlannerSheet title="Быстрый доступ" onClose={close} quickAccess>
      <header className="planner-quick-heading">
        <p className="planner-eyebrow">Всегда под рукой</p>
        <h2>Быстрый доступ</h2>
      </header>
      <div className="planner-quick-modes" role="group" aria-label="Режим быстрого доступа">
        <button
          type="button"
          aria-pressed={mode === 'search'}
          onClick={() => {
            setMode('search');
            setPending(null);
          }}
        >
          Найти
        </button>
        <button
          type="button"
          aria-pressed={mode === 'create'}
          onClick={() => {
            setMode('create');
            setPending(null);
          }}
        >
          Добавить действие
        </button>
      </div>
      {mode === 'search' ? (
        <>
          <label className="planner-quick-search">
            <span>Действия, цели, направления и сферы</span>
            <input
              ref={searchInput}
              type="search"
              placeholder="Что найти?"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPending(null);
                setDateId(null);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || loading || readError || pending) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  firstResult.current?.focus();
                }
                if (event.key === 'Enter' && results.items[0]) {
                  event.preventDefault();
                  navigate(results.items[0]);
                }
              }}
            />
          </label>
          {readError ? (
            <div className="planner-quick-state" role="alert">
              <p>Не удалось загрузить записи. {readError}</p>
              <button type="button" onClick={() => void load()}>
                Повторить загрузку
              </button>
            </div>
          ) : loading ? (
            <p className="planner-quick-state" role="status">
              Загружаем записи…
            </p>
          ) : (
            <>
              <p className="planner-quick-count" role="status">
                {query.trim() ? 'Найдено' : 'Записи'}: {results.total}
                {results.total > 30 ? ' · Показаны первые 30. Уточните запрос.' : ''}
              </p>
              {results.total === 0 && (
                <div className="planner-quick-state">
                  <h3>{query.trim() ? 'Ничего не найдено' : 'Пока нет записей'}</h3>
                  <p>
                    {query.trim()
                      ? 'Попробуйте другое название или название цели.'
                      : 'Добавьте первое действие прямо здесь.'}
                  </p>
                </div>
              )}
              <ul className="planner-quick-results" aria-label="Результаты поиска">
                {results.items.map((record, index) => (
                  <li key={`${record.kind}:${record.id}`}>
                    <div className="planner-quick-row">
                      <button
                        ref={index === 0 ? firstResult : undefined}
                        data-record-id={record.id}
                        className="planner-quick-result"
                        type="button"
                        disabled={busy}
                        onClick={() => navigate(record)}
                      >
                        <strong>{record.title}</strong>
                        <span>
                          {[
                            kinds[record.kind],
                            record.context,
                            statuses[record.status],
                            record.recurring ? 'Это повторение' : '',
                            record.kind === 'action' ? dateLabel(record.date) : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                      {record.canSchedule && (
                        <button
                          type="button"
                          className="planner-quick-date"
                          aria-label={`Изменить дату: ${record.title}`}
                          aria-expanded={dateId === record.id}
                          disabled={busy}
                          onClick={() => setDateId(dateId === record.id ? null : record.id)}
                        >
                          Дата
                        </button>
                      )}
                    </div>
                    {selectedDate === record && (
                      <div
                        className="planner-quick-dates"
                        role="group"
                        aria-label={`Дата: ${record.title}`}
                      >
                        {dates
                          .filter((date) => date.value || record.canClearDate)
                          .map((date) => (
                            <button
                              type="button"
                              key={date.label}
                              disabled={busy || (record.date ?? '') === date.value}
                              onClick={() =>
                                void run(async () => {
                                  await planPlannerAction(
                                    services.setLifeActionPlan,
                                    record.id,
                                    date.value,
                                    undefined,
                                    [LIFE_ACTION_STATUS.draft, LIFE_ACTION_STATUS.ready],
                                  );
                                  if (mounted.current) {
                                    setDateId(null);
                                    setNotice(`Дата изменена: ${date.label.toLowerCase()}.`);
                                  }
                                })
                              }
                            >
                              {date.label}
                            </button>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <form
          className="planner-quick-create"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const created = await submitPlannerAction(services.createLifeActionDraft, {
                ...emptyActionDraft(),
                title,
                date:
                  dateChoice === 'today'
                    ? today
                    : dateChoice === 'tomorrow'
                      ? addDays(today, 1)
                      : '',
              });
              if (mounted.current) {
                setTitle('');
                setDateChoice('');
                setQuery(created.title.toString());
                setMode('search');
                setNotice('Действие создано.');
              }
            });
          }}
        >
          <label htmlFor="quick-action-title">Что хотите сделать?</label>
          <VoiceTextInput
            ref={createInput}
            id="quick-action-title"
            value={title}
            onValueChange={setTitle}
            required
            maxLength={200}
            disabled={busy}
            placeholder="Название действия"
          />
          <fieldset disabled={busy}>
            <legend>Когда</legend>
            <div className="planner-quick-dates">
              {[
                { value: 'today', label: 'Сегодня' },
                { value: 'tomorrow', label: 'Завтра' },
                { value: '', label: 'Без даты' },
              ].map((date) => (
                <button
                  type="button"
                  aria-pressed={dateChoice === date.value}
                  key={date.label}
                  onClick={() => setDateChoice(date.value)}
                >
                  {date.label}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="planner-muted">Остальные параметры можно заполнить позже.</p>
          <button className="planner-primary" type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Сохраняем…' : 'Создать действие'}
          </button>
        </form>
      )}
      {pending && (
        <section
          className="planner-quick-confirm"
          role="alertdialog"
          aria-modal="false"
          aria-label="Несохранённые изменения"
        >
          <h3>На текущем экране есть несохранённые изменения</h3>
          <p>При переходе к «{pending.title}» они будут потеряны.</p>
          <div>
            <button
              ref={stayButton}
              type="button"
              onClick={() => {
                setPending(null);
                searchInput.current?.focus();
              }}
            >
              Остаться
            </button>
            <button type="button" onClick={() => navigate(pending, true)}>
              Перейти без сохранения
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="planner-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="planner-quick-notice">
          {notice}
        </p>
      )}
      <footer className="planner-quick-footer">
        Enter — открыть · Tab — выбрать действие · Esc — закрыть
      </footer>
    </PlannerSheet>
  );
}
