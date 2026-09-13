import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { GetDirections, GetGoalById, GetSpheres, UpdateGoal } from '../../application';
import { GoalForm } from './GoalForm';
import type { GoalFormDraft } from './GoalFormModel';
import {
  browserGoalFileReader,
  readGoalCoverImage,
  type GoalFileReader,
} from './GoalCoverImageReader';
import {
  createGoalFormSubmissionController,
  type GoalFormSubmissionState,
} from './GoalFormSubmissionController';
import {
  createGoalEditLoadController,
  loadGoalEdit,
  type GoalEditLoadState,
} from './GoalEditLoader';
import { createGoalUpdateExecutor } from './GoalEditPageSupport';
import type { GoalAlbumRoute } from './GoalAlbumNavigation';

export interface GoalEditPageProps {
  readonly goalId: string;
  readonly getGoalById: Pick<GetGoalById, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly updateGoal: Pick<UpdateGoal, 'execute'>;
  readonly onMutated: () => void;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
  readonly fileReader?: GoalFileReader;
}

export function GoalEditPage(props: GoalEditPageProps): ReactElement {
  const [loadState, setLoadState] = useState<GoalEditLoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<GoalFormDraft | null>(null);
  const [submissionState, setSubmissionState] = useState<GoalFormSubmissionState>({
    status: 'idle',
  });
  const [coverState, setCoverState] = useState<'idle' | 'reading'>('idle');
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverSequence = useRef(0);
  const { getDirections, getGoalById, getSpheres, goalId, onMutated, onRouteChange, updateGoal } =
    props;

  const loadController = useMemo(
    () =>
      createGoalEditLoadController({
        load: () => loadGoalEdit(goalId, { getDirections, getGoalById, getSpheres }),
        publish(next) {
          setLoadState(next);
          if (next.status === 'ready') setDraft(next.draft);
        },
      }),
    [getDirections, getGoalById, getSpheres, goalId],
  );

  useEffect(() => {
    loadController.activate();
    return loadController.cancel;
  }, [loadController]);

  useEffect(
    () => () => {
      coverSequence.current += 1;
    },
    [],
  );

  const editableGoal = loadState.status === 'ready' ? loadState.goal : null;
  const submissionController = useMemo(
    () =>
      createGoalFormSubmissionController({
        mode: 'edit',
        execute: async (values) => {
          if (editableGoal === null) throw new Error('Goal edit submission is unavailable.');
          return createGoalUpdateExecutor({
            goal: editableGoal,
            updateGoal,
            onMutated,
            onRouteChange,
          })(values);
        },
        publish: setSubmissionState,
      }),
    [editableGoal, onMutated, onRouteChange, updateGoal],
  );

  const changeDraft = (next: GoalFormDraft): void => {
    setDraft(next);
    setCoverError(null);
    if (submissionController.getState().status !== 'submitting') {
      setSubmissionState({ status: 'idle' });
    }
  };

  const readCover = (file: File): void => {
    const attempt = ++coverSequence.current;
    setCoverError(null);
    setCoverState('reading');
    void readGoalCoverImage(file, props.fileReader ?? browserGoalFileReader)
      .then((coverImage) => {
        if (attempt === coverSequence.current) {
          setDraft((current) => (current === null ? null : { ...current, coverImage }));
        }
      })
      .catch((error: unknown) => {
        if (attempt !== coverSequence.current) return;
        setCoverError(
          error instanceof Error ? error.message : 'Не удалось прочитать выбранное изображение.',
        );
      })
      .finally(() => {
        if (attempt === coverSequence.current) setCoverState('idle');
      });
  };

  const backToDetail = (): void => onRouteChange({ view: 'detail', goalId });
  return (
    <GoalEditScreen
      loadState={loadState}
      draft={draft}
      submissionState={submissionState}
      coverState={coverState}
      coverError={coverError}
      onDraftChange={changeDraft}
      onCoverFile={readCover}
      onRemoveCover={() =>
        setDraft((current) => (current === null ? null : { ...current, coverImage: null }))
      }
      onSubmit={() => {
        if (draft !== null && submissionController.getState().status !== 'submitting') {
          void submissionController.submit(draft);
        }
      }}
      onCancel={backToDetail}
      onBackToAlbum={() => onRouteChange({ view: 'album' })}
      onBackToDetail={backToDetail}
      onRetry={() => {
        setSubmissionState({ status: 'idle' });
        loadController.retry();
      }}
    />
  );
}

export interface GoalEditScreenProps {
  readonly loadState: GoalEditLoadState;
  readonly draft: GoalFormDraft | null;
  readonly submissionState: GoalFormSubmissionState;
  readonly coverState: 'idle' | 'reading';
  readonly coverError: string | null;
  readonly onDraftChange: (draft: GoalFormDraft) => void;
  readonly onCoverFile: (file: File) => void;
  readonly onRemoveCover: () => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onBackToAlbum: () => void;
  readonly onBackToDetail: () => void;
  readonly onRetry: () => void;
}

export function GoalEditScreen(props: GoalEditScreenProps): ReactElement {
  return (
    <main className="goal-album-page goal-edit-page">
      <header className="goal-form-page-header">
        <button type="button" onClick={props.onCancel}>
          Вернуться к цели
        </button>
        <p>Альбом целей · Редактирование</p>
        <h1>Редактирование цели</h1>
        <p>Обновите формулировку, параметры и ближайшее продвижение.</p>
      </header>

      {props.loadState.status === 'loading' ? (
        <GoalEditState role="status" title="Загружаем цель…" />
      ) : null}
      {props.loadState.status === 'not-found' ? (
        <GoalEditState role="alert" title="Цель не найдена">
          <button type="button" onClick={props.onBackToAlbum}>
            Вернуться в Альбом целей
          </button>
        </GoalEditState>
      ) : null}
      {props.loadState.status === 'archived' ? (
        <GoalEditState role="alert" title="Архивную цель нельзя редактировать">
          <button type="button" onClick={props.onBackToDetail}>
            Открыть цель
          </button>
        </GoalEditState>
      ) : null}
      {props.loadState.status === 'error' ? (
        <GoalEditState role="alert" title="Не удалось загрузить цель">
          <button type="button" onClick={props.onRetry}>
            Повторить
          </button>
        </GoalEditState>
      ) : null}
      {props.loadState.status === 'ready' && props.draft !== null ? (
        <GoalForm
          mode="edit"
          spheres={props.loadState.spheres}
          draft={props.draft}
          directions={props.loadState.groups}
          errors={props.submissionState.status === 'invalid' ? props.submissionState.errors : {}}
          disabled={props.submissionState.status === 'submitting'}
          coverState={props.coverState}
          submitError={
            props.coverError ??
            (props.submissionState.status === 'error' ? props.submissionState.message : null)
          }
          focusField={
            props.submissionState.status === 'invalid'
              ? props.submissionState.firstInvalidField
              : null
          }
          onChange={props.onDraftChange}
          onCoverFile={props.onCoverFile}
          onRemoveCover={props.onRemoveCover}
          onSubmit={props.onSubmit}
          onCancel={props.onCancel}
        />
      ) : null}
    </main>
  );
}

function GoalEditState({
  role,
  title,
  children,
}: {
  readonly role: 'status' | 'alert';
  readonly title: string;
  readonly children?: ReactElement;
}): ReactElement {
  return (
    <section className="goal-detail-state" role={role}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
