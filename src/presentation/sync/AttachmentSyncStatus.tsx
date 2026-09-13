import { useState } from 'react';
import { useSyncStatus } from './SyncStatusContext';
import { presentAttachment } from './syncStatusPresentation';

export function AttachmentSyncStatus({
  entityType,
  objectId,
  localAvailable,
}: {
  readonly entityType: 'goal' | 'walk';
  readonly objectId: string;
  readonly localAvailable: boolean;
}) {
  const { data, sync } = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const file = data?.attachments.find(
    (a) => a.entityType === entityType && a.parentObjectId === objectId,
  );
  const label = presentAttachment(file, localAvailable);
  if (!label) return null;
  const retry = file && (file.state.startsWith('retry-') || file.state === 'quarantined');
  return (
    <div className="sync-attachment-status" role="status">
      <span>{error ? 'Повтор не выполнен. Откройте настройки синхронизации.' : label}</span>
      {retry && sync?.recovery ? (
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(false);
            void sync
              .recovery!.retryAttachment(file.attachmentId)
              .catch(() => setError(true))
              .finally(() => setBusy(false));
          }}
        >
          Повторить передачу
        </button>
      ) : null}
    </div>
  );
}
