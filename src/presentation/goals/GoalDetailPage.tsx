import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { GOAL_STATUS, type Goal } from '../../domain';
import type { ArchiveGoal, DeletePilotGoal } from '../../application';
import { AppIcon } from '../components/AppIcon';
import { useSyncContentChanged } from '../sync/SyncStatusContext';
import { AttachmentSyncStatus } from '../sync/AttachmentSyncStatus';
import { buildGoalAlbumRoute } from './GoalAlbumNavigation';
import { loadGoalDetail, type GoalDetailQueries } from './GoalDetailLoader';
import {
  createGoalDetailLoadController,
  type GoalDetailLoadState,
} from './GoalDetailPageController';
import { replaceGoalDetailModelGoal, type GoalDetailModel } from './goalDetailPresentation';
import { createGoalArchiveController, type GoalArchiveState } from './GoalArchiveController';
import { createGoalDeleteController, type GoalDeleteState } from './GoalDeleteController';
import '../styles/goal-detail.css';

export interface GoalDetailPageProps extends GoalDetailQueries {
  readonly renderManagement?: ((goal: Goal, onChanged: () => void) => ReactNode) | undefined;
  readonly goalId: string;
  readonly onEdit: (goalId: string) => void;
  readonly onBack: () => void;
  readonly archiveGoal: Pick<ArchiveGoal, 'execute'>;
  readonly deleteGoal: Pick<DeletePilotGoal, 'execute'>;
  readonly onMutated: () => void;
  readonly confirmArchive?: (message: string) => boolean;
  readonly confirmDelete?: (message: string) => boolean;
}

export function GoalDetailPage(props: GoalDetailPageProps): ReactElement {
  const [state, setState] = useState<GoalDetailLoadState>({ status: 'loading' });
  const [archiveState, setArchiveState] = useState<GoalArchiveState>({ status: 'idle' });
  const [deleteState, setDeleteState] = useState<GoalDeleteState>({ status: 'idle' });
  const { getDirections, getGoalById, getSpheres, goalId } = props;
  const controller = useMemo(
    () =>
      createGoalDetailLoadController({
        load: () => loadGoalDetail(goalId, { getDirections, getGoalById, getSpheres }),
        publish: setState,
      }),
    [getDirections, getGoalById, getSpheres, goalId],
  );

  useEffect(() => {
    controller.activate();
    return controller.cancel;
  }, [controller]);
  useSyncContentChanged('goals', controller.retry);
  useSyncContentChanged('directions', controller.retry);

  const { archiveGoal, confirmArchive, onMutated } = props;
  const archiveController = useMemo(
    () =>
      createGoalArchiveController({
        archiveGoal,
        confirm: confirmArchive ?? ((message) => window.confirm(message)),
        onMutated,
        publish(next) {
          setArchiveState(next);
          if (next.status === 'success') {
            setState((current) =>
              current.status === 'ready'
                ? {
                    status: 'ready',
                    model: replaceGoalDetailModelGoal(current.model, next.goal),
                  }
                : current,
            );
          }
        },
      }),
    [archiveGoal, confirmArchive, onMutated],
  );
  const { confirmDelete, deleteGoal } = props;
  const deleteController = useMemo(
    () =>
      createGoalDeleteController({
        deleteGoal,
        confirm: confirmDelete ?? ((message) => window.confirm(message)),
        onDeleted: props.onBack,
        onMutated,
        publish: setDeleteState,
      }),
    [confirmDelete, deleteGoal, onMutated, props.onBack],
  );

  return (
    <GoalDetailScreen
      management={
        state.status === 'ready'
          ? props.renderManagement?.(state.model.goal, controller.retry)
          : null
      }
      state={state}
      onRetry={controller.retry}
      onBack={props.onBack}
      onEdit={props.onEdit}
      onArchiveRequest={(goal) => void archiveController.archive(goal)}
      onDeleteRequest={(goal) => void deleteController.delete(goal)}
      archiveState={archiveState}
      deleteState={deleteState}
    />
  );
}

export function GoalDetailScreen({
  management,
  state,
  onRetry,
  onBack,
  onEdit,
  onArchiveRequest,
  onDeleteRequest,
  archiveState,
  deleteState,
}: {
  readonly management?: ReactNode;
  readonly state: GoalDetailLoadState;
  readonly onRetry: () => void;
  readonly onBack: () => void;
  readonly onEdit: (goalId: string) => void;
  readonly onArchiveRequest: (goal: Goal) => void;
  readonly onDeleteRequest: (goal: Goal) => void;
  readonly archiveState: GoalArchiveState;
  readonly deleteState: GoalDeleteState;
}): ReactElement {
  if (state.status === 'loading') {
    return <GoalDetailState role="status" text="Загружаем цель…" onBack={onBack} />;
  }
  if (state.status === 'error') {
    return (
      <GoalDetailState
        role="alert"
        text="Не удалось загрузить цель. Попробуйте ещё раз."
        onBack={onBack}
      >
        <button type="button" onClick={onRetry}>
          Повторить
        </button>
      </GoalDetailState>
    );
  }
  if (state.status === 'not-found') {
    return <GoalDetailState role="alert" text="Цель не найдена" onBack={onBack} />;
  }

  const { model } = state;
  return (
    <main className="goal-album-page goal-detail-page" data-goal-status={model.goal.status}>
      <nav className="goal-detail-breadcrumb" aria-label="Навигация цели">
        <GoalRouteAnchor href="#/goals" onOpen={onBack}>
          Альбом целей
        </GoalRouteAnchor>
        <span aria-hidden="true">/</span>
        <span>Детали цели</span>
      </nav>
      <AttachmentSyncStatus
        entityType="goal"
        objectId={model.goal.id.toString()}
        localAvailable={model.goal.coverImage !== null}
      />
      {archiveState.status === 'success' ? (
        <div className="goal-detail-archive-status" role="status">
          <span>Цель перемещена в архив</span>
          <button type="button" onClick={onBack}>
            Вернуться в Альбом
          </button>
        </div>
      ) : null}
      {archiveState.status === 'error' ? (
        <p className="goal-detail-archive-error" role="alert">
          {archiveState.message}
        </p>
      ) : null}
      {deleteState.status === 'error' ? (
        <p className="goal-detail-delete-error" role="alert">
          {deleteState.message}
        </p>
      ) : null}
      <header className="goal-detail-heading">
        <div>
          <p className="goal-detail-eyebrow">
            {model.directionLabel} · {model.sphereLabel}
          </p>
          <h1>{model.title}</h1>
        </div>
        <div className="goal-detail-actions">
          {model.goal.status !== GOAL_STATUS.archived ? (
            <>
              <GoalRouteAnchor
                className="goal-detail-edit"
                href={buildGoalAlbumRoute({ view: 'edit', goalId: model.id })}
                onOpen={() => onEdit(model.id)}
              >
                Редактировать
              </GoalRouteAnchor>
              <details className="goal-detail-more">
                <summary>Ещё</summary>
                <div className="goal-detail-more-options">
                  <button
                    type="button"
                    className="goal-detail-archive"
                    disabled={
                      archiveState.status === 'archiving' || deleteState.status === 'deleting'
                    }
                    onClick={() => onArchiveRequest(model.goal)}
                  >
                    {archiveState.status === 'archiving' ? 'Архивируем…' : 'Архивировать'}
                  </button>
                  <button
                    type="button"
                    className="goal-detail-delete"
                    disabled={
                      archiveState.status === 'archiving' || deleteState.status === 'deleting'
                    }
                    onClick={() => onDeleteRequest(model.goal)}
                  >
                    {deleteState.status === 'deleting' ? 'Удаляем…' : 'Удалить'}
                  </button>
                </div>
              </details>
            </>
          ) : null}
        </div>
      </header>
      <section
        className={
          model.coverImageUrl === null
            ? 'goal-detail-hero goal-detail-hero--without-cover'
            : 'goal-detail-hero'
        }
      >
        <div className="goal-detail-cover">
          {model.coverImageUrl === null ? (
            <div className="goal-detail-cover-placeholder" aria-label="Обложка цели не задана">
              <AppIcon name="goals" />
            </div>
          ) : (
            <img src={model.coverImageUrl} alt={`Обложка цели «${model.title}»`} />
          )}
        </div>
        <div className="goal-detail-hero-copy">
          <div className="goal-detail-badges">
            <span>{model.statusLabel}</span>
            <span>{model.stageLabel}</span>
          </div>
          {model.description === null ? null : <p>{model.description}</p>}
          <dl className="goal-detail-hero-metadata">
            <div>
              <dt>Горизонт</dt>
              <dd>{model.horizonLabel}</dd>
            </div>
          </dl>
          <GoalProgress progress={model.progress} />
        </div>
      </section>
      <div className="goal-detail-layout">
        <div className="goal-detail-forward">
          <GoalMeaningSection
            className="goal-detail-next-progress"
            title="Следующее продвижение"
            value={model.nextProgress}
          />
          {management}
        </div>
        <div className="goal-detail-content">
          <GoalMeaningSection title="Почему это важно" value={model.whyImportant} />
          <GoalMeaningSection title="Почему сейчас" value={model.whyNow} />
          <GoalMeaningSection title="Критерий достижения" value={model.achievementCriteria} />
          <details className="goal-detail-information">
            <summary>Информация цели</summary>
            <GoalMetadata model={model} />
          </details>
        </div>
      </div>
    </main>
  );
}

function GoalDetailState({
  role,
  text,
  onBack,
  children,
}: {
  readonly role: 'status' | 'alert';
  readonly text: string;
  readonly onBack: () => void;
  readonly children?: ReactElement;
}): ReactElement {
  return (
    <main className="goal-album-page goal-detail-page">
      <GoalRouteAnchor href="#/goals" onOpen={onBack}>
        Вернуться в Альбом целей
      </GoalRouteAnchor>
      <section className="goal-detail-state" role={role}>
        <h1>{text}</h1>
        {children}
      </section>
    </main>
  );
}

function GoalMeaningSection({
  title,
  value,
  className,
}: {
  readonly title: string;
  readonly value: string;
  readonly className?: string;
}): ReactElement {
  return (
    <section
      className={
        className === undefined ? 'goal-detail-section' : `goal-detail-section ${className}`
      }
    >
      <h2>{title}</h2>
      <p>{value}</p>
    </section>
  );
}

function GoalMetadata({ model }: { readonly model: GoalDetailModel }): ReactElement {
  const rows = [
    ['Направление', model.directionLabel],
    ['Сфера', model.sphereLabel],
    ['Стадия', model.stageLabel],
    ['Уровень намерения', model.intentionLabel],
    ['Горизонт', model.horizonLabel],
    ['Тип прогресса', model.progressTypeLabel],
    ['Создана', model.createdAtLabel],
    ['Обновлена', model.updatedAtLabel],
  ] as const;
  return (
    <aside className="goal-detail-metadata" aria-labelledby="goal-detail-metadata-title">
      <h2 id="goal-detail-metadata-title">Информация цели</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function GoalProgress({
  progress,
}: {
  readonly progress: GoalDetailModel['progress'];
}): ReactElement {
  return (
    <div className="goal-detail-progress">
      <span>{progress.label}</span>
      {progress.kind === 'metric' || progress.kind === 'milestones' ? (
        <progress
          max="100"
          value={progress.percent}
          aria-label={`Прогресс цели: ${progress.label}`}
        />
      ) : null}
    </div>
  );
}

function GoalRouteAnchor({
  children,
  className,
  href,
  onOpen,
}: {
  readonly children: string;
  readonly className?: string;
  readonly href: string;
  readonly onOpen: () => void;
}): ReactElement {
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onOpen();
  };
  return (
    <a className={className} href={href} onClick={open}>
      {children}
    </a>
  );
}
