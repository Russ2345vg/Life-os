import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { GetWalkCaptureById, ProcessWalkCapture, UpdateWalkCapture } from '../../application';
import { MAX_WALK_CAPTURE_LENGTH, type EntityId } from '../../domain';
import { WalkSubmissionGuard } from './WalkSubmissionGuard';
import { WalkCaptureMetadata } from './WalkCaptureMetadata';
import { useWalkCaptureQuery } from './useWalkCaptureQuery';

export interface WalkCaptureDetailCommands {
  readonly getWalkCaptureById: Pick<GetWalkCaptureById, 'execute'>;
  readonly updateWalkCapture: Pick<UpdateWalkCapture, 'execute'>;
  readonly processWalkCapture: Pick<ProcessWalkCapture, 'execute'>;
}

interface Props extends WalkCaptureDetailCommands {
  readonly captureId: EntityId;
  readonly onBack: () => void;
  readonly onProcessed: () => void;
}

export function WalkCaptureDetails(props: Props) {
  const load = useCallback(
    () => props.getWalkCaptureById.execute(props.captureId),
    [props.getWalkCaptureById, props.captureId],
  );
  const { state, reload } = useWalkCaptureQuery(load);
  const [draft, setDraft] = useState<{ content: string; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const guard = useRef(new WalkSubmissionGuard());
  const heading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: 'start' });
  }, []);
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || !guard.current.tryAcquire()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await props.updateWalkCapture.execute({
        captureId: props.captureId,
        content: draft.content,
        expectedVersion: draft.version,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDraft(null);
      setMessage('Изменения сохранены');
      reload();
      heading.current?.focus();
    } catch {
      setError('Не удалось сохранить изменения. Текст остался в поле.');
    } finally {
      setBusy(false);
      guard.current.release();
    }
  }

  async function process() {
    if (state.status !== 'ready' || state.value === null || !guard.current.tryAcquire()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.processWalkCapture.execute({
        captureId: props.captureId,
        expectedVersion: state.value.capture.version,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      props.onProcessed();
    } catch {
      setError('Не удалось обработать мысль. Повторите попытку.');
    } finally {
      setBusy(false);
      guard.current.release();
    }
  }

  return (
    <section
      className="walk-capture-panel"
      aria-labelledby="walk-capture-details-title"
      data-walk-focus-stage
    >
      <button className="secondary-button" type="button" disabled={busy} onClick={props.onBack}>
        К списку мыслей
      </button>
      <h1 ref={heading} id="walk-capture-details-title" tabIndex={-1}>
        Сохранённая мысль
      </h1>
      {state.status === 'loading' ? (
        <p role="status">Загружаем мысль…</p>
      ) : state.status === 'error' ? (
        <div role="alert">
          <p>Не удалось загрузить мысль.</p>
          <button className="secondary-button" type="button" onClick={reload}>
            Повторить
          </button>
        </div>
      ) : state.value === null ? (
        <p>Мысль не найдена. Вернитесь к списку.</p>
      ) : (
        <>
          <WalkCaptureMetadata item={state.value} />
          {draft === null ? (
            <>
              <p className="walk-capture-text">{state.value.capture.content}</p>
              {state.value.capture.status === 'processed' ? (
                <p className="walk-capture-success">Обработано · сохранено в истории прогулки</p>
              ) : null}
              <div className="walk-form-actions">
                <button
                  ref={editButton}
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft({
                      content: state.value!.capture.content,
                      version: state.value!.capture.version,
                    });
                    setMessage(null);
                    setError(null);
                  }}
                >
                  Редактировать
                </button>
                {state.value.capture.status === 'processed' ? null : (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void process()}
                  >
                    {busy ? 'Сохраняем…' : 'Обработано'}
                  </button>
                )}
              </div>
            </>
          ) : (
            <form className="walk-capture-form" onSubmit={(event) => void save(event)}>
              <label>
                <span>Текст мысли</span>
                <textarea
                  ref={field}
                  rows={5}
                  maxLength={MAX_WALK_CAPTURE_LENGTH}
                  value={draft.content}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, content: event.currentTarget.value })}
                />
              </label>
              <div className="walk-form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                    heading.current?.focus();
                  }}
                >
                  Отмена
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || !draft.content.trim()}
                >
                  {busy ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {error === null ? null : (
        <div className="walk-capture-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setError(null);
              reload();
              heading.current?.focus();
            }}
          >
            {editing ? 'Отменить правку и обновить' : 'Обновить данные'}
          </button>
        </div>
      )}
      {message === null ? null : (
        <p className="walk-capture-success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
