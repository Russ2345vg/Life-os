import { useCallback } from 'react';
import type { GetPendingWalkCaptures, GetWalkCaptures } from '../../application';
import type { EntityId } from '../../domain';
import { useWalkCaptureQuery } from './useWalkCaptureQuery';

export function WalkCaptureInboxEntry(props: {
  readonly query: Pick<GetPendingWalkCaptures, 'execute'>;
  readonly onOpen: () => void;
}) {
  const load = useCallback(() => props.query.execute(), [props.query]);
  const { state } = useWalkCaptureQuery(load);
  return (
    <div className="walk-capture-entry">
      <button className="secondary-button" type="button" onClick={props.onOpen}>
        Входящие с прогулок ·{' '}
        {state.status === 'ready' ? state.value.length : state.status === 'loading' ? '…' : '—'}
      </button>
      {state.status === 'error' ? (
        <small role="alert">
          Не удалось загрузить счётчик. Откройте входящие, чтобы повторить.
        </small>
      ) : (
        <small>Мысли можно разобрать после прогулки</small>
      )}
    </div>
  );
}

export function WalkCaptureSummary(props: {
  readonly query: Pick<GetWalkCaptures, 'execute'>;
  readonly walkId: EntityId;
  readonly revision?: number;
  readonly onOpen?: () => void;
}) {
  const load = useCallback(() => props.query.execute(props.walkId), [props.query, props.walkId]);
  const { state, reload } = useWalkCaptureQuery(load, props.revision);
  const label = `Сохранённые мысли · ${state.status === 'ready' ? state.value.length : state.status === 'loading' ? '…' : '—'}`;
  return (
    <div className="walk-capture-summary">
      {props.onOpen === undefined ? (
        <span>{label}</span>
      ) : (
        <button className="secondary-button" type="button" onClick={props.onOpen}>
          {label}
        </button>
      )}
      {state.status === 'error' ? (
        <button className="secondary-button" type="button" onClick={reload}>
          Повторить загрузку мыслей
        </button>
      ) : null}
    </div>
  );
}
