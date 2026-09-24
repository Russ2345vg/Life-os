import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PlannerScenarios } from '../../application/planner/PlannerScenarios';
import type { TaskScenario } from '../../domain/planner/TaskScenario';
import type { LifeAction } from '../../domain';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import './planner-scenarios.css';

export type ScenarioService = Pick<
  PlannerScenarios,
  'list' | 'create' | 'update' | 'addAction' | 'removeAction' | 'archive'
>;

// eslint-disable-next-line react-refresh/only-export-components
export function scenarioCandidates(
  actions: readonly LifeAction[],
  selected: readonly string[],
  search: string,
  date: string,
) {
  const query = search.trim().toLocaleLowerCase('ru');
  return actions
    .filter(
      (action) =>
        !action.isArchived() &&
        action.status !== 'completed' &&
        action.status !== 'cancelled' &&
        !selected.includes(action.id.toString()) &&
        action.title.toString().toLocaleLowerCase('ru').includes(query),
    )
    .sort(
      (a, b) =>
        Number(b.plannedDate?.toString() === date) - Number(a.plannedDate?.toString() === date),
    );
}

export function PlannerScenariosPanel({
  service,
  date,
  actions,
  busy,
  children,
  renderAction,
}: {
  readonly service?: ScenarioService | undefined;
  readonly date: string;
  readonly actions: readonly LifeAction[];
  readonly busy: boolean;
  readonly children: ReactNode;
  readonly renderAction: (action: LifeAction, remove: ReactNode) => ReactNode;
}) {
  const [sets, setSets] = useState<readonly TaskScenario[] | null>(null);
  const [activeId, setActiveId] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [reusable, setReusable] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!service) return;
    const request = ++generation.current;
    const values = await service.list(date);
    if (request === generation.current) setSets(values);
  }, [service, date]);
  const report = useCallback(
    (reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось сохранить сценарий. Повторите попытку.',
      ),
    [],
  );
  const reload = useCallback(() => {
    void refresh()
      .then(() => setError(null))
      .catch(report);
  }, [refresh, report]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    reload();
    return invalidate;
  }, [reload, invalidate]);
  useSyncContentChanged('taskScenarios', reload);
  const selected = sets?.find((s) => s.id === activeId) ?? null;
  const disabled = busy || pending;
  const run = async (work: () => Promise<unknown>, message: string, after?: () => void) => {
    if (working.current || busy) return;
    working.current = true;
    setPending(true);
    setError(null);
    setNotice('');
    try {
      await work();
      await refresh();
      after?.();
      setNotice(message);
    } catch (reason: unknown) {
      report(reason);
    } finally {
      working.current = false;
      setPending(false);
    }
  };
  if (!service) return children;
  const candidates = scenarioCandidates(actions, selected?.actionIds ?? [], search, date);
  const startEdit = (value: TaskScenario | null) => {
    setEditing(value?.id ?? 'new');
    setTitle(value?.title ?? '');
    setReusable(value ? value.date === null : true);
    setChoosing(false);
    setNotice('');
  };
  return (
    <>
      <section className="planner-scenarios" aria-label="Сценарии задач" aria-busy={pending}>
        <div className="planner-scenarios-heading">
          <div>
            <h2>Сценарий</h2>
          </div>
          <button
            type="button"
            disabled={disabled || sets === null}
            onClick={() => startEdit(null)}
          >
            Создать сценарий
          </button>
        </div>
        <label htmlFor="planner-scenario-select">Сейчас я…</label>
        <select
          id="planner-scenario-select"
          value={selected?.id ?? ''}
          disabled={disabled || sets === null}
          onChange={(event) => {
            setActiveId(event.target.value);
            setEditing(null);
            setChoosing(false);
            setNotice('');
            setSearch('');
          }}
        >
          <option value="">Все задачи</option>
          {sets?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.date ? ' · на этот день' : ''}
            </option>
          ))}
        </select>
        {sets === null && !error && <p role="status">Загружаем сценарии…</p>}

        {error && (
          <div className="planner-error" role="alert">
            <p>{error}</p>
            <button type="button" disabled={disabled} onClick={reload}>
              Повторить загрузку
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="planner-scenario-notice">
            {notice}
          </p>
        )}
        {editing !== null && (
          <form
            className="planner-scenario-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                async () => {
                  const saved =
                    editing === 'new'
                      ? await service.create(title, reusable ? null : date)
                      : await service.update(editing, title, reusable ? null : date);
                  setActiveId(saved.id);
                  // The write has committed even if the following reload fails.
                  setEditing(saved.id);
                },
                'Сценарий сохранён',
                () => {
                  setEditing(null);
                  setChoosing(true);
                  setSearch('');
                },
              );
            }}
          >
            <label htmlFor="planner-scenario-title">Название сценария</label>
            <VoiceTextInput
              id="planner-scenario-title"
              value={title}
              onValueChange={setTitle}
              maxLength={100}
              required
              readOnly={disabled}
              placeholder="Например, дома за компьютером"
            />
            <label className="planner-scenario-reuse">
              <input
                type="checkbox"
                checked={reusable}
                disabled={disabled}
                onChange={(event) => setReusable(event.target.checked)}
              />
              Сохранять на следующие дни
            </label>
            <div className="planner-scenario-buttons">
              <button
                type="submit"
                className="planner-primary"
                disabled={disabled || !title.trim()}
              >
                Сохранить сценарий
              </button>
              <button type="button" disabled={disabled} onClick={() => setEditing(null)}>
                Отмена
              </button>
            </div>
          </form>
        )}
        {selected && editing === null && (
          <>
            <div className="planner-scenarios-heading">
              <h3>
                {selected.title}{' '}
                <span className="planner-muted">{selected.actionIds.length} из 3</span>
              </h3>
              <div className="planner-scenario-buttons">
                <button type="button" disabled={disabled} onClick={() => startEdit(selected)}>
                  Изменить сценарий
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    void run(
                      () => service.archive(selected.id),
                      'Сценарий удалён. Задачи сохранены.',
                      () => {
                        setActiveId('');
                        setChoosing(false);
                      },
                    );
                  }}
                >
                  Удалить сценарий
                </button>
              </div>
            </div>
            {selected.actionIds.length === 0 ? (
              <p className="planner-empty">
                Добавь первую задачу из существующих. Остальные можно выбрать позже.
              </p>
            ) : (
              <ul className="planner-scenario-tasks">
                {selected.actionIds.map((id, index) => {
                  const action = actions.find((a) => a.id.toString() === id);
                  const available = action && !action.isArchived() && action.status !== 'cancelled';
                  const remove = (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Убрать из сценария: ${action?.title.toString() ?? `задача ${index + 1}`}`}
                      onClick={() => {
                        void run(
                          () => service.removeAction(selected.id, id),
                          'Задача убрана из сценария',
                        );
                      }}
                    >
                      Убрать
                    </button>
                  );
                  return available ? (
                    renderAction(action, remove)
                  ) : (
                    <li key={id} className="planner-scenario-unavailable">
                      <span>Задача недоступна</span>
                      {remove}
                    </li>
                  );
                })}
              </ul>
            )}
            {selected.actionIds.length < 3 ? (
              <button
                type="button"
                disabled={disabled}
                aria-expanded={choosing}
                onClick={() => setChoosing((value) => !value)}
              >
                Добавить задачу в сценарий
              </button>
            ) : (
              <p className="planner-muted">
                Тройка собрана. Чтобы заменить задачу, сначала убери её из сценария.
              </p>
            )}
            {choosing && selected.actionIds.length < 3 && (
              <div className="planner-scenario-picker">
                <label htmlFor="planner-scenario-search">Найти существующую задачу</label>
                <VoiceTextInput
                  id="planner-scenario-search"
                  value={search}
                  onValueChange={setSearch}
                  readOnly={disabled}
                />
                <p className="planner-muted">
                  Сначала задачи на выбранный день. Добавление не меняет их даты.
                </p>
                {candidates.length ? (
                  <ul>
                    {candidates.map((action) => (
                      <li key={action.id.toString()}>
                        <span>
                          {action.title.toString()}
                          <small className="planner-muted">
                            {action.plannedDate?.toString() ?? 'Без даты'}
                          </small>
                        </span>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={`Добавить в сценарий: ${action.title.toString()}`}
                          onClick={() => {
                            void run(
                              () => service.addAction(selected.id, action.id.toString()),
                              'Задача добавлена в сценарий',
                            );
                          }}
                        >
                          Добавить
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="planner-empty">
                    {search.trim()
                      ? 'Задачи не найдены. Измени запрос.'
                      : 'Нет доступных незавершённых задач.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>
      {!selected && children}
    </>
  );
}
