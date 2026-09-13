import type { SystemUpdateState } from '../../application/updates/SystemUpdate';

interface SystemUpdatePanelProps {
  readonly state: SystemUpdateState;
  readonly onCheck: () => void;
  readonly onInstall: () => void;
}

export function SystemUpdatePanel({ state, onCheck, onInstall }: SystemUpdatePanelProps) {
  const busy = state.status === 'checking' || state.status === 'downloading';

  return (
    <section className="settings-panel system-update-panel" aria-labelledby="update-heading">
      <div className="settings-panel-heading">
        <div>
          <p className="section-page-eyebrow">Система</p>
          <h2 id="update-heading">LifeOS</h2>
        </div>
        <span>Версия {state.currentVersion}</span>
      </div>

      <UpdateStatus state={state} />

      <div className="settings-actions system-update-actions">
        {state.status === 'available' ? (
          <button className="primary-button" type="button" onClick={onInstall}>
            Установить обновление
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={onCheck} disabled={busy}>
          {state.status === 'checking' ? 'Проверка…' : 'Проверить обновления'}
        </button>
      </div>
    </section>
  );
}

function UpdateStatus({ state }: { readonly state: SystemUpdateState }) {
  if (state.status === 'idle') {
    return (
      <p className="system-update-copy">Обновления устанавливаются только по вашему выбору.</p>
    );
  }
  if (state.status === 'checking') {
    return <p className="settings-message notice">Проверка обновлений…</p>;
  }
  if (state.status === 'current') {
    return <p className="settings-message success">Установлена последняя версия.</p>;
  }
  if (state.status === 'error') {
    return <p className="settings-message error">Ошибка обновления: {state.message}</p>;
  }

  if (
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'installer-opened'
  ) {
    return (
      <div className="system-update-available">
        <p className="settings-message notice">
          {state.status === 'downloading'
            ? `Загрузка${state.progressPercent === null ? '…' : `: ${state.progressPercent}%`}`
            : state.status === 'installer-opened'
              ? 'Системный установщик открыт.'
              : `Доступна версия ${state.availableVersion}`}
        </p>
        {state.notes.trim() !== '' ? <p className="system-update-notes">{state.notes}</p> : null}
      </div>
    );
  }

  return null;
}
