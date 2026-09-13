import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  CompleteProject,
  CreateDecisionForDate,
  GetProjectLifeActions,
  GetProjects,
  GetSpheres,
  MakeProjectMain,
  PauseProject,
  RestoreProject,
  ResumeProject,
  ProjectLifeActionsSnapshot,
  SpheresSnapshot,
} from '../../application';
import type { DayDate, Goal, Project } from '../../domain';
import { DecisionCreationDialog } from '../pages/DecisionCreationForm';
import {
  createDecisionCreationForm,
  createEmptyDecisionCreationErrors,
  submitDecisionCreation,
} from '../pages/DecisionCreationFormState';
import { ProjectActivity } from '../management/ProjectsSection';
import { AppIcon } from '../components/AppIcon';

export interface GoalManagementCommands {
  readonly completeProject: Pick<CompleteProject, 'execute'>;
  readonly pauseProject: Pick<PauseProject, 'execute'>;
  readonly resumeProject: Pick<ResumeProject, 'execute'>;
  readonly restoreProject: Pick<RestoreProject, 'execute'>;
  readonly makeProjectMain: Pick<MakeProjectMain, 'execute'>;
  readonly getProjects: Pick<GetProjects, 'execute'>;
  readonly getProjectLifeActions: Pick<GetProjectLifeActions, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly createDecisionForDate: Pick<CreateDecisionForDate, 'execute'>;
  readonly currentDate: DayDate;
}

export function GoalManagementPanel(
  props: GoalManagementCommands & { readonly goal: Goal; readonly onChanged: () => void },
) {
  const { goal, getProjects, getProjectLifeActions, getSpheres } = props;
  const [data, setData] = useState<{
    projects: readonly Project[];
    spheres: SpheresSnapshot;
    activity: ProjectLifeActionsSnapshot;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const dialogHost = useRef<HTMLDivElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const [form, setForm] = useState(() =>
    createDecisionCreationForm(props.currentDate, {
      projectId: goal.id.toString(),
      sphereId: goal.sphereId?.toString() ?? '',
    }),
  );
  const [errors, setErrors] = useState(createEmptyDecisionCreationErrors);
  useEffect(() => {
    if (formOpen && !returnFocus.current) {
      returnFocus.current = true;
      dialogHost.current?.querySelector<HTMLElement>('#decision-title')?.focus();
    } else if (!formOpen && !busy && returnFocus.current) {
      returnFocus.current = false;
      createButton.current?.focus();
    }
  }, [formOpen, busy]);
  const load = useCallback(() => {
    const read = async () => {
      const [projects, spheres, activity] = await Promise.all([
        getProjects.execute(),
        getSpheres.execute(),
        getProjectLifeActions.execute(goal.id),
      ]);
      return { projects, spheres, activity };
    };
    return read().then(
      (next) => {
        setData(next);
        setError(null);
      },
      () => setError('Не удалось загрузить связи цели. Повторите попытку.'),
    );
  }, [getProjects, getSpheres, getProjectLifeActions, goal.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (action: 'complete' | 'pause' | 'resume' | 'restore' | 'main') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const command = {
        complete: props.completeProject,
        pause: props.pauseProject,
        resume: props.resumeProject,
        restore: props.restoreProject,
        main: props.makeProjectMain,
      }[action];
      const result = await command.execute({ id: goal.id, expectedVersion: goal.version });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage('Изменения цели сохранены.');
      props.onChanged();
      await load();
    } catch {
      setError('Не удалось изменить цель. Повторите попытку.');
    } finally {
      setBusy(false);
    }
  };
  const saveDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !data) return;
    setBusy(true);
    try {
      const result = await submitDecisionCreation({
        form,
        currentDate: props.currentDate,
        createDecisionForDate: props.createDecisionForDate,
        projects: data.projects,
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setFormOpen(false);
      setForm(
        createDecisionCreationForm(props.currentDate, {
          projectId: goal.id.toString(),
          sphereId: goal.sphereId?.toString() ?? '',
        }),
      );
      setErrors(createEmptyDecisionCreationErrors());
      setMessage('Решение создано и связано с целью.');
      await load();
    } catch {
      setErrors({ ...createEmptyDecisionCreationErrors(), form: 'Не удалось создать решение.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="goal-detail-management" aria-label="Управление целью и связи">
      <h2>Продвижение к цели</h2>
      {goal.isMain ? (
        <p className="goal-detail-main-badge">
          <AppIcon name="focus" /> Главная цель направления
        </p>
      ) : null}
      {goal.status !== 'archived' && goal.status !== 'achieved' ? (
        <button
          ref={createButton}
          className="goal-detail-primary"
          type="button"
          disabled={busy || !data}
          onClick={() => setFormOpen(true)}
        >
          <AppIcon name="create" /> Создать решение
        </button>
      ) : null}
      {message ? (
        <p className="goal-detail-feedback" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="goal-detail-feedback is-error" role="alert">
          {error}{' '}
          <button type="button" disabled={busy} onClick={() => void load()}>
            Повторить
          </button>
        </div>
      ) : null}
      <div className="goal-detail-related">
        {data ? (
          <>
            <h3>Связанные решения</h3>
            {data.activity.decisions.filter((decision) => !decision.isDeleted()).length === 0 ? (
              <p>Связанных решений пока нет.</p>
            ) : (
              <ul className="project-decision-list">
                {data.activity.decisions
                  .filter((decision) => !decision.isDeleted())
                  .map((decision) => (
                    <li key={decision.id.toString()}>
                      <strong>{decision.title.toString()}</strong>
                      <span>{decision.plannedDate?.toString() ?? 'Без даты'}</span>
                    </li>
                  ))}
              </ul>
            )}
            <details className="goal-detail-information">
              <summary>Все связи и история</summary>
              <ProjectActivity {...data.activity} />
            </details>
          </>
        ) : !error ? (
          <p role="status">Загружаем связи…</p>
        ) : null}
      </div>
      <div className="goal-detail-secondary-actions">
        {goal.status === 'active' ? (
          <>
            {!goal.isMain ? (
              <button type="button" disabled={busy} onClick={() => void run('main')}>
                Сделать главной
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void run('pause')}>
              Приостановить
            </button>
          </>
        ) : null}
        {goal.status === 'paused' ? (
          <button type="button" disabled={busy} onClick={() => void run('resume')}>
            Возобновить
          </button>
        ) : null}
        {goal.status === 'archived' ? (
          <button type="button" disabled={busy} onClick={() => void run('restore')}>
            Восстановить цель
          </button>
        ) : null}
        {goal.status === 'active' || goal.status === 'paused' ? (
          <button type="button" disabled={busy} onClick={() => void run('complete')}>
            Завершить цель
          </button>
        ) : null}
      </div>
      {formOpen && data ? (
        <div
          ref={dialogHost}
          className="goal-detail-dialog-host"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.stopPropagation();
              setFormOpen(false);
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
              ),
            ).filter((element) => element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (!first || !last) {
              event.preventDefault();
              return;
            }
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <DecisionCreationDialog
            currentDate={props.currentDate}
            form={form}
            errors={errors}
            isSaving={busy}
            spheres={data.spheres}
            projects={data.projects}
            lockedProjectId={goal.id.toString()}
            onChange={(next) => {
              setForm(next);
              setErrors(createEmptyDecisionCreationErrors());
            }}
            onClose={() => {
              if (!busy) setFormOpen(false);
            }}
            onSubmit={(event) => void saveDecision(event)}
          />
        </div>
      ) : null}
    </section>
  );
}
