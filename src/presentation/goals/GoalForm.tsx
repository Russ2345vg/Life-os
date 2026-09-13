import type { SpheresSnapshot } from '../../application';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { useEffect, type ChangeEvent, type FormEvent, type ReactElement } from 'react';
import {
  GOAL_INTENTION_LEVEL,
  GOAL_QUALITATIVE_STAGE,
  GOAL_STAGE,
  MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH,
  MAX_GOAL_NEXT_PROGRESS_LENGTH,
  MAX_GOAL_TITLE_LENGTH,
  MAX_GOAL_WHY_LENGTH,
  type GoalHorizon,
  type GoalIntentionLevel,
  type GoalQualitativeStage,
  type GoalStage,
} from '../../domain';
import { GoalCardPreview } from './GoalCard';
import {
  buildGoalFormPreview,
  GOAL_FORM_HORIZON_OPTIONS,
  GOAL_FORM_INTENTION_OPTIONS,
  GOAL_FORM_QUALITATIVE_OPTIONS,
  GOAL_FORM_STAGE_OPTIONS,
  type GoalDirectionOptionGroup,
  type GoalFormDraft,
  type GoalFormErrors,
  type GoalFormField,
  type GoalFormMode,
  type GoalProgressDraft,
} from './GoalFormModel';
import {
  goalHorizonLabel,
  goalStageLabel,
  qualitativeProgressLabel,
} from './goalAlbumPresentation';

export interface GoalFormProps {
  readonly spheres?: SpheresSnapshot | undefined;
  readonly mode: GoalFormMode;
  readonly draft: GoalFormDraft;
  readonly directions: readonly GoalDirectionOptionGroup[];
  readonly errors: GoalFormErrors;
  readonly disabled: boolean;
  readonly coverState: 'idle' | 'reading';
  readonly submitError: string | null;
  readonly focusField: GoalFormField | null;
  readonly onChange: (draft: GoalFormDraft) => void;
  readonly onCoverFile: (file: File) => void;
  readonly onRemoveCover: () => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}

const FIELD_IDS: Readonly<Record<GoalFormField, string>> = {
  title: 'goal-title',
  description: 'goal-description',
  whyImportant: 'goal-why-important',
  whyNow: 'goal-why-now',
  directionId: 'goal-direction',
  stage: 'goal-stage-idea',
  progressCurrent: 'goal-progress-current',
  progressTarget: 'goal-progress-target',
  progressUnit: 'goal-progress-unit',
  progressCompleted: 'goal-progress-completed',
  progressTotal: 'goal-progress-total',
  achievementCriteria: 'goal-achievement-criteria',
  nextProgress: 'goal-next-progress',
};

export function GoalForm(props: GoalFormProps): ReactElement {
  const { draft, errors, disabled } = props;

  useEffect(() => {
    if (props.focusField === null) return;
    document.getElementById(FIELD_IDS[props.focusField])?.focus();
  }, [props.focusField]);

  const update = <Key extends keyof GoalFormDraft>(key: Key, value: GoalFormDraft[Key]): void =>
    props.onChange({ ...draft, [key]: value });
  const updateProgress = (progress: GoalProgressDraft): void => update('progress', progress);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!disabled) props.onSubmit();
  };
  const coverFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (file !== undefined) props.onCoverFile(file);
  };

  return (
    <form className="goal-form" noValidate onSubmit={submit}>
      <div className="goal-form-layout">
        <div className="goal-form-main">
          <section className="goal-form-section" aria-labelledby="goal-form-main-title">
            <header>
              <p>01</p>
              <h2 id="goal-form-main-title">Основное</h2>
            </header>

            <div className="goal-form-field">
              <label htmlFor="goal-title">Название цели</label>
              <VoiceTextInput
                id="goal-title"
                name="title"
                value={draft.title}
                maxLength={MAX_GOAL_TITLE_LENGTH}
                disabled={disabled}
                aria-invalid={errors.title === undefined ? undefined : true}
                aria-describedby={describedBy('goal-title-hint', 'goal-title-error', errors.title)}
                onValueChange={(value) => update('title', value)}
              />
              <div id="goal-title-hint" className="goal-form-hint">
                <span>Сформулируйте конкретный желаемый результат</span>
                <span>
                  {draft.title.length} / {MAX_GOAL_TITLE_LENGTH}
                </span>
              </div>
              <FieldError id="goal-title-error" message={errors.title} />
            </div>

            <div className="goal-form-field">
              <label htmlFor="goal-description">Описание</label>
              <VoiceTextArea
                id="goal-description"
                value={draft.description ?? ''}
                maxLength={4000}
                disabled={disabled}
                onValueChange={(value) => update('description', value)}
              />
              <FieldError id="goal-description-error" message={errors.description} />
            </div>
            {draft.directionId === null && props.spheres ? (
              <div className="goal-form-field">
                <label htmlFor="goal-sphere">Сфера</label>
                <select
                  id="goal-sphere"
                  value={draft.sphereId ?? ''}
                  disabled={disabled}
                  onChange={(event) => update('sphereId', event.target.value || null)}
                >
                  <option value="">Без сферы</option>
                  {[
                    ...props.spheres.active,
                    ...props.spheres.archived.filter(
                      (sphere) => sphere.id.toString() === draft.sphereId,
                    ),
                  ].map((sphere) => (
                    <option key={sphere.id.toString()} value={sphere.id.toString()}>
                      {sphere.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="goal-form-field goal-form-cover-field">
              <label htmlFor="goal-cover">Обложка</label>
              {draft.coverImage === null ? null : (
                <img src={draft.coverImage.dataUrl} alt="Текущая обложка цели" />
              )}
              <div className="goal-form-cover-actions">
                <input
                  id="goal-cover"
                  name="cover"
                  type="file"
                  accept="image/*"
                  disabled={disabled || props.coverState === 'reading'}
                  onChange={coverFile}
                />
                {draft.coverImage === null ? null : (
                  <button type="button" disabled={disabled} onClick={props.onRemoveCover}>
                    Удалить обложку
                  </button>
                )}
              </div>
              {props.coverState === 'reading' ? (
                <p className="goal-form-hint" role="status">
                  Читаем изображение…
                </p>
              ) : null}
            </div>

            <TextAreaField
              id="goal-why-important"
              label="Почему это важно"
              prompt="Что изменится в вашей жизни, когда цель будет достигнута?"
              value={draft.whyImportant}
              maximum={MAX_GOAL_WHY_LENGTH}
              disabled={disabled}
              error={errors.whyImportant}
              onChange={(value) => update('whyImportant', value)}
            />
            <TextAreaField
              id="goal-why-now"
              label="Почему сейчас"
              prompt="Почему этой цели стоит дать место именно сейчас?"
              value={draft.whyNow}
              maximum={MAX_GOAL_WHY_LENGTH}
              disabled={disabled}
              error={errors.whyNow}
              onChange={(value) => update('whyNow', value)}
            />
          </section>

          <section className="goal-form-section" aria-labelledby="goal-form-parameters-title">
            <header>
              <p>02</p>
              <h2 id="goal-form-parameters-title">Параметры</h2>
            </header>

            <div className="goal-form-parameter-grid">
              <div className="goal-form-field">
                <label htmlFor="goal-direction">Направление</label>
                <select
                  id="goal-direction"
                  name="directionId"
                  value={draft.directionId ?? ''}
                  disabled={disabled}
                  aria-invalid={errors.directionId === undefined ? undefined : true}
                  aria-describedby={
                    errors.directionId === undefined ? undefined : 'goal-direction-error'
                  }
                  onChange={(event) =>
                    update(
                      'directionId',
                      event.currentTarget.value === '' ? null : event.currentTarget.value,
                    )
                  }
                >
                  <option value="">Без направления</option>
                  {props.directions.map((group) => (
                    <optgroup key={group.sphereId ?? '__without-sphere__'} label={group.sphereName}>
                      {group.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                          {option.archived ? ' · В архиве' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <FieldError id="goal-direction-error" message={errors.directionId} />
              </div>

              <div className="goal-form-field">
                <label htmlFor="goal-horizon">Горизонт</label>
                <select
                  id="goal-horizon"
                  name="horizon"
                  value={draft.horizon ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    update(
                      'horizon',
                      event.currentTarget.value === ''
                        ? null
                        : (event.currentTarget.value as GoalHorizon),
                    )
                  }
                >
                  <option value="">Не задан</option>
                  {GOAL_FORM_HORIZON_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {goalHorizonLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <SegmentedField<GoalStage>
                legend="Стадия"
                options={GOAL_FORM_STAGE_OPTIONS}
                value={draft.stage}
                disabled={disabled}
                optionDisabled={(option) =>
                  props.mode === 'create' && option === GOAL_STAGE.achieved
                }
                label={goalStageLabel}
                id={(option) => `goal-stage-${option.replace('_goal', '')}`}
                {...(errors.stage === undefined ? {} : { error: errors.stage })}
                onChange={(value) => update('stage', value)}
              />

              <SegmentedField<GoalIntentionLevel | null>
                legend="Уровень намерения"
                options={[null, ...GOAL_FORM_INTENTION_OPTIONS]}
                value={draft.intentionLevel}
                disabled={disabled}
                label={intentionLabel}
                id={(option) => `goal-intention-${option ?? 'none'}`}
                onChange={(value) => update('intentionLevel', value)}
              />

              <ProgressFields
                draft={draft.progress}
                errors={errors}
                disabled={disabled}
                onChange={updateProgress}
              />
            </div>

            <div className="goal-form-narrative-grid">
              <TextAreaField
                id="goal-achievement-criteria"
                label="Критерий достижения"
                prompt="По какому наблюдаемому результату вы поймёте, что цель достигнута?"
                value={draft.achievementCriteria}
                maximum={MAX_GOAL_ACHIEVEMENT_CRITERIA_LENGTH}
                disabled={disabled}
                error={errors.achievementCriteria}
                onChange={(value) => update('achievementCriteria', value)}
              />
              <TextAreaField
                id="goal-next-progress"
                label="Следующее продвижение"
                prompt="Какое ближайшее meaningful продвижение приблизит вас к цели?"
                value={draft.nextProgress}
                maximum={MAX_GOAL_NEXT_PROGRESS_LENGTH}
                disabled={disabled}
                error={errors.nextProgress}
                onChange={(value) => update('nextProgress', value)}
              />
            </div>
          </section>
        </div>

        <aside className="goal-form-preview" aria-labelledby="goal-form-preview-title">
          <div>
            <p>Предпросмотр</p>
            <h2 id="goal-form-preview-title">Так цель появится в Альбоме</h2>
          </div>
          <GoalCardPreview goal={buildGoalFormPreview(draft, props.directions)} />
        </aside>
      </div>

      {props.submitError === null ? null : (
        <p className="goal-form-submit-error" role="alert">
          {props.submitError}
        </p>
      )}
      <footer className="goal-form-actions">
        <button type="button" disabled={disabled} onClick={props.onCancel}>
          Отмена
        </button>
        <button type="submit" disabled={disabled || props.coverState === 'reading'}>
          {disabled ? 'Сохраняем…' : props.mode === 'create' ? 'Создать цель' : 'Сохранить'}
        </button>
      </footer>
    </form>
  );
}

function TextAreaField(props: {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly value: string;
  readonly maximum: number;
  readonly disabled: boolean;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const hintId = `${props.id}-hint`;
  const errorId = `${props.id}-error`;
  return (
    <div className="goal-form-field">
      <label htmlFor={props.id}>{props.label}</label>
      <VoiceTextArea
        id={props.id}
        value={props.value}
        maxLength={props.maximum}
        disabled={props.disabled}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={describedBy(hintId, errorId, props.error)}
        onValueChange={(value) => props.onChange(value)}
      />
      <div id={hintId} className="goal-form-hint">
        <span>{props.prompt}</span>
        <span>
          {props.value.length} / {props.maximum}
        </span>
      </div>
      <FieldError id={errorId} message={props.error} />
    </div>
  );
}

function SegmentedField<Value extends string | null>(props: {
  readonly legend: string;
  readonly options: readonly Value[];
  readonly value: Value;
  readonly disabled: boolean;
  readonly label: (value: Value) => string;
  readonly id: (value: Value) => string;
  readonly optionDisabled?: (value: Value) => boolean;
  readonly error?: string;
  readonly onChange: (value: Value) => void;
}): ReactElement {
  return (
    <fieldset className="goal-form-field goal-form-segmented">
      <legend>{props.legend}</legend>
      <div>
        {props.options.map((option) => (
          <button
            key={option ?? '__none__'}
            id={props.id(option)}
            type="button"
            value={option ?? ''}
            aria-pressed={props.value === option}
            disabled={props.disabled || props.optionDisabled?.(option) === true}
            onClick={() => props.onChange(option)}
          >
            {props.label(option)}
          </button>
        ))}
      </div>
      <FieldError id="goal-stage-error" message={props.error} />
    </fieldset>
  );
}

function ProgressFields(props: {
  readonly draft: GoalProgressDraft;
  readonly errors: GoalFormErrors;
  readonly disabled: boolean;
  readonly onChange: (draft: GoalProgressDraft) => void;
}): ReactElement {
  const changeKind = (value: string): void => {
    switch (value) {
      case 'none':
        props.onChange({ kind: 'none' });
        break;
      case 'metric':
        props.onChange({ kind: 'metric', current: '0', target: '100', unit: '%' });
        break;
      case 'milestones':
        props.onChange({ kind: 'milestones', completed: '0', total: '1' });
        break;
      case 'qualitative':
        props.onChange({ kind: 'qualitative', stage: GOAL_QUALITATIVE_STAGE.start });
        break;
    }
  };

  return (
    <div className="goal-form-progress-fields">
      <div className="goal-form-field">
        <label htmlFor="goal-progress-type">Тип прогресса</label>
        <select
          id="goal-progress-type"
          value={props.draft.kind}
          disabled={props.disabled}
          onChange={(event) => changeKind(event.currentTarget.value)}
        >
          <option value="none">Не задан</option>
          <option value="metric">Измеримый</option>
          <option value="milestones">Этапный</option>
          <option value="qualitative">Качественный</option>
        </select>
      </div>

      {props.draft.kind === 'metric' ? (
        <div className="goal-form-progress-grid">
          <ShortField
            id="goal-progress-current"
            label="Текущее значение"
            inputMode="decimal"
            value={props.draft.current}
            disabled={props.disabled}
            error={props.errors.progressCurrent}
            onChange={(current) => {
              if (props.draft.kind === 'metric') props.onChange({ ...props.draft, current });
            }}
          />
          <ShortField
            id="goal-progress-target"
            label="Целевое значение"
            inputMode="decimal"
            value={props.draft.target}
            disabled={props.disabled}
            error={props.errors.progressTarget}
            onChange={(target) => {
              if (props.draft.kind === 'metric') props.onChange({ ...props.draft, target });
            }}
          />
          <ShortField
            id="goal-progress-unit"
            label="Единица"
            value={props.draft.unit}
            disabled={props.disabled}
            error={props.errors.progressUnit}
            onChange={(unit) => {
              if (props.draft.kind === 'metric') props.onChange({ ...props.draft, unit });
            }}
          />
        </div>
      ) : null}

      {props.draft.kind === 'milestones' ? (
        <div className="goal-form-progress-grid">
          <ShortField
            id="goal-progress-completed"
            label="Завершено этапов"
            inputMode="numeric"
            value={props.draft.completed}
            disabled={props.disabled}
            error={props.errors.progressCompleted}
            onChange={(completed) => {
              if (props.draft.kind === 'milestones') {
                props.onChange({ ...props.draft, completed });
              }
            }}
          />
          <ShortField
            id="goal-progress-total"
            label="Всего этапов"
            inputMode="numeric"
            value={props.draft.total}
            disabled={props.disabled}
            error={props.errors.progressTotal}
            onChange={(total) => {
              if (props.draft.kind === 'milestones') props.onChange({ ...props.draft, total });
            }}
          />
        </div>
      ) : null}

      {props.draft.kind === 'qualitative' ? (
        <div className="goal-form-field">
          <label htmlFor="goal-progress-qualitative">Стадия продвижения</label>
          <select
            id="goal-progress-qualitative"
            value={props.draft.stage}
            disabled={props.disabled}
            onChange={(event) =>
              props.onChange({
                kind: 'qualitative',
                stage: event.currentTarget.value as GoalQualitativeStage,
              })
            }
          >
            {GOAL_FORM_QUALITATIVE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {qualitativeProgressLabel(option)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function ShortField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly inputMode?: 'decimal' | 'numeric';
  readonly disabled: boolean;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const errorId = `${props.id}-error`;
  return (
    <div className="goal-form-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        inputMode={props.inputMode}
        value={props.value}
        disabled={props.disabled}
        aria-invalid={props.error === undefined ? undefined : true}
        aria-describedby={props.error === undefined ? undefined : errorId}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
      <FieldError id={errorId} message={props.error} />
    </div>
  );
}

function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}): ReactElement | null {
  return message === undefined ? null : (
    <p id={id} className="goal-form-field-error">
      {message}
    </p>
  );
}

function describedBy(hintId: string, errorId: string, error: string | undefined): string {
  return error === undefined ? hintId : `${hintId} ${errorId}`;
}

function intentionLabel(value: GoalIntentionLevel | null): string {
  switch (value) {
    case null:
      return 'Не задан';
    case GOAL_INTENTION_LEVEL.want:
      return 'Хочу';
    case GOAL_INTENTION_LEVEL.plan:
      return 'Планирую';
    case GOAL_INTENTION_LEVEL.commit:
      return 'Обязуюсь';
  }
}
