import { useCallback, useEffect, useRef, useState } from 'react';
import type { GetPendingWalkCaptures, GetWalkCaptures } from '../../application';
import type { EntityId } from '../../domain';
import { WalkCaptureDetails, type WalkCaptureDetailCommands } from './WalkCaptureDetails';
import { WalkCaptureMetadata } from './WalkCaptureMetadata';
import { useWalkCaptureQuery } from './useWalkCaptureQuery';

interface Props extends WalkCaptureDetailCommands {
  readonly getPendingWalkCaptures: Pick<GetPendingWalkCaptures, 'execute'>;
  readonly getWalkCaptures: Pick<GetWalkCaptures, 'execute'>;
  readonly walkId: EntityId | null;
  readonly onClose: () => void;
}

export function WalkCaptureInbox(props: Props) {
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(
    () =>
      props.walkId === null
        ? props.getPendingWalkCaptures.execute()
        : props.getWalkCaptures.execute(props.walkId),
    [props.walkId, props.getPendingWalkCaptures, props.getWalkCaptures],
  );
  const { state, reload } = useWalkCaptureQuery(load);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selectedId === null) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start' });
    }
  }, [selectedId]);
  const title = props.walkId === null ? 'Входящие с прогулок' : 'Мысли этой прогулки';
  if (selectedId !== null)
    return (
      <WalkCaptureDetails
        {...props}
        captureId={selectedId}
        onBack={() => {
          setSelectedId(null);
          reload();
        }}
        onProcessed={() => {
          setSelectedId(null);
          setMessage('Мысль обработана и сохранена в истории прогулки');
          reload();
        }}
      />
    );
  return (
    <section
      className="walk-capture-panel"
      aria-labelledby="walk-capture-inbox-title"
      data-walk-focus-stage
    >
      <button className="secondary-button" type="button" onClick={props.onClose}>
        К прогулкам
      </button>
      <div>
        <p className="section-page-eyebrow">Сохранённое на ходу</p>
        <h1 ref={heading} tabIndex={-1} id="walk-capture-inbox-title">
          {title}
        </h1>
        <p className="walk-capture-hint">
          {props.walkId === null
            ? 'Только необработанные мысли. Разберите их, когда будет удобно.'
            : 'Все мысли, включая обработанные. Они остаются здесь после прогулки.'}
        </p>
      </div>
      {message === null ? null : (
        <p role="status" className="walk-capture-success">
          {message}
        </p>
      )}
      {state.status === 'loading' ? (
        <p role="status">Загружаем мысли…</p>
      ) : state.status === 'error' ? (
        <div role="alert">
          <p>Не удалось загрузить мысли. Сохранённые данные не изменены.</p>
          <button className="secondary-button" type="button" onClick={reload}>
            Повторить
          </button>
        </div>
      ) : state.value.length === 0 ? (
        <p className="walk-capture-empty">
          {props.walkId === null
            ? 'Входящие пусты. Мысли появятся здесь после сохранения на прогулке.'
            : 'В этой прогулке ещё нет сохранённых мыслей.'}
        </p>
      ) : (
        <ul className="walk-capture-list">
          {state.value.map((item) => (
            <li className="walk-capture-list-item" key={item.capture.id.toString()}>
              <button
                type="button"
                aria-label={`Открыть мысль: ${item.capture.content}`}
                onClick={() => {
                  setMessage(null);
                  setSelectedId(item.capture.id);
                }}
              >
                <span className="walk-capture-preview">{item.capture.content}</span>
                <WalkCaptureMetadata item={item} />
                {item.capture.status === 'processed' ? (
                  <span className="walk-capture-success">Обработано</span>
                ) : null}
                <span className="walk-capture-open">Открыть →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
