import { EntityNeedText } from '../EntityNeedText';
import { groupPlannerActions, isOpenAction } from '../plannerCatalogModel';
import { useQuickAccessGuard } from '../QuickAccessContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBalanceState } from './useBalanceState';
import type { Goal } from '../../../domain';
import { DomainError } from '../../../shared/errors/DomainError';
import type { BalanceServices } from '../../../application/balance/BalanceServices';
import type { BalanceState } from '../../../application/ports/BalanceRepository';
import type { DirectionDependency } from '../../../application/ports/DirectionDeletionRepository';
import {
  projectLifeBalance,
  balancePeriodContext,
  type LifeBalanceProjection,
} from '../../../application/balance/GetLifeBalance';
import { automaticPeriod, cycleAt, type PeriodKind } from '../../../domain/planner/PlanningPeriod';
import type { DirectionIndicator } from '../../../domain/balance/DirectionIndicator';
import { buildPlannerRoute, type PlannerRoute } from '../PlannerNavigation';
import { BalanceWheel } from './BalanceWheel';
import { BalanceEntityForm } from './BalanceEntityForm';
import { BalanceIndicatorForm } from './BalanceIndicatorForm';
import { balanceImportanceLabels, scoreLabel } from './BalanceLabels';
import { VoiceTextInput } from '../../voice-input/VoiceTextInput';
import { EntityContextMenu, type EntityMenuAction } from '../EntityContextMenu';
import { PlannerSheet } from '../PlannerSheet';
import { ActionResults } from '../ActionResults';
import { actionResultsForDirection } from '../actionResultsModel';
import './balance.css';

const periods: Record<PeriodKind, string> = {
  year: 'Год',
  quarter: 'Квартал',
  thirty_days: '30 дней',
  week: 'Неделя',
};
const lifecycle = { active: 'Активно', paused: 'На паузе', archived: 'В архиве' };
type Editor =
  | {
      kind: 'sphere' | 'direction';
      id: string | null;
      sphereId: string | null;
      scoreContext?: { automaticScore: number | null };
    }
  | { kind: 'indicator'; directionId: string; indicator: DirectionIndicator | null };
export function BalanceWorkspace({
  services,
  today,
  route,
  onNavigate,
}: {
  readonly services: BalanceServices;
  readonly today: string;
  readonly route: PlannerRoute;
  readonly onNavigate: (r: PlannerRoute) => void;
}) {
  const query = useBalanceState(services, today);
  const { state, load, refresh } = query;
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<Editor | null>(null),
    [settings, setSettings] = useState(false),
    [kind, setKind] = useState<PeriodKind>('quarter'),
    [directionFilter, setDirectionFilter] = useState<
      'all' | 'develop' | 'maintain' | 'paused' | 'without-goal' | 'attention'
    >('all'),
    [directionSearch, setDirectionSearch] = useState(''),
    [sphereFilter, setSphereFilter] = useState(''),
    [busy, setBusy] = useState(false);
  useQuickAccessGuard(() => ({ dirty: false, busy }));
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const settingsPanel = useRef<HTMLElement>(null);
  const wheelHeading = useRef<HTMLHeadingElement>(null);
  const [scoreSaveCount, setScoreSaveCount] = useState(0);
  useEffect(() => {
    if (settings) settingsPanel.current?.focus();
  }, [settings]);
  useEffect(() => {
    if (scoreSaveCount > 0) wheelHeading.current?.focus();
  }, [scoreSaveCount]);
  const visibleError = error ?? query.error;
  const routeKey = buildPlannerRoute(route);
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
    if (editor?.kind === 'sphere' && editor.scoreContext) {
      setScoreSaveCount((count) => count + 1);
    }
  };
  const run = async (work: () => Promise<unknown>, rethrow = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await work();
      await saved();
      if (typeof outcome === 'string') setNotice(outcome);
    } catch (e: unknown) {
      report(e);
      if (rethrow) throw e;
    } finally {
      setBusy(false);
    }
  };
  const navigate = (target: PlannerRoute) => {
    setEditor(null);
    setSettings(false);
    setNotice('');
    onNavigate(target);
  };
  const link = (target: PlannerRoute, label: string) => (
    <a
      href={buildPlannerRoute(target)}
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
        {visibleError ? (
          <>
            <p role="alert">{visibleError}</p>
            <button onClick={refresh}>Повторить загрузку</button>
          </>
        ) : (
          <div className="planner-loading" role="status">
            <span />
            <span />
            <span />
            Загружаем сферы…
          </div>
        )}
      </div>
    );
  const projection = projectLifeBalance(state, today),
    candidate =
      kind === 'thirty_days' ? cycleAt(state.periods, today) : automaticPeriod(kind, today),
    period = candidate ? (state.periods.find((p) => p.id === candidate.id) ?? candidate) : null;
  const context = balancePeriodContext(state, today, period, projection);
  const visibleDirections = projection.directions.filter((item) => {
    if (item.direction.status === 'archived') return false;
    if (sphereFilter && item.direction.sphereId?.toString() !== sphereFilter) return false;
    if (
      !item.direction.name
        .toLocaleLowerCase('ru')
        .includes(directionSearch.trim().toLocaleLowerCase('ru'))
    )
      return false;
    if (directionFilter === 'attention')
      return (
        item.direction.status === 'active' &&
        item.effectiveScore !== null &&
        item.effectiveScore < 5
      );
    if (directionFilter === 'paused') return item.direction.status === 'paused';
    if (directionFilter === 'without-goal')
      return item.direction.status === 'active' && item.activeGoals.length === 0;
    if (item.direction.status !== 'active') return false;
    return directionFilter === 'all' || item.direction.mode === directionFilter;
  });
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
  const activeSpheres = projection.spheres.filter((s) => s.sphere.status === 'active');
  const ratedCount = wheel.filter((s) => s.effectiveScore !== null).length;
  const firstUnrated = wheel.find((s) => s.effectiveScore === null);
  const comparable = activeSpheres.filter((s) => s.attentionNeed !== null);
  const needsAttention = comparable
    .filter((s) => (s.attentionNeed ?? 0) > 0)
    .sort((a, b) => (b.attentionNeed ?? 0) - (a.attentionNeed ?? 0))
    .slice(0, 3);
  const assess = (s: LifeBalanceProjection['spheres'][number]) =>
    setEditor({
      kind: 'sphere',
      id: s.sphere.id.toString(),
      sphereId: null,
      scoreContext: { automaticScore: s.automaticScore },
    });
  const periodSelector = (
    <div className="balance-period">
      <div className="planner-segments" role="group" aria-label="Контекст целей">
        {(['week', 'thirty_days', 'quarter', 'year'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {periods[value]}
          </button>
        ))}
      </div>
      <span className="planner-muted">
        {period ? `${period.startDate} — ${period.endDate}` : 'Период 30 дней ещё не создан'}
      </span>
    </div>
  );
  const directionActions = (d: LifeBalanceProjection['directions'][number]): EntityMenuAction[] => [
    ...(d.direction.status !== 'archived'
      ? [
          {
            label: 'Редактировать',
            run: () =>
              setEditor({ kind: 'direction', id: d.direction.id.toString(), sphereId: null }),
          },
        ]
      : []),
    ...(d.direction.status === 'active' || d.direction.status === 'paused'
      ? [
          {
            label: d.direction.status === 'active' ? 'Приостановить' : 'Возобновить',
            run: () =>
              run(async () => {
                const result = await services.updateDirection.execute({
                  id: d.direction.id,
                  expectedVersion: d.direction.version,
                  name: d.direction.name,
                  status: d.direction.status === 'active' ? 'paused' : 'active',
                });
                if (!result.ok) throw result.error;
              }),
          },
        ]
      : []),
    ...(d.direction.status === 'archived'
      ? [
          {
            label: 'Вернуть из архива',
            run: () =>
              run(async () => {
                const result = await services.restoreDirection.execute({
                  id: d.direction.id,
                  expectedVersion: d.direction.version,
                });
                if (!result.ok) throw result.error;
              }),
          },
        ]
      : [
          {
            label: 'Архивировать',
            run: () =>
              run(async () => {
                const result = await services.archiveDirection.execute({
                  id: d.direction.id,
                  expectedVersion: d.direction.version,
                });
                if (!result.ok) throw result.error;
              }),
          },
        ]),
    {
      label: 'Удалить',
      destructive: true,
      prepare: async () => {
        const preview = await services.removeDirectionSafely.inspect(d.direction.id);
        if (preview.kind === 'not_found')
          throw new Error('Направление уже удалено. Обновите список.');
        if (preview.live.length)
          return {
            message: `Направление «${d.direction.name}» используется: ${describeDirectionDependencies(preview.live)}. Можно архивировать его, сохранив цели и историю.`,
            alternative: {
              label: 'Архивировать',
              run: () =>
                run(async () => {
                  const result = await services.archiveDirection.execute({
                    id: d.direction.id,
                    expectedVersion: d.direction.version,
                  });
                  if (!result.ok) throw result.error;
                  return 'Направление убрано из активных. История сохранена.';
                }),
            },
          };
        return {
          message: preview.historical.length
            ? `Направление «${d.direction.name}» связано с историей: ${describeDirectionDependencies(preview.historical)}. Оно будет сохранено в архиве.`
            : `Удалить направление «${d.direction.name}»?`,
          confirmLabel: preview.historical.length ? 'Убрать из активных' : 'Удалить',
        };
      },
      run: () =>
        run(async () => {
          const result = await services.removeDirectionSafely.execute({
            id: d.direction.id,
            expectedVersion: d.direction.version,
          });
          if (result.kind === 'blocked')
            throw new DomainError(
              'direction.delete_blocked',
              `Направление используется: ${describeDirectionDependencies(result.live)}. Архивируйте направление или уберите эти связи.`,
            );
          if (result.kind === 'version_conflict')
            throw new DomainError(
              'direction.version_conflict',
              'Направление уже изменилось. Обновите данные.',
            );
          if (result.kind === 'not_found')
            throw new DomainError(
              'direction.not_found',
              'Направление уже удалено. Обновите список.',
            );
          if (result.kind === 'deleted' && route.view === 'direction')
            navigate({ view: 'directions' });
          return result.kind === 'archived'
            ? 'Направление убрано из активных. История сохранена.'
            : 'Направление удалено.';
        }),
    },
  ];
  const sphereActions = (s: LifeBalanceProjection['spheres'][number]): EntityMenuAction[] => [
    ...(s.sphere.status === 'active'
      ? [
          {
            label: 'Редактировать',
            run: () => setEditor({ kind: 'sphere', id: s.sphere.id.toString(), sphereId: null }),
          },
        ]
      : []),
    {
      label: s.sphere.status === 'archived' ? 'Вернуть из архива' : 'Архивировать',
      run: () =>
        run(async () => {
          const result =
            s.sphere.status === 'archived'
              ? await services.restoreSphere.execute({
                  id: s.sphere.id,
                  expectedVersion: s.sphere.version,
                })
              : await services.archiveSphere.execute({
                  id: s.sphere.id,
                  expectedVersion: s.sphere.version,
                });
          if (!result.ok) throw result.error;
        }),
    },
    {
      label: 'Удалить',
      destructive: true,
      run: () =>
        run(async () => {
          if (!(await services.deletePilotSphere.execute(s.sphere.id.toString())))
            throw new DomainError('sphere.delete_blocked', 'Сфера уже удалена. Обновите список.');
        }, true),
    },
  ];
  const directionRow = (d: LifeBalanceProjection['directions'][number]) => (
    <EntityContextMenu
      key={d.direction.id.toString()}
      title={d.direction.name}
      entityLabel="направление"
      actions={directionActions(d)}
    >
      <article className="balance-row" key={d.direction.id.toString()}>
        <div>
          {link({ view: 'direction', id: d.direction.id.toString() }, d.direction.name)}
          <p className="planner-muted">
            {state.spheres.find((s) => s.id.toString() === d.direction.sphereId?.toString())
              ?.name ?? 'Без сферы'}{' '}
            · {d.direction.mode === 'maintain' ? 'Поддерживаю' : 'Развиваю'} ·{' '}
            {lifecycle[d.direction.status]} · Активных целей: {d.activeGoals.length}
          </p>
          {d.direction.description && <p className="planner-muted">{d.direction.description}</p>}
          {d.activeGoals.length === 0 &&
            link({ view: 'new-goal', directionId: d.direction.id.toString() }, '+ Добавить цель')}
        </div>
        <strong>
          {d.effectiveScore === null ? 'Состояние не оценено' : scoreLabel(d.effectiveScore)}
          {d.effectiveScore !== null && <small> / 10</small>}
        </strong>
      </article>
    </EntityContextMenu>
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
      {editor && (
        <PlannerSheet
          title={
            editor.kind === 'sphere'
              ? 'Сфера'
              : editor.kind === 'direction'
                ? 'Направление'
                : 'Показатель'
          }
          onClose={() => setEditor(null)}
        >
          <BalanceEditor
            key={JSON.stringify(editor)}
            editor={editor}
            state={state}
            services={services}
            onSaved={saved}
            onCancel={() => setEditor(null)}
          />
        </PlannerSheet>
      )}
      {route.view === 'directions' ? (
        <>
          <header className="balance-header">
            <div>
              <p className="planner-eyebrow">Направления</p>
              <h1>Направления</h1>
              <p className="planner-muted">Развивайте важное и поддерживайте устойчивое.</p>
            </div>
            <button
              className="planner-primary"
              type="button"
              onClick={() => setEditor({ kind: 'direction', id: null, sphereId: null })}
            >
              + Новое направление
            </button>
          </header>
          <div className="balance-direction-filters">
            <label>
              <span>Сфера</span>
              <select value={sphereFilter} onChange={(e) => setSphereFilter(e.target.value)}>
                <option value="">Все сферы</option>
                {state.spheres
                  .filter((s) => s.status !== 'archived')
                  .map((s) => (
                    <option key={s.id.toString()} value={s.id.toString()}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <VoiceTextInput
              id="balance-direction-search"
              aria-label="Поиск направления"
              placeholder="Поиск направления"
              value={directionSearch}
              onValueChange={setDirectionSearch}
            />
            <label>
              <span>Показать</span>
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as typeof directionFilter)}
              >
                <option value="all">Все</option>
                <option value="attention">Требует внимания</option>
                <option value="develop">Развиваю</option>
                <option value="maintain">Поддерживаю</option>
                <option value="paused">На паузе</option>
                <option value="without-goal">Без активной цели</option>
              </select>
            </label>
          </div>
          {visibleDirections.length ? (
            <div className="balance-direction-groups">
              {[
                ...projection.spheres.map((item) => ({
                  id: item.sphere.id.toString(),
                  name: item.sphere.name,
                })),
                { id: null, name: 'Без сферы' },
              ].map((group) => {
                const entries = visibleDirections.filter(
                  (item) =>
                    item.direction.sphereId?.toString() === group.id ||
                    (!item.direction.sphereId && group.id === null),
                );
                return entries.length ? (
                  <section key={group.id ?? 'none'} aria-label={group.name}>
                    <h2>{group.name}</h2>
                    <div className="balance-direction-cards">{entries.map(directionRow)}</div>
                  </section>
                ) : null;
              })}
            </div>
          ) : (
            <p className="planner-empty">Направлений с такими условиями пока нет.</p>
          )}
        </>
      ) : route.view === 'spheres' ? (
        <>
          <header className="balance-header">
            <div>
              <p className="planner-eyebrow">Сферы</p>
              <h1>Сферы жизни</h1>
              <p className="planner-muted">Что важно поддерживать. Куда направить внимание.</p>
            </div>
            <button
              className={ratedCount ? 'planner-primary' : undefined}
              onClick={() => setEditor({ kind: 'sphere', id: null, sphereId: null })}
            >
              Новая сфера
            </button>
          </header>
          {settings && (
            <section
              className="balance-panel balance-wheel-settings"
              id="balance-wheel-settings"
              aria-label="Сферы в колесе"
              ref={settingsPanel}
              tabIndex={-1}
            >
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
              <button
                type="button"
                onClick={() => {
                  setSettings(false);
                  wheelHeading.current?.focus();
                }}
              >
                Готово
              </button>
            </section>
          )}

          <div className={`balance-overview${ratedCount === 0 ? ' balance-overview--start' : ''}`}>
            <section className="balance-wheel-panel">
              <div className="balance-section-heading">
                <h2 ref={wheelHeading} tabIndex={-1}>
                  Колесо жизни
                </h2>
                {wheel.length > 0 && (
                  <button
                    aria-expanded={settings}
                    aria-controls="balance-wheel-settings"
                    onClick={() => setSettings(!settings)}
                  >
                    Настроить колесо
                  </button>
                )}
              </div>
              {ratedCount > 0 ? (
                <>
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
                </>
              ) : (
                <div className="balance-start">
                  <h3>
                    {!activeSpheres.length
                      ? 'Начните с важной для вас сферы'
                      : !wheel.length
                        ? 'Выберите сферы для колеса'
                        : 'Как вы оцениваете состояние этих сфер?'}
                  </h3>
                  <p className="planner-muted">
                    {!activeSpheres.length
                      ? 'Сферы помогают увидеть, что вы хотите поддерживать и развивать.'
                      : !wheel.length
                        ? 'Выберите существующие сферы, которые хотите видеть в обзоре.'
                        : 'Поставьте первую оценку от 0 до 10. Остальные можно добавить позже.'}
                  </p>
                  <button
                    className="planner-primary"
                    type="button"
                    onClick={() =>
                      !activeSpheres.length
                        ? setEditor({ kind: 'sphere', id: null, sphereId: null })
                        : !wheel.length
                          ? setSettings(true)
                          : firstUnrated && assess(firstUnrated)
                    }
                  >
                    {!activeSpheres.length
                      ? 'Создать первую сферу'
                      : !wheel.length
                        ? 'Выбрать сферы'
                        : 'Оценить первую сферу'}
                  </button>
                </div>
              )}
              {wheel.length > 0 && (
                <p
                  className="planner-muted"
                  role="status"
                >{`Оценено ${ratedCount} из ${wheel.length} сфер`}</p>
              )}
              {ratedCount > 0 && firstUnrated && (
                <button type="button" onClick={() => assess(firstUnrated)}>
                  Оценить следующую сферу
                </button>
              )}
            </section>
            {activeSpheres.length > 0 && (
              <section className="balance-attention">
                <h2>Требует внимания</h2>
                <p className="planner-muted">Сферы с наибольшим дефицитом внимания.</p>
                {needsAttention.map((s) => (
                  <div className="balance-attention-row" key={s.sphere.id.toString()}>
                    {link({ view: 'sphere', id: s.sphere.id.toString() }, s.sphere.name)}
                    <strong>
                      {scoreLabel(s.effectiveScore)} <small>/ 10</small>
                    </strong>
                    <progress
                      max={10}
                      value={s.effectiveScore ?? 0}
                      aria-label={`Оценка: ${s.sphere.name}`}
                    />
                    <span className="planner-muted">Дефицит {scoreLabel(s.attentionNeed)}</span>
                  </div>
                ))}
                {needsAttention.length === 0 && (
                  <p className="planner-empty">
                    {comparable.length === 0
                      ? 'Недостаточно данных для сравнения. Укажите текущую оценку и желаемый уровень.'
                      : 'Среди оценённых сфер дефицита не выявлено.'}
                  </p>
                )}
                {comparable.length > 0 && comparable.length < activeSpheres.length && (
                  <p className="planner-muted">Не у всех сфер есть оценка и желаемый уровень.</p>
                )}
                <a
                  className="planner-text-link"
                  href="#all-spheres"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('all-spheres')?.scrollIntoView({ behavior: 'instant' });
                  }}
                >
                  Посмотреть все сферы →
                </a>
              </section>
            )}
          </div>
          {activeSpheres.length > 0 && periodSelector}
          <div className="balance-section-heading">
            <h2 id="all-spheres">Все сферы</h2>
            <span className="planner-muted">
              Рекомендации помогают выбрать фокус и не ограничивают план.
            </span>
          </div>
          {!state.spheres.length && (
            <p className="planner-empty">Пока нет сфер. Создайте первую важную часть жизни.</p>
          )}
          <div className="balance-sphere-grid">
            {projection.spheres.map((s) => {
              const c = context[s.sphere.id.toString()];
              return (
                <EntityContextMenu
                  key={s.sphere.id.toString()}
                  title={s.sphere.name}
                  entityLabel="сферу"
                  actions={sphereActions(s)}
                >
                  <article
                    className={`balance-sphere-card${s.effectiveScore === null ? ' balance-sphere-card--unrated' : ''}`}
                  >
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
                        {s.effectiveScore === null ? 'Нет оценки' : scoreLabel(s.effectiveScore)}
                        {s.effectiveScore !== null && <small> / 10</small>}
                      </strong>
                    </div>
                    {s.effectiveScore !== null && (
                      <progress
                        max={10}
                        value={s.effectiveScore}
                        aria-label={`Оценка: ${s.sphere.name}`}
                      />
                    )}
                    <p className="planner-muted">
                      {s.directions.reduce((count, d) => count + d.activeGoals.length, 0)} активных
                      целей
                    </p>
                    <div className="balance-metrics">
                      {s.sphere.desiredLevel !== null && (
                        <span>
                          Желаемый <b>{scoreLabel(s.sphere.desiredLevel)}</b>
                        </span>
                      )}
                      {s.attentionNeed !== null && (
                        <span>
                          Дефицит внимания <b>{scoreLabel(s.attentionNeed)}</b>
                        </span>
                      )}
                      {c?.progress != null && (
                        <span>
                          Прогресс целей{' '}
                          <b>
                            {Math.round(c.progress)}%{c?.incomplete ? ' · неполные данные' : ''}
                          </b>
                        </span>
                      )}
                      {c?.recommended != null && (
                        <span>
                          Рекомендуемый фокус <b>{c.recommended} целей</b>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={s.sphere.status === 'archived'}
                      onClick={() => assess(s)}
                    >
                      {s.effectiveScore === null ? 'Оценить сферу' : 'Изменить оценку'} →
                    </button>
                  </article>
                </EntityContextMenu>
              );
            })}
          </div>
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
          <EntityContextMenu
            title={sphere.sphere.name}
            entityLabel="сферу"
            actions={sphereActions(sphere)}
          >
            <header className="balance-header">
              <div>
                <p className="planner-eyebrow">Сфера</p>
                <h1>{sphere.sphere.name}</h1>
              </div>
            </header>
          </EntityContextMenu>
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
            {link(
              { view: 'goals', sphereId: sphere.sphere.id.toString(), period: 'week' },
              'Цели этой недели',
            )}
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
          <EntityContextMenu
            title={direction.direction.name}
            entityLabel="направление"
            actions={directionActions(direction)}
          >
            <header className="balance-header">
              <div>
                <p className="planner-eyebrow">
                  Направление ·{' '}
                  {direction.direction.mode === 'maintain' ? 'Поддерживаю' : 'Развиваю'} ·{' '}
                  {lifecycle[direction.direction.status]}
                </p>
                <h1>{direction.direction.name}</h1>
              </div>
            </header>
          </EntityContextMenu>
          <details className="planner-details">
            <summary>Потребность</summary>
            <EntityNeedText
              need={
                direction.direction.need ? { text: direction.direction.need, source: 'own' } : null
              }
            />
          </details>
          <div className="balance-state-text">
            <div>
              <h2>Сейчас</h2>
              <p>{direction.direction.currentStateText || 'Текущее состояние пока не описано.'}</p>
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    kind: 'direction',
                    id: direction.direction.id.toString(),
                    sphereId: null,
                  })
                }
              >
                Описать
              </button>
            </div>
            <div>
              <h2>Хочу</h2>
              <p>{direction.direction.desiredState || 'Желаемое состояние пока не описано.'}</p>
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    kind: 'direction',
                    id: direction.direction.id.toString(),
                    sphereId: null,
                  })
                }
              >
                Описать
              </button>
            </div>
          </div>
          <section className="balance-next-step">
            <h2>Следующий шаг</h2>
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
          </section>
          <ActionResults
            actions={actionResultsForDirection(
              state.actions,
              direction.direction.id.toString(),
              direction.goals.map((goal) => goal.id.toString()),
            )}
          />
          <div className="balance-section-heading">
            <h2>Активные цели</h2>
            {link(
              { view: 'new-goal', directionId: direction.direction.id.toString() },
              'Создать цель',
            )}
          </div>

          {direction.activeGoals.length ? (
            goalRows(direction.activeGoals)
          ) : (
            <p className="planner-empty">
              {direction.direction.mode === 'maintain'
                ? 'Поддерживать направление можно без активной цели.'
                : 'Активных целей пока нет.'}
            </p>
          )}
          <section className="balance-other-actions" aria-label="Действия направления">
            <div className="balance-section-heading">
              <h2>Действия</h2>
              {link(
                {
                  view: 'new-action',
                  goalId: null,
                  title: null,
                  directionId: direction.direction.id.toString(),
                },
                'Создать действие',
              )}
            </div>
            {groupPlannerActions(
              state.actions.filter(
                (action) =>
                  isOpenAction(action) &&
                  (action.goalId
                    ? direction.goals.some((goal) => action.goalId?.equals(goal.id))
                    : action.directionId?.equals(direction.direction.id)),
              ),
              today,
            )
              .filter((group) => group.actions.length)
              .map((group) => (
                <section key={group.key}>
                  <h3>{group.label}</h3>
                  {group.actions.slice(0, 5).map((action) => (
                    <p key={action.id.toString()}>
                      {link({ view: 'action', id: action.id.toString() }, action.title.toString())}
                    </p>
                  ))}
                  {group.actions.length > 5 && (
                    <p className="planner-muted">
                      Ещё {group.actions.length - 5} · {link({ view: 'actions' }, 'Все действия')}
                    </p>
                  )}
                </section>
              ))}
            {!state.actions.some(
              (action) =>
                isOpenAction(action) &&
                (action.goalId
                  ? direction.goals.some((goal) => action.goalId?.equals(goal.id))
                  : action.directionId?.equals(direction.direction.id)),
            ) && <p className="planner-empty">Пока нет актуальных действий.</p>}
          </section>
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
          <details>
            <summary>Без срока и на будущее</summary>
            {goalRows(direction.goals.filter((g) => g.status === 'future'))}
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
function describeDirectionDependencies(items: readonly DirectionDependency[]): string {
  const names: Record<string, string> = {
    goal: 'целей',
    project: 'проектов',
    direction_indicator: 'показателей',
    day: 'дней',
    tomorrow_plan: 'планов на завтра',
  };
  const groups = new Map<string, DirectionDependency[]>();
  for (const item of items)
    groups.set(item.entityType, [...(groups.get(item.entityType) ?? []), item]);
  return [...groups]
    .map(
      ([type, entries]) =>
        `${entries.length} ${names[type] ?? 'связанных записей'} (${entries
          .slice(0, 3)
          .map((item) => item.label)
          .join(', ')}${entries.length > 3 ? '…' : ''})`,
    )
    .join('; ');
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
      scoreContext={editor.scoreContext ?? null}
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
