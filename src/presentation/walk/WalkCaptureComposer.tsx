import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_WALK_CAPTURE_LENGTH } from '../../domain';

export type WalkCaptureSaveResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

interface Props {
  readonly isSaving: boolean;
  readonly onSave: (content: string) => Promise<WalkCaptureSaveResult>;
}

export function WalkCaptureComposer({ isSaving, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      field.current?.focus();
    } else if (wasOpen.current && !isSaving) {
      wasOpen.current = false;
      trigger.current?.focus();
    }
  }, [open, isSaving]);

  function close() {
    if (isSaving || submitting.current) return;
    setOpen(false);
    setDraft('');
    setError(null);
    trigger.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || submitting.current || !draft.trim()) return;
    submitting.current = true;
    setError(null);
    try {
      const result = await onSave(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft('');
      setOpen(false);
      setSaved(true);
      trigger.current?.focus();
    } catch {
      setError('Не удалось сохранить мысль. Текст остался здесь — повторите попытку.');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="walk-capture-composer">
      <button
        ref={trigger}
        className="secondary-button"
        type="button"
        aria-expanded={open}
        disabled={isSaving}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setSaved(false);
          }
        }}
      >
        Сохранить мысль
      </button>
      {open ? (
        <form
          className="walk-capture-form"
          onSubmit={(event) => void submit(event)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
        >
          <label>
            <span>Мысль</span>
            <textarea
              ref={field}
              rows={3}
              maxLength={MAX_WALK_CAPTURE_LENGTH}
              value={draft}
              disabled={isSaving}
              placeholder="Коротко запишите то, что хочется сохранить"
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
          <div className="walk-capture-form-meta">
            <span>Прогулка продолжается в прежнем режиме</span>
            <span>
              {draft.length} / {MAX_WALK_CAPTURE_LENGTH}
            </span>
          </div>
          {error === null ? null : (
            <p className="walk-capture-error" role="alert">
              {error}
            </p>
          )}
          <div className="walk-form-actions">
            <button className="secondary-button" type="button" disabled={isSaving} onClick={close}>
              Отмена
            </button>
            <button className="primary-button" type="submit" disabled={isSaving || !draft.trim()}>
              {isSaving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      ) : null}
      {saved ? (
        <p className="walk-capture-success" role="status">
          Мысль сохранена
        </p>
      ) : null}
    </div>
  );
}
