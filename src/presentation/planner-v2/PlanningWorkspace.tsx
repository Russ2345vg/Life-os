import { useEffect, useRef, useState } from 'react';
import { sphereForGoal } from '../../application/balance/GetLifeBalance';
import type { BalanceState } from '../../application/ports/BalanceRepository';
import type { Goal, LifeAction } from '../../domain';
import { selectActionOptions, recurrenceLabel } from '../../application/planner/actionSelection';
import {
  automaticPeriod,
  addDays,
  cycleAt,
  focusWarning,
  nextSevenDays,
  type PlanningPeriod,
} from '../../domain/planner/PlanningPeriod';
import { usePlanning } from './PlanningContext';
import { PlanningProgress } from './PlanningProgress';
import { PlanningActionDetails } from './PlanningActionDetails';
import type { PlannerV2Services } from './PlannerV2Workspace';
import type { PlannerV2Route } from './PlannerV2Navigation';
import { changePlannerGoalStatus } from './plannerGoalCommands';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import './planning.css';

const views = {
  year: 'Год',
  quarter: 'Квартал',
  thirty_days: '30 дней',
  week: 'Неделя',
  next7: 'Ближайшие 7 дней',
  unplanned: 'Без периода',
} as const;
type View = keyof typeof views;
export function PlanningWorkspace({
  today,
  services,
  onNavigate,
  sphereId = null,
}: {
  readonly today: string;
  readonly services: PlannerV2Services;
  readonly onNavigate: (route: PlannerV2Route) => void;
  readonly sphereId?: string | null;
}) {
  const context = usePlanning();
  const [balanceState, setBalanceState] = useState<BalanceState | null>(null);
  useEffect(() => {
    let active = true;
    if (sphereId && services.balance)
      void services.balance.read
        .execute()
        .then((s) => {
          if (active) setBalanceState(s);
        })
        .catch(() => {
          if (active) setBalanceState(null);
        });
    return () => {
      active = false;
    };
  }, [services.balance, sphereId, context?.state]);
  const [view, setView] = useState<View>('week'),
    [anchor, setAnchor] = useState(today),
    [search, setSearch] = useState(''),
    [pick, setPick] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [historyId, setHistoryId] = useState<string | null>(null);
  const working = useRef(false);
  const run = async (work: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      await context?.refresh();
      setNotice('Сохранено');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  if (!context) return <p role="alert">Планирование недоступно в этой сборке.</p>;
  if (!context.state)
    return (
      <p role={context.error ? 'alert' : 'status'}>{context.error ?? 'Загружаем планирование…'}</p>
    );
  const s = context.state;
  const acceptsGoal = (id: string) =>
    !sphereId || Boolean(balanceState && sphereForGoal(balanceState, id) === sphereId);
  const acceptsAction = (a: LifeAction) =>
    !sphereId ||
    (a.goalId ? acceptsGoal(a.goalId.toString()) : a.sphereId?.toString() === sphereId);
  const candidate =
    view === 'year' || view === 'quarter' || view === 'week' ? automaticPeriod(view, anchor) : null;
  const period = historyId
    ? (s.periods.find((p) => p.id === historyId) ?? null)
    : candidate
      ? (s.periods.find((p) => p.id === candidate.id) ?? candidate)
      : view === 'thirty_days'
        ? cycleAt(s.periods, anchor)
        : null;
  const members = period ? s.memberships.filter((m) => m.periodId === period.id && !m.removed) : [];
  const inCurrentPlan = (type: 'goal' | 'action' | 'rule', id: string) =>
    s.memberships.some(
      (m) =>
        m.entityType === type &&
        m.entityId === id &&
        !m.removed &&
        s.periods.some((p) => p.id === m.periodId && p.endDate >= today),
    );
  const range = nextSevenDays(today);
  const matches = (
    type: 'goal' | 'action' | 'rule',
    id: string,
    date: string | null,
    recurring = false,
  ) =>
    view === 'unplanned'
      ? !inCurrentPlan(type, id)
      : view === 'next7'
        ? Boolean(date && date >= range.startDate && date <= range.endDate)
        : members.some((m) => m.entityType === type && m.entityId === id) ||
          (recurring &&
            period?.kind === 'week' &&
            Boolean(date && date >= period.startDate && date <= period.endDate) &&
            !s.memberships.some(
              (m) =>
                m.periodId === period.id && m.entityType === type && m.entityId === id && m.removed,
            ));
  const goals = s.goals.filter(
    (g) =>
      acceptsGoal(g.id.toString()) &&
      (g.status !== 'archived' || Boolean(period && period.endDate < today)) &&
      matches('goal', g.id.toString(), g.dueDate) &&
      g.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const actions = s.actions.filter(
    (a) =>
      acceptsAction(a) &&
      (!a.isArchived() || Boolean(period && period.endDate < today)) &&
      ((a.occurrence &&
        period &&
        !s.memberships.some(
          (m) =>
            m.periodId === period.id &&
            m.entityType === 'action' &&
            m.entityId === a.id.toString() &&
            m.removed,
        ) &&
        members.some((m) => m.entityType === 'rule' && m.entityId === a.occurrence?.ruleId) &&
        Boolean(
          a.plannedDate &&
          a.plannedDate.toString() >= period.startDate &&
          a.plannedDate.toString() <= period.endDate,
        )) ||
        matches(
          'action',
          a.id.toString(),
          a.plannedDate?.toString() ?? null,
          a.occurrence !== null,
        )) &&
      a.title.toString().toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const focused = members.filter(
    (m) =>
      m.entityType === 'goal' &&
      m.focused &&
      s.goals.some((g) => g.id.toString() === m.entityId && g.status === 'active'),
  );
  const warning = period ? focusWarning(period.kind, focused.length) : null;
  const parent =
    period?.kind === 'quarter'
      ? automaticPeriod('year', period.startDate)
      : period?.kind === 'thirty_days'
        ? automaticPeriod('quarter', period.startDate)
        : period?.kind === 'week'
          ? s.periods.find(
              (p) =>
                p.kind === 'thirty_days' &&
                p.startDate <= period.startDate &&
                p.endDate >= period.startDate,
            )
          : null;
  const suggested = new Set(
    s.memberships
      .filter((m) => m.periodId === parent?.id && !m.removed)
      .map((m) => `${m.entityType}:${m.entityId}`),
  );
  const pickables = [
    ...s.goals
      .filter((g) => g.status !== 'archived' && acceptsGoal(g.id.toString()))
      .map((g) => ({ key: `goal:${g.id.toString()}`, title: g.title })),
    ...selectActionOptions(
      s.actions.filter(acceptsAction),
      s.rules.filter(
        (r) => !sphereId || (r.goalId ? acceptsGoal(r.goalId) : r.sphereId === sphereId),
      ),
      search,
    ).map((o) => ({
      key: o.selection.kind === 'series' ? 'rule:' + o.selection.ruleId : o.key,
      title: o.title + (o.selection.kind === 'series' ? ' · ↻ ' + recurrenceLabel(o.rule) : ''),
    })),
  ]
    .filter((v) => !members.some((m) => `${m.entityType}:${m.entityId}` === v.key))
    .sort((a, b) => Number(suggested.has(b.key)) - Number(suggested.has(a.key)));
  const nextPeriod = (p: PlanningPeriod): PlanningPeriod | null =>
    p.kind === 'thirty_days'
      ? (s.periods
          .filter((v) => v.kind === 'thirty_days' && v.startDate > p.startDate)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null)
      : automaticPeriod(p.kind, addDays(p.endDate, 1));
  const decisions = (type: 'goal' | 'action' | 'rule', id: string) =>
    period && period.endDate < today ? (
      <div className="planning-inline">
        {s.decisions.some(
          (d) => d.periodId === period.id && d.entityType === type && d.entityId === id,
        ) ? (
          <span className="planner-muted">Решение сохранено</span>
        ) : (
          <>
            {type === 'goal' && (
              <button
                disabled={busy}
                onClick={() => {
                  void run(() =>
                    context.services.periods.carryover(period.id, type, id, 'achieved', null),
                  );
                }}
              >
                Цель достигнута
              </button>
            )}
            <button
              disabled={busy || !nextPeriod(period)}
              onClick={() => {
                void run(() =>
                  context.services.periods.carryover(
                    period.id,
                    type,
                    id,
                    'continue',
                    nextPeriod(period),
                  ),
                );
              }}
            >
              Продолжить в следующем
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void run(() =>
                  context.services.periods.carryover(period.id, type, id, 'unplanned', null),
                );
              }}
            >
              Оставить без периода
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void run(() =>
                  context.services.periods.carryover(period.id, type, id, 'stop', null),
                );
              }}
            >
              Не продолжать
            </button>
          </>
        )}
      </div>
    ) : null;
  const remove = (type: 'goal' | 'action' | 'rule', id: string) =>
    period && (
      <button
        disabled={busy}
        onClick={() => {
          void run(() =>
            context.services.periods.participate(period.kind, period.startDate, type, id, true),
          );
        }}
      >
        Убрать из периода
      </button>
    );
  const goalRow = (g: Goal) => {
    const savedDecision = s.decisions.find(
      (d) => d.periodId === period?.id && d.entityType === 'goal' && d.entityId === g.id.toString(),
    );
    const snapshot = savedDecision?.resultAtDecision,
      status = savedDecision?.statusAtDecision ?? g.status;
    return (
      <article key={g.id.toString()} className="planning-row">
        <div className="planning-row-heading">
          <h3>{snapshot?.title ?? g.title}</h3>
          <span className="planner-muted">
            {status === 'achieved'
              ? 'Достигнута'
              : status === 'active'
                ? 'Активна'
                : status === 'paused'
                  ? 'На паузе'
                  : 'На будущее'}
          </span>
        </div>
        {snapshot ? (
          <p>
            Результат при завершении:{' '}
            {snapshot.current === null
              ? 'Без числового измерения'
              : `${snapshot.current} / ${snapshot.target} ${snapshot.unit}${snapshot.percent === null ? '' : ` · ${snapshot.percent}%`}`}
          </p>
        ) : (
          <PlanningProgress
            goal={g}
            date={period && period.endDate < today ? period.endDate : today}
            editable={!period || period.endDate >= today}
            onAchieve={() => {
              void run(() =>
                changePlannerGoalStatus(services.updateGoal, g, 'achieved', services.archiveGoal),
              );
            }}
          />
        )}
        {g.dueDate && <p className="planner-muted">Срок: {g.dueDate}</p>}
        <div className="planning-inline">
          {period && g.status === 'active' && (
            <label>
              Фокус
              <select
                disabled={busy}
                value={
                  focused.some((m) => m.entityId === g.id.toString())
                    ? period.primaryGoalId === g.id.toString()
                      ? 'primary'
                      : 'supporting'
                    : ''
                }
                onChange={(e) => {
                  void run(() =>
                    context.services.periods.setFocus(
                      period.kind,
                      period.startDate,
                      g.id.toString(),
                      (e.target.value as 'primary' | 'supporting') || null,
                    ),
                  );
                }}
              >
                <option value="">Не в фокусе</option>
                <option value="primary">Главная</option>
                <option value="supporting">Поддерживающая</option>
              </select>
            </label>
          )}
          {remove('goal', g.id.toString())}
          <a href={`#/v2/goals/${encodeURIComponent(g.id.toString())}`}>Открыть цель</a>
        </div>
        {decisions('goal', g.id.toString())}
      </article>
    );
  };
  const actionRow = (a: LifeAction) => (
    <article key={a.id.toString()} className="planning-row">
      <h3>
        <a href={`#/v2/actions/${encodeURIComponent(a.id.toString())}`}>{a.title.toString()}</a>
      </h3>
      <p className="planner-muted">
        {a.plannedDate?.toString() ?? 'Без даты'}
        {a.occurrence ? ' · Повторяется' : ''}
        {a.status === 'completed'
          ? ' · Выполнено'
          : a.status === 'cancelled'
            ? ` · ${a.cancelReason?.toString() ?? 'Отменено'}`
            : ''}
        {a.priority
          ? ` · Приоритет: ${a.priority === 'high' ? 'высокий' : a.priority === 'low' ? 'низкий' : 'обычный'}`
          : ''}
      </p>
      <PlanningActionDetails action={a} today={today} />
      {remove('action', a.id.toString())}
      {decisions('action', a.id.toString())}
    </article>
  );
  return (
    <section className="planning-workspace">
      <header className="planner-page-heading">
        <div>
          <p className="planner-eyebrow">От намерения к действию</p>
          <h1>Планирование</h1>
        </div>
        <button onClick={() => onNavigate({ view: 'new-goal' })}>Новая цель</button>
      </header>
      {sphereId && (
        <p>
          Сфера:{' '}
          {balanceState?.spheres.find((s) => s.id.toString() === sphereId)?.name ?? 'Загружаем…'}{' '}
          <button onClick={() => onNavigate({ view: 'planning' })}>Все сферы</button>
        </p>
      )}
      <nav className="planning-tabs" aria-label="Период планирования">
        {Object.entries(views).map(([key, title]) => (
          <button
            key={key}
            aria-pressed={view === key}
            onClick={() => {
              setView(key as View);
              setPick('');
              setHistoryId(null);
            }}
          >
            {title}
          </button>
        ))}
      </nav>
      {view !== 'next7' && view !== 'unplanned' && (
        <label className="planning-date">
          Дата внутри периода
          <input
            type="date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) {
                setAnchor(e.target.value);
                setHistoryId(null);
              }
            }}
          />
        </label>
      )}
      {period && (
        <div className="planning-period">
          <p className="planner-muted">
            {period.startDate} — {period.endDate}
            {period.endDate < today ? ' · История периода' : ''}
          </p>
          <OutcomeEditor
            key={period.id + period.version}
            period={period}
            busy={busy}
            onSave={(value) =>
              run(() => context.services.periods.setOutcome(period.kind, period.startDate, value))
            }
          />
          <p className="planner-muted">
            Фокус: {focused.length}. Рекомендуется{' '}
            {period.kind === 'year'
              ? '3–5 целей'
              : period.kind === 'week'
                ? '1 главная и до 3 поддерживающих'
                : period.kind === 'quarter'
                  ? '3–4 цели'
                  : '2–4 цели'}
            . {warning}
          </p>
        </div>
      )}
      {view === 'thirty_days' &&
        s.periods.filter(
          (p) => p.kind === 'thirty_days' && p.startDate <= anchor && p.endDate >= anchor,
        ).length > 1 && (
          <p role="status">
            На устройствах начаты пересекающиеся циклы. Основным считается начатый раньше; оба
            доступны в истории, их состав сохранён.
          </p>
        )}
      {view === 'thirty_days' && !period && (
        <div className="planner-empty">
          <h2>Ваши следующие 30 дней</h2>
          <p>Цикл фиксируется на 30 дней с выбранной даты.</p>
          <button
            disabled={busy}
            onClick={() => {
              void run(() => context.services.periods.startCycle(anchor));
            }}
          >
            Начать 30 дней
          </button>
        </div>
      )}
      {view === 'next7' && (
        <p className="planner-muted">
          {range.startDate} — {range.endDate}. Действия по дате и цели с точным сроком.
        </p>
      )}
      {view === 'unplanned' && (
        <p className="planner-muted">
          Цели и действия без участия в текущем или будущем плане. Дата сохраняется независимо от
          периода.
        </p>
      )}
      <div className="planner-toolbar">
        <VoiceField>
          <span>Поиск</span>
          <VoiceTextInput id="planning-search" value={search} onValueChange={setSearch} />
        </VoiceField>
        {period && (
          <>
            <label>
              Добавить в период
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Выберите цель или действие</option>
                {pickables.map((v) => (
                  <option key={v.key} value={v.key}>
                    {suggested.has(v.key) ? 'Из старшего плана · ' : ''}
                    {v.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !pick}
              onClick={() => {
                const split = pick.indexOf(':');
                void run(() =>
                  context.services.periods.participate(
                    period.kind,
                    period.startDate,
                    pick.slice(0, split) as 'goal' | 'action' | 'rule',
                    pick.slice(split + 1),
                  ),
                );
                setPick('');
              }}
            >
              Добавить
            </button>
          </>
        )}
      </div>
      {(error || context.error) && <p role="alert">{error ?? context.error}</p>}
      {notice && (
        <p role="status" className="planner-muted">
          {notice}
        </p>
      )}
      {goals.length + actions.length === 0 && (
        <p className="planner-empty">
          Пока ничего нет. Добавьте существующую цель или действие — дата и статус останутся
          прежними.
        </p>
      )}
      <div className="planning-columns">
        <section aria-label="Цели плана">
          <h2>Цели · {goals.length}</h2>
          {goals.map(goalRow)}
        </section>
        <section aria-label="Действия плана">
          <h2>Действия · {actions.length}</h2>
          {members
            .filter((m) => m.entityType === 'rule')
            .map((m) => {
              const r = s.rules.find((r) => r.id === m.entityId);
              return r &&
                r.title.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')) &&
                (!sphereId || (r.goalId ? acceptsGoal(r.goalId) : r.sphereId === sphereId)) ? (
                <article className="planning-row" key={m.id}>
                  <h3>↻ {r.title}</h3>
                  <p className="planner-muted">{recurrenceLabel(r)}</p>
                  {remove('rule', r.id)}
                  {decisions('rule', r.id)}
                </article>
              ) : null;
            })}
          {period?.kind === 'week' ? (
            <>
              {Array.from({ length: 7 }, (_, i) => addDays(period.startDate, i)).map((date) => (
                <section key={date}>
                  <h3 className="planner-muted">
                    {new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </h3>
                  {actions
                    .filter((a) => a.status !== 'completed' && a.plannedDate?.toString() === date)
                    .slice(0, 30)
                    .map(actionRow)}
                </section>
              ))}
              <h3>Без конкретного дня</h3>
              {actions
                .filter((a) => a.status !== 'completed' && !a.plannedDate)
                .slice(0, 30)
                .map(actionRow)}
              {actions.some(
                (a) =>
                  a.plannedDate &&
                  (a.plannedDate.toString() < period.startDate ||
                    a.plannedDate.toString() > period.endDate),
              ) && (
                <>
                  <h3>Дата за пределами недели</h3>
                  {actions
                    .filter(
                      (a) =>
                        a.status !== 'completed' &&
                        a.plannedDate &&
                        (a.plannedDate.toString() < period.startDate ||
                          a.plannedDate.toString() > period.endDate),
                    )
                    .slice(0, 30)
                    .map(actionRow)}
                </>
              )}
              <details>
                <summary>
                  Выполнено · {actions.filter((a) => a.status === 'completed').length}
                </summary>
                {actions
                  .filter((a) => a.status === 'completed')
                  .slice(0, 60)
                  .map(actionRow)}
              </details>
            </>
          ) : (
            actions.slice(0, 60).map(actionRow)
          )}
          {actions.length > 60 && <a href="#/v2/actions">Все действия</a>}
        </section>
      </div>
      {s.periods.some((p) => p.kind === 'thirty_days') && (
        <details>
          <summary>История 30-дневных циклов</summary>
          {s.periods
            .filter((p) => p.kind === 'thirty_days')
            .sort((a, b) => b.startDate.localeCompare(a.startDate))
            .map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setView('thirty_days');
                  setAnchor(p.startDate);
                  setHistoryId(p.id);
                }}
              >
                {p.startDate} — {p.endDate}
              </button>
            ))}
        </details>
      )}
    </section>
  );
}
function OutcomeEditor({
  period,
  busy,
  onSave,
}: {
  readonly period: PlanningPeriod;
  readonly busy: boolean;
  readonly onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(period.outcome);
  return (
    <div className="planning-outcome">
      <VoiceField>
        <span>Главный результат периода · необязательно</span>
        <VoiceTextInput
          id="period-outcome"
          value={value}
          onValueChange={setValue}
          maxLength={2000}
          placeholder="Что должно измениться к концу периода?"
        />
      </VoiceField>
      <button
        disabled={busy || value === period.outcome}
        onClick={() => {
          void onSave(value);
        }}
      >
        Сохранить
      </button>
    </div>
  );
}
