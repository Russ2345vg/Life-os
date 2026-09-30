import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { DayDate } from '../../../domain';
import {
  MAX_MEMORY_PHOTO_BYTES,
  MEMORY_KINDS,
  type MemoryContext,
  type MemoryDraft,
  type MemoryEvent,
  type MemoryKind,
} from '../../../domain/memory';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { useRouteLeaveGuard } from '../../navigation/RouteLeaveGuard';
import { VoiceTextInput } from '../../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import { PlannerSheet } from '../PlannerSheet';
import { useQuickAccessGuard } from '../QuickAccessContext';
import {
  MEMORY_LABELS,
  memoryDraftChanged,
  memoryError,
  type MemoryCatalog,
} from './memoryPresentation';

export function MemoryEditor({
  initialDraft,
  expectedVersion,
  pendingPhoto = false,
  services,
  today,
  catalog,
  onSaved,
  onCancel,
}: {
  readonly initialDraft: MemoryDraft;
  readonly expectedVersion: number | null;
  readonly pendingPhoto?: boolean;
  readonly services: MemoryServices;
  readonly today: string;
  readonly catalog: MemoryCatalog;
  readonly onSaved: (event: MemoryEvent) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [date, setDate] = useState(initialDraft.occurredOn.toString());
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const working = useRef(false);
  const operation = useRef<Promise<void> | null>(null);
  const state = useRef({ dirty: false, busy: false });
  const dirty =
    memoryDraftChanged(draft, initialDraft, removePhoto) ||
    date !== initialDraft.occurredOn.toString();
  const guard = useRouteLeaveGuard();
  useEffect(() => {
    state.current = { dirty, busy };
  }, [dirty, busy]);
  useQuickAccessGuard(() => ({ dirty, busy }));
  useEffect(
    () =>
      guard.register({
        inspect: () => ({ pending: state.current.dirty || working.current, failed: false }),
        flush: async () => {
          if (operation.current) await operation.current;
          if (working.current || state.current.dirty) {
            setDiscard(true);
            throw new Error('Сначала сохраните или закройте редактор.');
          }
        },
      }),
    [guard],
  );
  const close = () => {
    if (working.current) return;
    if (dirty) setDiscard(true);
    else onCancel();
  };
  const change = (next: Partial<MemoryDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  };
  const context = (field: 'sphere' | 'direction' | 'goal', id: string) => {
    const choices =
      catalog[field === 'sphere' ? 'spheres' : field === 'direction' ? 'directions' : 'goals'];
    const empty: MemoryContext = {
      sphereId: null,
      sphereTitle: null,
      directionId: null,
      directionTitle: null,
      goalId: null,
      goalTitle: null,
    };
    const next = {
      ...(draft.context ?? empty),
      [`${field}Id`]: id || null,
      [`${field}Title`]: choices.find((choice) => choice.id === id)?.title ?? null,
    };
    change({ context: next.sphereId || next.directionId || next.goalId ? next : null });
  };
  const photo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      if (file.size > MAX_MEMORY_PHOTO_BYTES)
        throw new Error('Выберите фотографию не больше 5 МБ.');
      const selected = await services.photoReader.read({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type,
      });
      change({ photo: selected });
      setRemovePhoto(false);
    } catch (error: unknown) {
      setError(memoryError(error));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (working.current || !services.commands.enabled) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const saving = (async () => {
      try {
        const saved = await services.commands.save(
          { ...draft, occurredOn: DayDate.create(date) },
          expectedVersion,
          { removePhoto },
        );
        state.current = { dirty: false, busy: false };
        working.current = false;
        onSaved(saved);
      } catch (error: unknown) {
        setError(memoryError(error));
      } finally {
        working.current = false;
        setBusy(false);
        operation.current = null;
      }
    })();
    operation.current = saving;
  };
  const connection = (field: 'sphere' | 'direction' | 'goal', label: string) => {
    const id = draft.context?.[`${field}Id`] ?? '';
    const title = draft.context?.[`${field}Title`];
    const choices =
      catalog[field === 'sphere' ? 'spheres' : field === 'direction' ? 'directions' : 'goals'];
    return (
      <label>
        {label}
        <select value={id} disabled={busy} onChange={(event) => context(field, event.target.value)}>
          <option value="">Без связи</option>
          {id && !choices.some((choice) => choice.id === id) && (
            <option value={id}>{title ?? 'Недоступная связь'} · недоступно</option>
          )}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.title}
            </option>
          ))}
        </select>
      </label>
    );
  };
  return (
    <PlannerSheet
      title={expectedVersion === null ? 'Новое воспоминание' : 'Редактировать воспоминание'}
      onClose={close}
    >
      <div className="memory-editor">
        <h2>{expectedVersion === null ? 'Новое воспоминание' : 'Редактировать воспоминание'}</h2>
        {discard && (
          <div className="planner-error memory-discard" role="alert">
            <p>Есть несохранённые изменения. Закрыть редактор?</p>
            <div className="memory-actions">
              <button type="button" onClick={() => setDiscard(false)}>
                Продолжить редактирование
              </button>
              <button
                type="button"
                className="planner-danger"
                disabled={busy}
                onClick={() => {
                  state.current.dirty = false;
                  onCancel();
                }}
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="planner-error" role="alert">
            {error} Текст остаётся в редакторе.
          </p>
        )}
        <form className="memory-form" onSubmit={save}>
          <label htmlFor="memory-name">Название</label>
          <VoiceTextInput
            id="memory-name"
            value={draft.title}
            onValueChange={(title) => change({ title })}
            maxLength={160}
            required
            disabled={busy}
            placeholder="Что хочется сохранить?"
          />
          <div className="memory-form-row">
            <label>
              Дата события
              <input
                type="date"
                value={date}
                max={
                  expectedVersion !== null &&
                  date === initialDraft.occurredOn.toString() &&
                  date > today
                    ? date
                    : today
                }
                required
                disabled={busy}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              Тип
              <select
                value={draft.kind}
                disabled={busy}
                onChange={(event) => change({ kind: event.target.value as MemoryKind })}
              >
                {MEMORY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {MEMORY_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label htmlFor="memory-story">История</label>
          <VoiceTextArea
            id="memory-story"
            value={draft.body}
            onValueChange={(body) => change({ body })}
            maxLength={10000}
            rows={5}
            disabled={busy}
            placeholder="Что произошло и почему это важно для тебя?"
          />
          {connection('sphere', 'Сфера')}
          <div className="memory-form-row">
            {connection('direction', 'Направление')}
            {connection('goal', 'Цель')}
          </div>
          <div className="memory-photo-editor">
            {draft.photo ? (
              <img className="memory-photo" src={draft.photo.dataUrl} alt="Выбранная фотография" />
            ) : pendingPhoto && !removePhoto ? (
              <p role="status">Фотография ещё загружается. Правка текста сохранит её.</p>
            ) : null}
            <label>
              Фотография
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => void photo(event)}
              />
            </label>
            <small>JPEG, PNG или WebP · до 5 МБ</small>
            {(draft.photo || (pendingPhoto && !removePhoto)) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  change({ photo: null });
                  setRemovePhoto(true);
                }}
              >
                Удалить фотографию
              </button>
            )}
          </div>
          <label className="memory-check">
            <input
              type="checkbox"
              checked={draft.isHighlight}
              disabled={busy}
              onChange={(event) => change({ isHighlight: event.target.checked })}
            />
            Главное событие года
          </label>
          {draft.diarySource && (
            <p className="planner-muted">
              Из дневника · текст воспоминания сохранится независимо от исходной записи.
            </p>
          )}
          <footer className="memory-actions">
            <button type="button" disabled={busy} onClick={close}>
              Отмена
            </button>
            <button
              className="planner-primary"
              type="submit"
              disabled={busy || !services.commands.enabled}
            >
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </footer>
        </form>
      </div>
    </PlannerSheet>
  );
}
