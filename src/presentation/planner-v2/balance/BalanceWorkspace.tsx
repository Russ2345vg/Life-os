import { useCallback, useRef, useState } from 'react';
import { useBalanceState } from './useBalanceState';
import type { Goal } from '../../../domain';
import type { BalanceServices } from '../../../application/balance/BalanceServices';
import type { BalanceState } from '../../../application/ports/BalanceRepository';
import {
  projectLifeBalance,
  balancePeriodContext,
  type LifeBalanceProjection,
} from '../../../application/balance/GetLifeBalance';
import { automaticPeriod, cycleAt, type PeriodKind } from '../../../domain/planner/PlanningPeriod';
import type { DirectionIndicator } from '../../../domain/balance/DirectionIndicator';
import { buildPlannerV2Route, type PlannerV2Route } from '../PlannerV2Navigation';
import { BalanceWheel } from './BalanceWheel';
import { BalanceEntityForm } from './BalanceEntityForm';
import { BalanceIndicatorForm } from './BalanceIndicatorForm';
import { balanceImportanceLabels, scoreLabel } from './BalanceLabels';
import './balance.css';

const periods: Record<PeriodKind, string> = {
  year: 'Год',
  quarter: 'Квартал',
  thirty_days: '30 дней',
  week: 'Неделя',
};
const lifecycle = { active: 'Активно', paused: 'На паузе', archived: 'В архиве' };
type Editor =
  | { kind: 'sphere' | 'direction'; id: string | null; sphereId: string | null }
  | { kind: 'indicator'; directionId: string; indicator: DirectionIndicator | null };
export function BalanceWorkspace({
  services,
  today,
  route,
  onNavigate,
}: {
  readonly services: BalanceServices;
  readonly today: string;
  readonly route: PlannerV2Route;
  readonly onNavigate: (r: PlannerV2Route) => void;
}) {
  const query = useBalanceState(services, today);
  const { state, load, refresh } = query;
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<Editor | null>(null),
    [settings, setSettings] = useState(false),
    [kind, setKind] = useState<PeriodKind>('quarter'),
    [busy, setBusy] = useState(false);
  const working = useRef(false);
  const visibleError = error ?? query.error;
  const routeKey = buildPlannerV2Route(route);
  const [renderedRoute, setRenderedRoute] = useState(routeKey);
  if (renderedRoute !== routeKey) {
    setRenderedRoute(routeKey);
    setEditor(null);
    setSettings(false);
    setNotice('');
    setError(null);
  }
  const report = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось загрузить состояние.'),
    [],
  );
  const saved = async () => {
    await load();
    setEditor(null);
    setNotice('Сохранено');
    setError(null);
  };
  const run = async (work: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      await saved();
    } catch (e: unknown) {
      report(e);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const navigate = (target: PlannerV2Route) => {
    setEditor(null);
    setSettings(false);
    setNotice('');
    onNavigate(target);
  };
  const link = (target: PlannerV2Route, label: string) => (
    <a
      href={buildPlannerV2Route(target)}
      onClick={(e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(target);
      }}
    >
      {label}
    </a>
  );
  if (!state)
    return (
      <div>
        {visibleError ? <p role="alert">{visibleError}</p> : <p role="status">Загружаем сферы…</p>}
        <button onClick={refresh}>Обновить</button>
      </div>
    );
  const projection = projectLifeBalance(state, today),
    candidate =
      kind === 'thirty_days' ? cycleAt(state.periods, today) : automaticPeriod(kind, today),
    period = candidate ? (state.periods.find((p) => p.id === candidate.id) ?? candidate) : null;
  const context = balancePeriodContext(state, today, period, projection);
  const sphere =
    route.view === 'sphere'
      ? projection.spheres.find((s) => s.sphere.id.toString() === route.id)
      : undefined;
  const direction =
    route.view === 'direction'
      ? projection.directions.find((d) => d.direction.id.toString() === route.id)
      : undefined;
  const wheel = projection.spheres.filter(
    (s) => s.sphere.status === 'active' && s.sphere.includeInBalanceWheel,
  );
  const periodSelector = (
    <div className="balance-period">
      <label>
        <span>Контекст целей</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>
          {Object.entries(periods).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <span className="planner-muted">
        {period ? `${period.startDate} — ${period.endDate}` : 'Период 30 дней ещё не создан'}
      </span>
    </div>
  );
  const directionRow = (d: LifeBalanceProjection['directions'][number]) => (
    <article className="balance-row" key={d.direction.id.toString()}>
      <div>
        {link({ view: 'direction', id: d.direction.id.toString() }, d.direction.name)}
        <p className="planner-muted">
          {d.direction.mode === 'maintain' ? 'Поддерживаю' : 'Развиваю'} ·{' '}
          {lifecycle[d.direction.status]} · Активных целей: {d.activeGoals.length}
        </p>
        {d.nextAction && (
          <p>
            Далее:{' '}
            {link(
              { view: 'action', id: d.nextAction.id.toString() },
              d.nextAction.title.toString(),
            )}
          </p>
        )}
      </div>
      <strong>
        {scoreLabel(d.effectiveScore)}
        {d.effectiveScore !== null && <small> / 10</small>}
      </strong>
    </article>
  );
  const goalRows = (goals: readonly Goal[]) =>
    goals.map((g) => (
      <div className="balance-row" key={g.id.toString()}>
        {link({ view: 'goal', id: g.id.toString() }, g.title)}
        <span className="planner-muted">{g.dueDate ?? 'Без срока'}</span>
      </div>
    ));
  return (
    <section className="balance-workspace">
      {notice && (
        <p role="status" className="planner-notice">
          {notice}
        </p>
      )}
      {visibleError && (
        <p role="alert" className="planner-error">
          {visibleError} <button onClick={refresh}>Обновить</button>
        </p>
      )}
      {editor ? (
        <BalanceEditor
          key={JSON.stringify(editor)}
          editor={editor}
          state={state}
          services={services}
          onSaved={saved}
          onCancel={() => setEditor(null)}
        />
      ) : route.view === 'spheres' ? (
        <>
          <header className="balance-header">
            <div>
              <p className="planner-eyebrow">Сферы</p>
              <h1>Состояние жизни</h1>
              <p className="planner-muted">Что важно поддерживать. Куда направить внимание.</p>
            </div>
            <button onClick={() => setEditor({ kind: 'sphere', id: null, sphereId: null })}>
              Новая сфера
            </button>
          </header>
          {periodSelector}
          <div className="balance-overview">
            <div>
              <BalanceWheel
                items={wheel.map((s) => ({
                  id: s.sphere.id.toString(),
                  name: s.sphere.name,
                  score: s.effectiveScore,
                  desired: s.sphere.desiredLevel,
                }))}
              />
              <p className="balance-legend">
                <span>● Состояние</span>
                <span>┄ Желаемый уровень</span>
                <span>— Нет данных</span>
              </p>
            </div>
            <div className="balance-wheel-key">
              <h2>Колесо состояния жизни</h2>
              <p className="planner-muted">Текущее состояние не зависит от выбранного периода.</p>
              {wheel.map((s, i) => (
                <div className="balance-key-row" key={s.sphere.id.toString()}>
                  <span>{i + 1}</span>
                  {link({ view: 'sphere', id: s.sphere.id.toString() }, s.sphere.name)}
                  <strong>{scoreLabel(s.effectiveScore)}</strong>
                </div>
              ))}
              <button aria-expanded={settings} onClick={() => setSettings(!settings)}>
                Настроить колесо
              </button>
            </div>
          </div>
          {settings && (
            <section className="balance-panel">
              <h2>Сферы в колесе</h2>
              {state.spheres
                .filter((s) => s.status === 'active')
                .map((s) => (
                  <label className="balance-check" key={s.id.toString()}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={s.includeInBalanceWheel}
                      onChange={(e) => {
                        const include = e.target.checked;
                        void run(async () => {
                          const result = await services.updateSphere.execute({
                            id: s.id,
                            expectedVersion: s.version,
                            name: s.name,
                            includeInBalanceWheel: include,
                          });
                          if (!result.ok) throw result.error;
                        });
                      }}
                    />
                    {s.name}
                  </label>
                ))}
            </section>
          )}
          <div className="balance-section-heading">
            <h2>Сферы</h2>
            <span className="planner-muted">
              Рекомендации помогают выбрать фокус и не ограничивают план.
            </span>
          </div>
          {!state.spheres.length && (
            <p className="planner-empty">Пока нет сфер. Создайте первую важную часть жизни.</p>
          )}
          {projection.spheres.map((s) => {
            const c = context[s.sphere.id.toString()];
            return (
              <article className="balance-sphere-card" key={s.sphere.id.toString()}>
                <div className="balance-row">
                  <div>
                    {link({ view: 'sphere', id: s.sphere.id.toString() }, s.sphere.name)}
                    <p className="planner-muted">
                      {s.sphere.status === 'archived'
                        ? 'В архиве'
                        : `Активных направлений: ${s.directions.filter((d) => d.direction.status === 'active').length}`}
                    </p>
                  </div>
                  <strong>
                    {scoreLabel(s.effectiveScore)}
                    {s.effectiveScore !== null && <small> / 10</small>}
                  </strong>
                </div>
                <div className="balance-metrics">
                  <span>
                    Желаемый <b>{scoreLabel(s.sphere.desiredLevel)}</b>
                  </span>
                  <span>
                    Дефицит внимания <b>{scoreLabel(s.attentionNeed)}</b>
                  </span>
                  <span>
                    Прогресс целей{' '}
                    <b>
                      {c?.progress == null ? 'Нет данных' : `${Math.round(c.progress)}%`}
                      {c?.incomplete ? ' · неполные данные' : ''}
                    </b>
                  </span>
                  <span>
                    Рекомендуемый фокус{' '}
                    <b>{c?.recommended == null ? 'Нет данных' : `${c.recommended} целей`}</b>
                  </span>
                </div>
              </article>
            );
          })}
          {projection.directions.some((d) => d.direction.sphereId === null) && (
            <details>
              <summary>Направления без сферы</summary>
              {projection.directions.filter((d) => d.direction.sphereId === null).map(directionRow)}
            </details>
          )}
        </>
      ) : sphere ? (
        <>
          <p>{link({ view: 'spheres' }, '← Сферы')}</p>
          <header className="balance-header">
            <div>
              <p className="planner-eyebrow">Сфера</p>
              <h1>{sphere.sphere.name}</h1>
            </div>
            <button
              onClick={() =>
                setEditor({ kind: 'sphere', id: sphere.sphere.id.toString(), sphereId: null })
              }
            >
              Редактировать
            </button>
          </header>
          <BalanceScore
            effective={sphere.effectiveScore}
            automatic={sphere.automaticScore}
            manual={sphere.manualScore}
          />
          <div className="balance-metrics">
            <span>
              Желаемый уровень <b>{scoreLabel(sphere.sphere.desiredLevel)}</b>
            </span>
            <span>
              Важность <b>{balanceImportanceLabels[sphere.sphere.importance]}</b>
            </span>
            <span>
              Дефицит внимания <b>{scoreLabel(sphere.attentionNeed)}</b>
            </span>
          </div>
          {periodSelector}
          <p>
            Прогресс целей:{' '}
            {context[sphere.sphere.id.toString()]?.progress == null
              ? 'Нет данных'
              : `${Math.round(context[sphere.sphere.id.toString()]!.progress!)}%`}
          </p>
          <div className="balance-actions">
            {link({ view: 'goals', sphereId: sphere.sphere.id.toString() }, 'Цели этой сферы')}
            {link({ view: 'planning', sphereId: sphere.sphere.id.toString() }, 'Планы этой сферы')}
          </div>
          <div className="balance-section-heading">
            <h2>Направления</h2>
            <button
              onClick={() =>
                setEditor({ kind: 'direction', id: null, sphereId: sphere.sphere.id.toString() })
              }
            >
              Новое направление
            </button>
          </div>
          {sphere.directions.length ? (
            sphere.directions.map(directionRow)
          ) : (
            <p className="planner-empty">
              Пока нет направлений. Добавьте то, что хотите развивать или поддерживать.
            </p>
          )}
          <BalanceHistory state={state} entityType="sphere" id={sphere.sphere.id.toString()} />
        </>
      ) : direction ? (
        <>
          <p>
            {direction.direction.sphereId
              ? link(
                  { view: 'sphere', id: direction.direction.sphereId.toString() },
                  `← ${state.spheres.find((s) => s.id.equals(direction.direction.sphereId!))?.name ?? 'Сфера'}`,
                )
              : link({ view: 'spheres' }, '← Сферы')}
          </p>
          <header className="balance-header">
            <div>
              <p className="planner-eyebrow">
                Направление · {direction.direction.mode === 'maintain' ? 'Поддерживаю' : 'Развиваю'}{' '}
                · {lifecycle[direction.direction.status]}
              </p>
              <h1>{direction.direction.name}</h1>
            </div>
            <button
              onClick={() =>
                setEditor({
                  kind: 'direction',
                  id: direction.direction.id.toString(),
                  sphereId: null,
                })
              }
            >
              Редактировать
            </button>
          </header>
          <div className="balance-state-text">
            <div>
              <h2>Сейчас</h2>
              <p>{direction.direction.currentStateText || 'Текущее состояние пока не описано.'}</p>
            </div>
            <div>
              <h2>Хочу</h2>
              <p>{direction.direction.desiredState || 'Желаемое состояние пока не описано.'}</p>
            </div>
          </div>
          <BalanceScore
            effective={direction.effectiveScore}
            automatic={direction.automaticScore}
            manual={direction.manualScore}
          />
          <div className="balance-section-heading">
            <h2>Показатели · {direction.indicators.length}/5</h2>
            <button
              onClick={() => {
                if (direction.indicators.length >= 5) {
                  setNotice('Можно добавить до пяти показателей.');
                  return;
                }
                setEditor({
                  kind: 'indicator',
                  directionId: direction.direction.id.toString(),
                  indicator: null,
                });
              }}
            >
              Добавить показатель
            </button>
          </div>
          {!direction.indicators.length && (
            <p className="planner-empty">
              Какие признаки говорят, что здесь всё хорошо? Добавьте до пяти показателей.
            </p>
          )}
          {direction.indicators.map(({ indicator, score, sourceUnavailable }) => (
            <article key={indicator.id} className="balance-indicator">
              <div>
                <h3>{indicator.name}</h3>
                <p className="planner-muted">
                  {balanceImportanceLabels[indicator.importance]} ·{' '}
                  {indicator.sourceType === 'manual'
                    ? 'Вручную'
                    : sourceUnavailable
                      ? 'Источник недоступен'
                      : link(
                          { view: 'goal', id: indicator.sourceGoalId! },
                          state.goals.find((g) => g.id.toString() === indicator.sourceGoalId)
                            ?.title ?? 'Количественная цель',
                        )}
                </p>
              </div>
              <strong>{scoreLabel(score)}</strong>
              <div className="balance-actions">
                <button
                  onClick={() =>
                    setEditor({
                      kind: 'indicator',
                      directionId: direction.direction.id.toString(),
                      indicator,
                    })
                  }
                  aria-label={`Изменить показатель ${indicator.name}`}
                >
                  Изменить
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    void run(() => services.indicators.remove(indicator.id, indicator.version));
                  }}
                  aria-label={`Удалить показатель ${indicator.name}`}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}
          <h2>Активные цели</h2>
          {direction.activeGoals.some((g) => g.dueDate !== null || g.isMain) ? (
            goalRows(direction.activeGoals.filter((g) => g.dueDate !== null || g.isMain))
          ) : (
            <p className="planner-empty">
              {direction.activeGoals.length
                ? 'Цели без срока доступны ниже, в разделе «Без срока и на будущее».'
                : direction.direction.mode === 'maintain'
                  ? 'Поддерживать направление можно без активной цели.'
                  : 'Активных целей пока нет.'}
            </p>
          )}
          <h2>Следующее действие</h2>
          {direction.nextAction ? (
            <p>
              {link(
                { view: 'action', id: direction.nextAction.id.toString() },
                direction.nextAction.title.toString(),
              )}
            </p>
          ) : (
            <p className="planner-muted">Следующее действие не выбрано.</p>
          )}
          <details>
            <summary>Без срока и на будущее</summary>
            {goalRows(
              direction.goals.filter(
                (g) =>
                  g.status === 'future' ||
                  (g.status === 'active' && g.dueDate === null && !g.isMain),
              ),
            )}
          </details>
          <details>
            <summary>Достигнутые цели</summary>
            {goalRows(direction.goals.filter((g) => g.status === 'achieved'))}
          </details>
          <details>
            <summary>Приостановленные и архивные цели</summary>
            {goalRows(
              direction.goals.filter((g) => g.status === 'paused' || g.status === 'archived'),
            )}
          </details>
          <BalanceHistory
            state={state}
            entityType="direction"
            id={direction.direction.id.toString()}
          />
        </>
      ) : (
        <p role="alert">Запись не найдена. {link({ view: 'spheres' }, 'Открыть сферы')}</p>
      )}
    </section>
  );
}
function BalanceEditor({
  editor,
  state,
  services,
  onSaved,
  onCancel,
}: {
  readonly editor: Editor;
  readonly state: BalanceState;
  readonly services: BalanceServices;
  readonly onSaved: () => Promise<void>;
  readonly onCancel: () => void;
}) {
  return editor.kind === 'indicator' ? (
    <BalanceIndicatorForm
      indicator={editor.indicator}
      directionId={editor.directionId}
      goals={state.goals}
      services={services}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  ) : (
    <BalanceEntityForm
      kind={editor.kind}
      entity={
        (editor.kind === 'sphere' ? state.spheres : state.directions).find(
          (e) => e.id.toString() === editor.id,
        ) ?? null
      }
      sphereId={editor.sphereId}
      spheres={state.spheres}
      services={services}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}
function BalanceScore({
  effective,
  automatic,
  manual,
}: {
  readonly effective: number | null;
  readonly automatic: number | null;
  readonly manual: number | null;
}) {
  return (
    <div className="balance-score">
      <span className="planner-muted">Состояние</span>
      <strong>
        {scoreLabel(effective)}
        {effective !== null && <small> / 10</small>}
      </strong>
      <span>
        Автоматически: {scoreLabel(automatic)}
        {manual !== null ? ` · Вручную: ${scoreLabel(manual)}` : ''}
      </span>
    </div>
  );
}
function BalanceHistory({
  state,
  entityType,
  id,
}: {
  readonly state: BalanceState;
  readonly entityType: 'sphere' | 'direction';
  readonly id: string;
}) {
  const history = state.snapshots
    .filter((s) => s.entityType === entityType && s.entityId === id)
    .sort((a, b) => b.month.localeCompare(a.month));
  return (
    <details>
      <summary>Состояние по месяцам</summary>
      {history.length ? (
        history.map((s) => (
          <div className="balance-row" key={s.id}>
            <span>{s.month}</span>
            <span>
              {scoreLabel(s.effectiveScore)}{' '}
              <small className="planner-muted">
                авто {scoreLabel(s.automaticScore)}
                {s.manualScore !== null ? ` · вручную ${scoreLabel(s.manualScore)}` : ''}
              </small>
            </span>
          </div>
        ))
      ) : (
        <p>История пока не появилась.</p>
      )}
    </details>
  );
}
