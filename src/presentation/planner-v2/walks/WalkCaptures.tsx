import { useEffect, useState } from 'react';
import type { WalkCapture } from '../../../domain/walk-capture/WalkCapture';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { PlannerRoute } from '../PlannerNavigation';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import { useWalkMutation } from './useWalkState';
export function WalkCaptures({
  captures,
  services,
  onNavigate,
}: {
  captures: readonly WalkCapture[];
  services: WalkServices;
  onNavigate: (route: PlannerRoute) => void;
}) {
  const [filter, setFilter] = useState('pending');
  const visible = captures.filter((capture) => filter === 'all' || capture.status === filter);
  return (
    <section>
      <h2>Сохранённые мысли</h2>
      <label>
        Показать мысли
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="pending">Необработанные</option>
          <option value="processed">Обработанные</option>
          <option value="all">Все</option>
        </select>
      </label>
      {!visible.length && <p>Здесь пока нет мыслей.</p>}
      {visible.map((capture) => (
        <Capture
          key={capture.id.toString()}
          capture={capture}
          services={services}
          onNavigate={onNavigate}
        />
      ))}
    </section>
  );
}
function Capture({
  capture,
  services,
  onNavigate,
}: {
  capture: WalkCapture;
  services: WalkServices;
  onNavigate: (route: PlannerRoute) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(capture.content);
  const [textVersion, setTextVersion] = useState(capture.version);
  const [title, setTitle] = useState(capture.content.slice(0, 200));
  const [titleVersion, setTitleVersion] = useState(capture.version);
  const [parent, setParent] = useState('Проверяем источник…');
  const mutation = useWalkMutation();
  useEffect(() => {
    let alive = true;
    void services.queries
      .get(capture.walkId.toString())
      .then((walk) => {
        if (alive)
          setParent(
            !walk
              ? 'Прогулка недоступна'
              : walk.deletedAt
                ? 'Прогулка удалена'
                : 'Открыть прогулку',
          );
      })
      .catch(() => {
        if (alive) setParent('Источник временно недоступен');
      });
    return () => {
      alive = false;
    };
  }, [capture.walkId, services]);
  return (
    <article className="walk-saved-note">
      <p>{capture.content}</p>
      <small>
        {capture.capturedAt.toLocaleString('ru-RU')} ·{' '}
        {capture.status === 'pending' ? 'Не разобрано' : 'Обработано'}
      </small>
      <div className="walk-start-actions">
        <button onClick={() => onNavigate({ view: 'walks', id: capture.walkId.toString() })}>
          {parent}
        </button>
        <button
          onClick={() => {
            setText(capture.content);
            setTextVersion(capture.version);
            setTitle(capture.content.slice(0, 200));
            setTitleVersion(capture.version);
            setEditing(!editing);
          }}
        >
          Изменить мысль
        </button>
        {capture.resultActionId && (
          <button
            onClick={() => onNavigate({ view: 'action', id: capture.resultActionId!.toString() })}
          >
            Открыть действие
          </button>
        )}
      </div>
      {editing && (
        <form
          className="walk-form"
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.perform(
              `edit:${capture.id}:${textVersion}:${text}`,
              (requestId) =>
                services.captures.update({
                  captureId: capture.id.toString(),
                  expectedVersion: textVersion,
                  requestId,
                  content: text,
                }),
              (updated) => {
                setText(updated.content);
                setTextVersion(updated.version);
                setTitle(updated.content.slice(0, 200));
                setTitleVersion(updated.version);
                setEditing(false);
              },
            );
          }}
        >
          <label htmlFor={`capture-${capture.id}`}>Текст мысли</label>
          <VoiceTextArea
            id={`capture-${capture.id}`}
            value={text}
            onValueChange={setText}
            rows={3}
            maxLength={500}
          />
          <button disabled={mutation.busy || !text.trim()}>Сохранить изменения</button>
          {capture.version > textVersion && (
            <button
              type="button"
              onClick={() => {
                setText(capture.content);
                setTextVersion(capture.version);
              }}
            >
              Загрузить актуальную мысль
            </button>
          )}
        </form>
      )}
      {!capture.resultActionId && (
        <details>
          <summary>Создать действие из мысли</summary>
          <form
            className="walk-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutation.perform(
                `action:${capture.id}:${titleVersion}:${title}`,
                (requestId) =>
                  services.processing.createAction({
                    captureId: capture.id.toString(),
                    expectedVersion: titleVersion,
                    requestId,
                    title,
                  }),
                ({ actionId }) => onNavigate({ view: 'action', id: actionId }),
              );
            }}
          >
            <label>
              Название действия
              <input
                maxLength={200}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <p>Полная мысль сохранится в описании. Будет создан черновик.</p>
            {capture.version > titleVersion && (
              <button
                type="button"
                onClick={() => {
                  setTitle(capture.content.slice(0, 200));
                  setTitleVersion(capture.version);
                }}
              >
                Загрузить актуальный текст мысли
              </button>
            )}
            <button disabled={mutation.busy}>Создать черновик действия</button>
          </form>
        </details>
      )}
      {capture.status === 'pending' && (
        <button
          disabled={mutation.busy}
          onClick={() =>
            void mutation.perform(`processed:${capture.id}:${capture.version}`, (requestId) =>
              services.captures.markProcessed({
                captureId: capture.id.toString(),
                expectedVersion: capture.version,
                requestId,
              }),
            )
          }
        >
          Отметить обработанной
        </button>
      )}
      {mutation.error && <p role="alert">{mutation.error}</p>}
    </article>
  );
}
