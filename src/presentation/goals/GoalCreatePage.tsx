import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { SpheresSnapshot, CreateGoal, GetDirections, GetSpheres } from '../../application';
import { GoalForm } from './GoalForm';
import {
  buildGoalDirectionOptionGroups,
  createEmptyGoalFormDraft,
  type GoalDirectionOptionGroup,
  type GoalFormDraft,
} from './GoalFormModel';
import {
  browserGoalFileReader,
  readGoalCoverImage,
  type GoalFileReader,
} from './GoalCoverImageReader';
import {
  createGoalFormSubmissionController,
  type GoalFormSubmissionState,
} from './GoalFormSubmissionController';
import type { GoalAlbumRoute } from './GoalAlbumNavigation';
import { createGoalSubmissionExecutor, loadGoalFormOptions } from './GoalCreatePageSupport';

export interface GoalCreatePageProps {
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
  readonly createGoal: Pick<CreateGoal, 'execute'>;
  readonly onMutated: () => void;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
  readonly fileReader?: GoalFileReader;
}

export type GoalCreateOptionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly spheres?: SpheresSnapshot;
      readonly directionGroups: readonly GoalDirectionOptionGroup[];
    };

export function GoalCreatePage(props: GoalCreatePageProps): ReactElement {
  const [draft, setDraft] = useState<GoalFormDraft>(createEmptyGoalFormDraft);
  const [optionsState, setOptionsState] = useState<GoalCreateOptionsState>({ status: 'loading' });
  const [optionsRevision, setOptionsRevision] = useState(0);
  const [submissionState, setSubmissionState] = useState<GoalFormSubmissionState>({
    status: 'idle',
  });
  const [coverState, setCoverState] = useState<'idle' | 'reading'>('idle');
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverSequence = useRef(0);
  const { createGoal, getDirections, getSpheres, onMutated, onRouteChange } = props;

  useEffect(() => {
    let current = true;
    void loadGoalFormOptions({ getDirections, getSpheres })
      .then((source) => {
        if (!current) return;
        setOptionsState({
          status: 'ready',
          spheres: source.spheres,
          directionGroups: buildGoalDirectionOptionGroups(source.directions, source.spheres),
        });
      })
      .catch(() => {
        if (current) setOptionsState({ status: 'error' });
      });
    return () => {
      current = false;
    };
  }, [getDirections, getSpheres, optionsRevision]);

  useEffect(
    () => () => {
      coverSequence.current += 1;
    },
    [],
  );

  const submissionController = useMemo(
    () =>
      createGoalFormSubmissionController({
        mode: 'create',
        execute: createGoalSubmissionExecutor({ createGoal, onMutated, onRouteChange }),
        publish: setSubmissionState,
      }),
    [createGoal, onMutated, onRouteChange],
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
        if (attempt === coverSequence.current) setDraft((current) => ({ ...current, coverImage }));
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

  return (
    <GoalCreateScreen
      draft={draft}
      optionsState={optionsState}
      submissionState={submissionState}
      coverState={coverState}
      coverError={coverError}
      onDraftChange={changeDraft}
      onCoverFile={readCover}
      onRemoveCover={() => setDraft((current) => ({ ...current, coverImage: null }))}
      onSubmit={() => {
        if (submissionController.getState().status !== 'submitting') {
          void submissionController.submit(draft);
        }
      }}
      onCancel={() => onRouteChange({ view: 'album' })}
      onRetryOptions={() => {
        setOptionsState({ status: 'loading' });
        setOptionsRevision((current) => current + 1);
      }}
    />
  );
}

export interface GoalCreateScreenProps {
  readonly draft: GoalFormDraft;
  readonly optionsState: GoalCreateOptionsState;
  readonly submissionState: GoalFormSubmissionState;
  readonly coverState: 'idle' | 'reading';
  readonly coverError: string | null;
  readonly onDraftChange: (draft: GoalFormDraft) => void;
  readonly onCoverFile: (file: File) => void;
  readonly onRemoveCover: () => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onRetryOptions: () => void;
}

export function GoalCreateScreen(props: GoalCreateScreenProps): ReactElement {
  return (
    <main className="goal-album-page goal-create-page">
      <header className="goal-form-page-header">
        <button type="button" onClick={props.onCancel}>
          Вернуться в Альбом целей
        </button>
        <p>Альбом целей · Создание</p>
        <h1>Новая цель</h1>
        <p>Сформулируйте направление и ближайшее продвижение.</p>
      </header>
      {props.optionsState.status === 'loading' ? (
        <section className="goal-detail-state" role="status">
          <h2>Загружаем параметры цели…</h2>
        </section>
      ) : null}
      {props.optionsState.status === 'error' ? (
        <section className="goal-detail-state" role="alert">
          <h2>Не удалось загрузить направления</h2>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <button type="button" onClick={props.onRetryOptions}>
            Повторить
          </button>
        </section>
      ) : null}
      {props.optionsState.status === 'ready' ? (
        <GoalForm
          mode="create"
          spheres={props.optionsState.spheres}
          draft={props.draft}
          directions={props.optionsState.directionGroups}
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
