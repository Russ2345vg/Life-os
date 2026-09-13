import { AppIcon } from '../components/AppIcon';
import { useSyncStatus } from './SyncStatusContext';

export function SyncIndicator({ onOpen }: { readonly onOpen: () => void }) {
  const { presentation } = useSyncStatus();
  return (
    <button
      type="button"
      className={`sync-global-indicator sync-tone-${presentation.state}`}
      onClick={onOpen}
      title={presentation.label}
      aria-label={`Синхронизация: ${presentation.label}. Открыть настройки`}
    >
      <AppIcon
        name={
          presentation.state === 'synced'
            ? 'completed'
            : presentation.state === 'syncing'
              ? 'history'
              : 'lock'
        }
      />
      <span>{presentation.shortLabel}</span>
    </button>
  );
}
