import { useSyncExternalStore } from 'react';
import type {
  ApplicationUpdateService,
  ApplicationUpdateState,
} from '../../application/updates/ApplicationUpdateService';
import './application-update.css';

export function ApplicationUpdateNotice({
  service,
}: {
  readonly service: ApplicationUpdateService;
}) {
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  return (
    <ApplicationUpdateNoticeView
      state={state}
      onInstall={() => {
        void service.install();
      }}
      onCheck={() => {
        void service.check();
      }}
      onDismiss={() => service.dismiss()}
    />
  );
}

export function ApplicationUpdateNoticeView({
  state,
  onInstall,
  onCheck,
  onDismiss,
}: {
  readonly state: ApplicationUpdateState;
  readonly onInstall: () => void;
  readonly onCheck: () => void;
  readonly onDismiss: () => void;
}) {
  if (state.status === 'idle' || state.status === 'checking') return null;
  const busy = state.status === 'installing' || state.status === 'installed';
  const title =
    state.status === 'error'
      ? state.operation === 'check'
        ? 'Не удалось проверить обновления'
        : 'Не удалось установить обновление'
      : state.status === 'installing'
        ? 'Обновляем LifeOS'
        : state.status === 'installed'
          ? 'Обновление передано установщику'
          : `Доступна LifeOS ${state.version}`;
  const description =
    state.status === 'error'
      ? 'Можно продолжить работу и повторить позже.'
      : state.status === 'installing'
        ? state.progress === 100
          ? 'Завершаем загрузку и запускаем установку…'
          : `Загружаем обновление${state.progress === null ? '…' : `: ${state.progress}%`}`
        : state.status === 'installed'
          ? 'Дождитесь завершения установки и открытия приложения.'
          : 'Сохраните открытые формы. При установке приложение закроется и откроется снова.';
  return (
    <section className="application-update" aria-label="Обновление LifeOS">
      <div
        className="application-update__copy"
        role={state.status === 'error' ? 'alert' : 'status'}
      >
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="application-update__actions">
        <button
          type="button"
          className="planner-primary"
          disabled={busy}
          onClick={state.status === 'error' && state.operation === 'check' ? onCheck : onInstall}
        >
          {busy ? 'Устанавливаем…' : state.status === 'error' ? 'Повторить' : 'Обновить'}
        </button>
        {!busy && (
          <button type="button" onClick={onDismiss}>
            Позже
          </button>
        )}
      </div>
    </section>
  );
}
