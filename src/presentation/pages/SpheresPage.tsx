import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  ArchiveSphere,
  CreateSphere,
  GetSpheres,
  RestoreSphere,
  SpheresSnapshot,
  UpdateSphere,
} from '../../application';
import {
  MAX_SPHERE_DESCRIPTION_LENGTH,
  MAX_SPHERE_ICON_LENGTH,
  MAX_SPHERE_NAME_LENGTH,
  type Sphere,
} from '../../domain';
import { SectionPageHeader } from '../components/SectionPageHeader';

interface SpheresPageProps {
  readonly createSphere: Pick<CreateSphere, 'execute'>;
  readonly updateSphere: Pick<UpdateSphere, 'execute'>;
  readonly archiveSphere: Pick<ArchiveSphere, 'execute'>;
  readonly restoreSphere: Pick<RestoreSphere, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

type SpheresState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly snapshot: SpheresSnapshot }
  | { readonly status: 'error' };

export interface SphereFormDraft {
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
}

const EMPTY_DRAFT: SphereFormDraft = {
  name: '',
  description: '',
  icon: '',
  color: '#6b78c7',
};

export const SPHERE_MOBILE_BREAKPOINT_PX = 480;

export function SpheresPage(props: SpheresPageProps) {
  const [state, setState] = useState<SpheresState>({ status: 'loading' });
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingSphere, setEditingSphere] = useState<Sphere | null>(null);
  const [draft, setDraft] = useState<SphereFormDraft>(EMPTY_DRAFT);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setState({ status: 'ready', snapshot: await props.getSpheres.execute() });
    } catch {
      setState({ status: 'error' });
    }
  }, [props.getSpheres]);

  useEffect(() => {
    let active = true;
    void props.getSpheres
      .execute()
      .then((snapshot) => {
        if (active) setState({ status: 'ready', snapshot });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [props.getSpheres]);

  function openCreate(): void {
    setEditingSphere(null);
    setDraft(EMPTY_DRAFT);
    setFormMode('create');
    setMessage(null);
    setError(null);
  }

  function openEdit(sphere: Sphere): void {
    setEditingSphere(sphere);
    setDraft({
      name: sphere.name,
      description: sphere.description ?? '',
      icon: sphere.icon ?? '',
      color: sphere.color ?? '#6b78c7',
    });
    setFormMode('edit');
    setMessage(null);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result =
        formMode === 'edit' && editingSphere !== null
          ? await props.updateSphere.execute({
              id: editingSphere.id,
              expectedVersion: editingSphere.version,
              ...draft,
            })
          : await props.createSphere.execute(draft);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFormMode('closed');
      setEditingSphere(null);
      setDraft(EMPTY_DRAFT);
      setMessage(formMode === 'edit' ? 'Сфера обновлена.' : 'Сфера создана.');
      await load();
    } catch {
      setError('Не удалось сохранить сферу. Повторите попытку.');
    } finally {
      setIsSaving(false);
    }
  }

  async function changeArchiveState(sphere: Sphere, restore: boolean): Promise<void> {
    if (busyId !== null) return;
    setBusyId(sphere.id.toString());
    setMessage(null);
    setError(null);
    try {
      const input = { id: sphere.id, expectedVersion: sphere.version };
      const result = restore
        ? await props.restoreSphere.execute(input)
        : await props.archiveSphere.execute(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMessage(restore ? 'Сфера восстановлена.' : 'Сфера перемещена в архив.');
      await load();
    } catch {
      setError('Не удалось изменить состояние сферы. Повторите попытку.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="section-page spheres-page">
      <SectionPageHeader
        eyebrow="Структура LifeOS"
        title="Сферы"
        description="Области жизни, к которым относятся ваши решения и действия."
        action={
          formMode === 'closed' ? (
            <button className="primary-button" type="button" onClick={openCreate}>
              + Создать сферу
            </button>
          ) : null
        }
      />

      {formMode !== 'closed' ? (
        <SphereForm
          mode={formMode}
          draft={draft}
          isSaving={isSaving}
          error={error}
          onChange={setDraft}
          onCancel={() => {
            setFormMode('closed');
            setEditingSphere(null);
            setError(null);
          }}
          onSubmit={save}
        />
      ) : null}

      {message !== null ? <p className="section-page-message">{message}</p> : null}
      {formMode === 'closed' && error !== null ? (
        <p className="section-page-error" role="alert">
          {error}
        </p>
      ) : null}

      {state.status === 'loading' ? <p className="spheres-loading">Загружаем сферы…</p> : null}
      {state.status === 'error' ? (
        <div className="section-page-error" role="alert">
          <p>Не удалось загрузить сферы.</p>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <SphereSections
          snapshot={state.snapshot}
          showArchived={showArchived}
          busyId={busyId}
          onEdit={openEdit}
          onArchive={(sphere) => void changeArchiveState(sphere, false)}
          onRestore={(sphere) => void changeArchiveState(sphere, true)}
          onToggleArchived={() => setShowArchived((current) => !current)}
        />
      ) : null}
    </main>
  );
}

interface SphereFormProps {
  readonly mode: 'create' | 'edit';
  readonly draft: SphereFormDraft;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onChange: (draft: SphereFormDraft) => void;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SphereForm(props: SphereFormProps) {
  return (
    <form className="sphere-form" onSubmit={props.onSubmit}>
      <div className="sphere-form-heading">
        <div>
          <p className="section-page-eyebrow">
            {props.mode === 'create' ? 'Новая сфера' : 'Редактирование'}
          </p>
          <h2>{props.mode === 'create' ? 'Создать сферу' : 'Изменить сферу'}</h2>
        </div>
      </div>
      <label className="sphere-field" htmlFor="sphere-name">
        <span>Название</span>
        <input
          id="sphere-name"
          name="name"
          required
          autoFocus
          maxLength={MAX_SPHERE_NAME_LENGTH}
          value={props.draft.name}
          onChange={(event) => props.onChange({ ...props.draft, name: event.currentTarget.value })}
        />
      </label>
      <label className="sphere-field" htmlFor="sphere-description">
        <span>
          Описание <small>необязательно</small>
        </span>
        <textarea
          id="sphere-description"
          name="description"
          rows={3}
          maxLength={MAX_SPHERE_DESCRIPTION_LENGTH}
          value={props.draft.description}
          onChange={(event) =>
            props.onChange({ ...props.draft, description: event.currentTarget.value })
          }
        />
      </label>
      <div className="sphere-form-visuals">
        <label className="sphere-field" htmlFor="sphere-icon">
          <span>
            Значок <small>необязательно</small>
          </span>
          <input
            id="sphere-icon"
            name="icon"
            maxLength={MAX_SPHERE_ICON_LENGTH}
            placeholder="Например, 🎨"
            value={props.draft.icon}
            onChange={(event) =>
              props.onChange({ ...props.draft, icon: event.currentTarget.value })
            }
          />
        </label>
        <label className="sphere-field sphere-color-field" htmlFor="sphere-color">
          <span>Цвет</span>
          <input
            id="sphere-color"
            name="color"
            type="color"
            value={props.draft.color}
            onChange={(event) =>
              props.onChange({ ...props.draft, color: event.currentTarget.value })
            }
          />
        </label>
      </div>
      {props.error !== null ? (
        <p className="form-error" role="alert">
          {props.error}
        </p>
      ) : null}
      <div className="sphere-form-actions">
        <button className="primary-button" type="submit" disabled={props.isSaving}>
          {props.isSaving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

interface SphereSectionsProps {
  readonly snapshot: SpheresSnapshot;
  readonly showArchived: boolean;
  readonly busyId: string | null;
  readonly onEdit: (sphere: Sphere) => void;
  readonly onArchive: (sphere: Sphere) => void;
  readonly onRestore: (sphere: Sphere) => void;
  readonly onToggleArchived: () => void;
}

export function SphereSections(props: SphereSectionsProps) {
  return (
    <div className="sphere-sections">
      <section className="sphere-section" aria-labelledby="active-spheres-heading">
        <div className="sphere-section-heading">
          <div>
            <p className="section-page-eyebrow">Доступны для выбора</p>
            <h2 id="active-spheres-heading">Активные сферы</h2>
          </div>
          <span>{props.snapshot.active.length}</span>
        </div>
        {props.snapshot.active.length === 0 ? (
          <p className="sphere-empty">Активных сфер пока нет.</p>
        ) : (
          <div className="sphere-grid">
            {props.snapshot.active.map((sphere) => (
              <SphereCard
                key={sphere.id.toString()}
                sphere={sphere}
                busy={props.busyId === sphere.id.toString()}
                onEdit={props.onEdit}
                onArchive={props.onArchive}
              />
            ))}
          </div>
        )}
      </section>

      <section
        className="sphere-section sphere-archive-section"
        aria-labelledby="archived-spheres-heading"
      >
        <div className="sphere-section-heading">
          <div>
            <p className="section-page-eyebrow">Не используются в новых записях</p>
            <h2 id="archived-spheres-heading">Архивные сферы</h2>
          </div>
          <button className="secondary-button" type="button" onClick={props.onToggleArchived}>
            {props.showArchived ? 'Скрыть' : `Показать (${props.snapshot.archived.length})`}
          </button>
        </div>
        {props.showArchived ? (
          props.snapshot.archived.length === 0 ? (
            <p className="sphere-empty">Архив пуст.</p>
          ) : (
            <div className="sphere-grid">
              {props.snapshot.archived.map((sphere) => (
                <SphereCard
                  key={sphere.id.toString()}
                  sphere={sphere}
                  busy={props.busyId === sphere.id.toString()}
                  onRestore={props.onRestore}
                />
              ))}
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}

interface SphereCardProps {
  readonly sphere: Sphere;
  readonly busy: boolean;
  readonly onEdit?: (sphere: Sphere) => void;
  readonly onArchive?: (sphere: Sphere) => void;
  readonly onRestore?: (sphere: Sphere) => void;
}

function SphereCard({ sphere, busy, onEdit, onArchive, onRestore }: SphereCardProps) {
  return (
    <article className="sphere-card">
      <div className="sphere-card-main">
        <span
          className="sphere-card-icon"
          style={{ backgroundColor: sphere.color ?? '#6b78c7' }}
          aria-hidden="true"
        >
          {sphere.icon ?? sphere.name.slice(0, 1).toLocaleUpperCase('ru-RU')}
        </span>
        <div className="sphere-card-copy">
          <h3>{sphere.name}</h3>
          {sphere.description === null ? null : <p>{sphere.description}</p>}
        </div>
      </div>
      <div className="sphere-card-actions">
        {onEdit === undefined ? null : (
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => onEdit(sphere)}
          >
            Редактировать
          </button>
        )}
        {onArchive === undefined ? null : (
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => onArchive(sphere)}
          >
            {busy ? 'Архивируем…' : 'Архивировать'}
          </button>
        )}
        {onRestore === undefined ? null : (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => onRestore(sphere)}
          >
            {busy ? 'Восстанавливаем…' : 'Восстановить'}
          </button>
        )}
      </div>
    </article>
  );
}
