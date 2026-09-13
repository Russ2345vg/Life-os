import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import type { ChangeEvent, FormEvent } from 'react';
import {
  DECISION_KIND,
  DECISION_PRIORITY,
  type DayDate,
  type DecisionKind,
  type DecisionPriority,
  type Project,
} from '../../domain';
import type {
  DecisionCreationFormErrors,
  DecisionCreationFormState,
} from './DecisionCreationFormState';
import type { SpheresSnapshot } from '../../application';
import { SphereSelect } from '../components/SphereReference';

interface DecisionCreationFormProps {
  readonly currentDate: DayDate;
  readonly form: DecisionCreationFormState;
  readonly errors: DecisionCreationFormErrors;
  readonly isSaving: boolean;
  readonly spheres?: SpheresSnapshot;
  readonly projects?: readonly Project[];
  readonly lockedProjectId?: string;
  readonly onChange: (form: DecisionCreationFormState) => void;
  readonly onClose: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function DecisionCreationDialog(props: DecisionCreationFormProps) {
  return (
    <div className="management-dialog-backdrop" role="presentation">
      <div
        className="management-dialog premium-form-dialog decision-form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-decision-form-title"
      >
        <button
          className="management-dialog-close"
          type="button"
          aria-label="Закрыть форму решения"
          disabled={props.isSaving}
          onClick={props.onClose}
        >
          ×
        </button>
        <DecisionCreationForm {...props} />
      </div>
    </div>
  );
}

export function DecisionCreationForm({
  currentDate,
  form,
  errors,
  isSaving,
  spheres = { active: [], archived: [] },
  projects = [],
  lockedProjectId,
  onChange,
  onClose,
  onSubmit,
}: DecisionCreationFormProps) {
  const isMain = form.kind === DECISION_KIND.main;

  return (
    <section
      className="decision-form-panel section-decision-create decision-creation-panel premium-form-content"
      aria-labelledby="section-decision-form-title"
    >
      <div className="section-heading decision-creation-heading premium-form-heading">
        <div>
          <p className="section-kicker premium-form-eyebrow">Новое решение</p>
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

      <form
        className="decision-form decision-creation-form premium-form-grid"
        onSubmit={onSubmit}
        noValidate
      >
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
          <VoiceTextInput
            id="decision-title"
            value={form.title}
            disabled={isSaving}
            maxLength={200}
            autoComplete="off"
            aria-required="true"
            aria-invalid={errors.title !== null}
            aria-describedby={errorId('decision-title', errors.title)}
            placeholder="Например: выпустить проверяемую версию LifeOS"
            onValueChange={(value) => onChange({ ...form, title: value })}
          />
        </DecisionField>

        <DecisionField label="Причина" error={errors.reason} fieldId="decision-reason">
          <VoiceTextArea
            id="decision-reason"
            value={form.reason}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            aria-invalid={errors.reason !== null}
            aria-describedby={errorId('decision-reason', errors.reason)}
            placeholder="Почему это решение важно именно сейчас?"
            onValueChange={(value) => onChange({ ...form, reason: value })}
          />
        </DecisionField>

        <DecisionField
          label={`Ожидаемый результат${isMain ? ' *' : ''}`}
          error={errors.expectedResult}
          fieldId="decision-expected-result"
        >
          <VoiceTextArea
            id="decision-expected-result"
            value={form.expectedResult}
            disabled={isSaving}
            maxLength={1000}
            rows={3}
            aria-required={isMain}
            aria-invalid={errors.expectedResult !== null}
            aria-describedby={errorId('decision-expected-result', errors.expectedResult)}
            placeholder="Какой наблюдаемый итог подтвердит, что решение реализовано?"
            onValueChange={(value) => onChange({ ...form, expectedResult: value })}
          />
        </DecisionField>

        <DecisionField label="Сфера" error={errors.sphereId} fieldId="decision-sphere">
          <SphereSelect
            id="decision-sphere"
            value={form.sphereId || null}
            snapshot={spheres}
            disabled={isSaving}
            onChange={(sphereId) => onChange({ ...form, sphereId: sphereId ?? '' })}
          />
        </DecisionField>

        <DecisionField label="Цель" error={errors.projectId} fieldId="decision-project">
          <select
            id="decision-project"
            value={form.projectId}
            disabled={isSaving || lockedProjectId !== undefined}
            aria-invalid={errors.projectId !== null}
            aria-describedby={errorId('decision-project', errors.projectId)}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const projectId = event.target.value;
              const project = projects.find((item) => item.id.toString() === projectId);
              onChange({
                ...form,
                projectId,
                sphereId:
                  form.sphereId === '' && project?.sphereId !== null
                    ? (project?.sphereId?.toString() ?? '')
                    : form.sphereId,
              });
            }}
          >
            <option value="">Без цели</option>
            {projects
              .filter((project) => project.status !== 'completed' && project.status !== 'archived')
              .map((project) => (
                <option key={project.id.toString()} value={project.id.toString()}>
                  {project.title}
                </option>
              ))}
          </select>
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

        <DecisionField label="Цена решения" error={errors.price} fieldId="decision-price">
          <VoiceTextArea
            id="decision-price"
            value={form.price}
            disabled={isSaving}
            maxLength={500}
            rows={2}
            aria-invalid={errors.price !== null}
            aria-describedby={errorId('decision-price', errors.price)}
            placeholder="Время, деньги, внимание или другой ресурс"
            onValueChange={(value) => onChange({ ...form, price: value })}
          />
        </DecisionField>

        <DecisionField label="Жертвы" error={errors.sacrifices} fieldId="decision-sacrifices">
          <VoiceTextArea
            id="decision-sacrifices"
            value={form.sacrifices}
            disabled={isSaving}
            maxLength={1000}
            rows={2}
            aria-invalid={errors.sacrifices !== null}
            aria-describedby={errorId('decision-sacrifices', errors.sacrifices)}
            placeholder="От чего придётся отказаться или что отложить?"
            onValueChange={(value) => onChange({ ...form, sacrifices: value })}
          />
        </DecisionField>

        <DecisionField
          label="Связь с целью"
          error={errors.projectReference}
          fieldId="decision-project-reference"
          wide
        >
          <VoiceTextInput
            id="decision-project-reference"
            value={form.projectReference}
            disabled={isSaving}
            maxLength={200}
            aria-invalid={errors.projectReference !== null}
            aria-describedby={errorId('decision-project-reference', errors.projectReference)}
            placeholder="Название или ссылка на цель (необязательно)"
            onValueChange={(value) => onChange({ ...form, projectReference: value })}
          />
        </DecisionField>

        {errors.form === null ? null : (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}

        <div className="form-actions decision-creation-actions premium-form-actions">
          <button className="primary-button" type="submit" aria-busy={isSaving} disabled={isSaving}>
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
    <VoiceField
      className={wide ? 'decision-form-field decision-form-field-wide' : 'decision-form-field'}
    >
      <span>{label}</span>
      {children}
      {error === null ? null : (
        <small className="field-error" id={`${fieldId}-error`}>
          {error}
        </small>
      )}
    </VoiceField>
  );
}

function errorId(fieldId: string, error: string | null): string | undefined {
  return error === null ? undefined : `${fieldId}-error`;
}
