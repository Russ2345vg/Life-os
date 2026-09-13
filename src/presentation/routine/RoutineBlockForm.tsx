import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import type { RoutineActionOption } from '../../application';
import { ROUTINE_BLOCK_ASSIGNMENT, ROUTINE_BLOCK_RECURRENCE, type IsoWeekday } from '../../domain';
import {
  changeRoutineBlockAssignment,
  type RoutineBlockFormErrors,
  type RoutineBlockFormState,
} from './RoutineBlockFormState';
import {
  ROUTINE_ASSIGNMENT_LABELS,
  ROUTINE_CATEGORY_LABELS,
  ROUTINE_RECURRENCE_LABELS,
} from './RoutineBlockLabels';

const WEEKDAYS: readonly { readonly value: IsoWeekday; readonly label: string }[] = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

interface RoutineBlockFormProps {
  readonly form: RoutineBlockFormState;
  readonly errors: RoutineBlockFormErrors;
  readonly submitError: string | null;
  readonly isEditing: boolean;
  readonly isSaving: boolean;
  readonly onChange: (form: RoutineBlockFormState) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
  readonly actionOptions?: readonly RoutineActionOption[];
  readonly unavailableActionLabel?: string;
}

export function RoutineBlockForm({
  form,
  errors,
  submitError,
  isEditing,
  isSaving,
  onChange,
  onCancel,
  onSubmit,
  actionOptions = [],
  unavailableActionLabel,
}: RoutineBlockFormProps) {
  return (
    <div className="routine-form-backdrop" role="presentation">
      <section
        className="routine-form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="routine-form-title"
      >
        <header>
          <p className="section-page-eyebrow">План дня</p>
          <h2 id="routine-form-title">{isEditing ? 'Редактировать блок' : 'Создать блок'}</h2>
        </header>
        <div className="routine-form-grid">
          <VoiceField className="routine-field routine-field-wide">
            <span>Название</span>
            <VoiceTextInput
              autoFocus
              value={form.title}
              disabled={isSaving}
              aria-invalid={errors.title === undefined ? undefined : true}
              onValueChange={(value) => onChange({ ...form, title: value })}
            />
            {errors.title === undefined ? null : (
              <small className="form-error">{errors.title}</small>
            )}
          </VoiceField>
          <label className="routine-field">
            <span>Дата начала правила</span>
            <input
              type="date"
              value={form.anchorDate}
              disabled={isSaving}
              onChange={(event) => onChange({ ...form, anchorDate: event.target.value })}
            />
          </label>
          <label className="routine-field">
            <span>Категория</span>
            <select
              value={form.category}
              disabled={isSaving}
              onChange={(event) =>
                onChange({
                  ...form,
                  category: event.target.value as RoutineBlockFormState['category'],
                })
              }
            >
              {Object.entries(ROUTINE_CATEGORY_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="routine-field">
            <span>Начало</span>
            <input
              type="time"
              value={form.startTime}
              disabled={isSaving}
              aria-invalid={errors.startTime === undefined ? undefined : true}
              onChange={(event) => onChange({ ...form, startTime: event.target.value })}
            />
            {errors.startTime === undefined ? null : (
              <small className="form-error">{errors.startTime}</small>
            )}
          </label>
          <label className="routine-field">
            <span>Окончание</span>
            <input
              type="time"
              value={form.endTime}
              disabled={isSaving}
              aria-invalid={errors.endTime === undefined ? undefined : true}
              onChange={(event) => onChange({ ...form, endTime: event.target.value })}
            />
            {errors.endTime === undefined ? null : (
              <small className="form-error">{errors.endTime}</small>
            )}
          </label>
          <label className="routine-field routine-field-wide">
            <span>Назначение</span>
            <select
              value={form.assignmentKind}
              disabled={isSaving}
              onChange={(event) =>
                onChange(
                  changeRoutineBlockAssignment(
                    form,
                    event.target.value as RoutineBlockFormState['assignmentKind'],
                  ),
                )
              }
            >
              {Object.entries(ROUTINE_ASSIGNMENT_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.assignmentKind === ROUTINE_BLOCK_ASSIGNMENT.existingAction ? (
            <label className="routine-field routine-field-wide">
              <span>Связанное действие</span>
              <select
                value={form.actionId}
                disabled={isSaving}
                aria-invalid={errors.actionId === undefined ? undefined : true}
                onChange={(event) => onChange({ ...form, actionId: event.target.value })}
              >
                <option value="">Выберите действие</option>
                {unavailableActionLabel === undefined ||
                actionOptions.some(
                  (option) => option.lifeAction.id.toString() === form.actionId,
                ) ? null : (
                  <option value={form.actionId}>{unavailableActionLabel}</option>
                )}
                {actionOptions.map((option) => (
                  <option
                    value={option.lifeAction.id.toString()}
                    key={option.lifeAction.id.toString()}
                  >
                    {option.lifeAction.title.toString()}
                    {option.decision === null
                      ? ''
                      : ` · Решение: ${option.decision.title.toString()}`}
                  </option>
                ))}
              </select>
              {errors.actionId === undefined ? null : (
                <small className="form-error">{errors.actionId}</small>
              )}
              <small>
                Одна повторяющаяся запись связывается с одним действием; отдельные копии действия
                для повторений не создаются.
              </small>
            </label>
          ) : null}
          <label className="routine-field routine-field-wide">
            <span>Повторяемость</span>
            <select
              value={form.recurrence}
              disabled={isSaving}
              onChange={(event) => {
                const recurrence = event.target.value as RoutineBlockFormState['recurrence'];
                onChange({
                  ...form,
                  recurrence,
                  selectedWeekdays:
                    recurrence === ROUTINE_BLOCK_RECURRENCE.selectedWeekdays
                      ? form.selectedWeekdays
                      : [],
                });
              }}
            >
              {Object.entries(ROUTINE_RECURRENCE_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.recurrence === ROUTINE_BLOCK_RECURRENCE.selectedWeekdays ? (
            <fieldset className="routine-weekdays routine-field-wide">
              <legend>Дни недели</legend>
              <div>
                {WEEKDAYS.map((weekday) => (
                  <label key={weekday.value}>
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={form.selectedWeekdays.includes(weekday.value)}
                      onChange={(event) =>
                        onChange({
                          ...form,
                          selectedWeekdays: event.target.checked
                            ? [...form.selectedWeekdays, weekday.value].sort()
                            : form.selectedWeekdays.filter((value) => value !== weekday.value),
                        })
                      }
                    />
                    <span>{weekday.label}</span>
                  </label>
                ))}
              </div>
              {errors.selectedWeekdays === undefined ? null : (
                <small className="form-error">{errors.selectedWeekdays}</small>
              )}
            </fieldset>
          ) : null}
          <label className="routine-required routine-field-wide">
            <input
              type="checkbox"
              checked={form.required}
              disabled={isSaving}
              onChange={(event) => onChange({ ...form, required: event.target.checked })}
            />
            <span>
              <strong>Обязательный блок</strong>
              <small>Свойство плана без оценки выполнения.</small>
            </span>
          </label>
        </div>
        {submitError === null ? null : (
          <p className="form-error routine-submit-error" role="alert">
            {submitError}
          </p>
        )}
        <footer className="form-actions">
          <button className="secondary-button" type="button" disabled={isSaving} onClick={onCancel}>
            Отмена
          </button>
          <button className="primary-button" type="button" disabled={isSaving} onClick={onSubmit}>
            {isSaving ? 'Сохраняем…' : isEditing ? 'Сохранить изменения' : 'Создать блок'}
          </button>
        </footer>
      </section>
    </div>
  );
}
