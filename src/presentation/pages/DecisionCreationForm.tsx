import type { ChangeEvent, FormEvent } from 'react';
import {
  DECISION_KIND,
  DECISION_PRIORITY,
  type DayDate,
  type DecisionKind,
  type DecisionPriority,
} from '../../domain';
import type {
  DecisionCreationFormErrors,
  DecisionCreationFormState,
} from './DecisionCreationFormState';

interface DecisionCreationFormProps {
  readonly currentDate: DayDate;
  readonly form: DecisionCreationFormState;
  readonly errors: DecisionCreationFormErrors;
  readonly isSaving: boolean;
  readonly onChange: (form: DecisionCreationFormState) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function DecisionCreationForm({
  currentDate,
  form,
  errors,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: DecisionCreationFormProps) {
  const isMain = form.kind === DECISION_KIND.main;

  return (
    <section
      className="decision-form-panel section-decision-create decision-creation-panel"
      aria-labelledby="section-decision-form-title"
    >
      <div className="section-heading decision-creation-heading">
        <div>
          <p className="section-kicker">Новое решение</p>
          <h2 id="section-decision-form-title">Создать решение</h2>
          <p className="decision-creation-intro">
            Зафиксируйте смысл решения, ожидаемый итог и цену, которую вы готовы принять.
          </p>
        </div>
        <span className="decision-creation-kind-note">
          {isMain
            ? 'Главное решение займёт одну из трёх позиций'
            : 'Дополнительное решение не занимает главную позицию'}
        </span>
      </div>

      <form className="decision-form decision-creation-form" onSubmit={onSubmit} noValidate>
        <DecisionField label="Вид решения" error={errors.kind} fieldId="decision-kind">
          <select
            id="decision-kind"
            value={form.kind}
            disabled={isSaving}
            aria-invalid={errors.kind !== null}
            aria-describedby={errorId('decision-kind', errors.kind)}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onChange({ ...form, kind: event.target.value as DecisionKind })
            }
          >
            <option value={DECISION_KIND.main}>Главное</option>
            <option value={DECISION_KIND.additional}>Дополнительное</option>
          </select>
        </DecisionField>

        <DecisionField label="Дата" error={errors.plannedDate} fieldId="decision-date">
          <input
            id="decision-date"
            type="date"
            value={form.plannedDate}
            min={currentDate.toString()}
            disabled={isSaving}
            aria-invalid={errors.plannedDate !== null}
            aria-describedby={errorId('decision-date', errors.plannedDate)}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...form, plannedDate: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField
          label="Формулировка решения *"
          error={errors.title}
          fieldId="decision-title"
          wide
        >
          <input
            id="decision-title"
            value={form.title}
            disabled={isSaving}
            maxLength={200}
            autoComplete="off"
            aria-required="true"
            aria-invalid={errors.title !== null}
            aria-describedby={errorId('decision-title', errors.title)}
            placeholder="Например: выпустить проверяемую версию LifeOS"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...form, title: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField label="Причина" error={errors.reason} fieldId="decision-reason" wide>
          <textarea
            id="decision-reason"
            value={form.reason}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            aria-invalid={errors.reason !== null}
            aria-describedby={errorId('decision-reason', errors.reason)}
            placeholder="Почему это решение важно именно сейчас?"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ ...form, reason: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField
          label={`Ожидаемый результат${isMain ? ' *' : ''}`}
          error={errors.expectedResult}
          fieldId="decision-expected-result"
          wide
        >
          <textarea
            id="decision-expected-result"
            value={form.expectedResult}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            aria-required={isMain}
            aria-invalid={errors.expectedResult !== null}
            aria-describedby={errorId('decision-expected-result', errors.expectedResult)}
            placeholder="Какой наблюдаемый итог подтвердит, что решение реализовано?"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ ...form, expectedResult: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField label="Сфера" error={errors.sphere} fieldId="decision-sphere">
          <input
            id="decision-sphere"
            value={form.sphere}
            disabled={isSaving}
            maxLength={120}
            aria-invalid={errors.sphere !== null}
            aria-describedby={errorId('decision-sphere', errors.sphere)}
            placeholder="Работа, здоровье, деньги…"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...form, sphere: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField label="Приоритет" error={errors.priority} fieldId="decision-priority">
          <select
            id="decision-priority"
            value={form.priority}
            disabled={isSaving}
            aria-invalid={errors.priority !== null}
            aria-describedby={errorId('decision-priority', errors.priority)}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onChange({ ...form, priority: event.target.value as DecisionPriority })
            }
          >
            <option value={DECISION_PRIORITY.high}>Высокий</option>
            <option value={DECISION_PRIORITY.normal}>Обычный</option>
            <option value={DECISION_PRIORITY.low}>Низкий</option>
          </select>
        </DecisionField>

        <DecisionField label="Цена решения" error={errors.price} fieldId="decision-price" wide>
          <textarea
            id="decision-price"
            value={form.price}
            disabled={isSaving}
            maxLength={500}
            rows={2}
            aria-invalid={errors.price !== null}
            aria-describedby={errorId('decision-price', errors.price)}
            placeholder="Время, деньги, внимание или другой ресурс"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ ...form, price: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField label="Жертвы" error={errors.sacrifices} fieldId="decision-sacrifices" wide>
          <textarea
            id="decision-sacrifices"
            value={form.sacrifices}
            disabled={isSaving}
            maxLength={1000}
            rows={2}
            aria-invalid={errors.sacrifices !== null}
            aria-describedby={errorId('decision-sacrifices', errors.sacrifices)}
            placeholder="От чего придётся отказаться или что отложить?"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ ...form, sacrifices: event.target.value })
            }
          />
        </DecisionField>

        <DecisionField
          label="Связь с проектом"
          error={errors.projectReference}
          fieldId="decision-project-reference"
          wide
        >
          <input
            id="decision-project-reference"
            value={form.projectReference}
            disabled={isSaving}
            maxLength={200}
            aria-invalid={errors.projectReference !== null}
            aria-describedby={errorId('decision-project-reference', errors.projectReference)}
            placeholder="Название или ссылка на проект (необязательно)"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...form, projectReference: event.target.value })
            }
          />
        </DecisionField>

        {errors.form === null ? null : (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}

        <div className="form-actions decision-creation-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? 'Сохраняем…' : 'Создать решение'}
          </button>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}

interface DecisionFieldProps {
  readonly label: string;
  readonly error: string | null;
  readonly fieldId: string;
  readonly wide?: boolean;
  readonly children: React.ReactNode;
}

function DecisionField({ label, error, fieldId, wide = false, children }: DecisionFieldProps) {
  return (
    <label
      className={wide ? 'decision-form-field decision-form-field-wide' : 'decision-form-field'}
    >
      <span>{label}</span>
      {children}
      {error === null ? null : (
        <small className="field-error" id={`${fieldId}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}

function errorId(fieldId: string, error: string | null): string | undefined {
  return error === null ? undefined : `${fieldId}-error`;
}
