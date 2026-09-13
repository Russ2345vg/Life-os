import type { PilotSyncStatus } from '../../application/sync/pilot/PilotSyncCoordinator';
import type { SyncAttachmentStatus, SyncStatusSnapshot } from '../../application/sync/SyncStatus';

export interface SyncStatusPresentation {
  readonly state: 'local' | 'synced' | 'syncing' | 'pending' | 'offline' | 'attention' | 'error';
  readonly label: string;
  readonly shortLabel: string;
}

export function presentSyncStatus(
  pilot: PilotSyncStatus,
  data: SyncStatusSnapshot | null,
  online: boolean,
): SyncStatusPresentation {
  const value = (state: SyncStatusPresentation['state'], label: string, shortLabel = label) => ({
    state,
    label,
    shortLabel,
  });
  if (data?.setupIssue === 'rotation-pending')
    return value('attention', 'Завершите обновление защиты устройств', 'Обновление защиты');
  if (data?.setupIssue === 'revoked')
    return value('attention', 'Доступ устройства отозван', 'Доступ отозван');
  if (data?.setupIssue === 'pending')
    return value('pending', 'Подтвердите подключение устройства', 'Ожидает подключения');
  if (!data?.configured) return value('local', 'Синхронизация не настроена', 'Локально');
  if (!online) return value('offline', 'Нет сети — изменения сохранены локально', 'Нет сети');
  if (data.quarantined || data.attachments.some((a) => a.state === 'quarantined'))
    return value('error', 'Защищённые данные не прошли проверку', 'Ошибка проверки');
  if (pilot.state === 'syncing') return value('syncing', 'Синхронизация…');
  if (pilot.state === 'offline' || pilot.state === 'error')
    return value('error', 'Ошибка синхронизации', 'Ошибка связи');
  if (data.failedBackups || data.attachments.some((a) => a.state.startsWith('retry-')))
    return value('attention', 'Передача ожидает повтора', 'Ожидает повтора');
  if (data.pending)
    return value(
      'pending',
      `${data.pending} изменений ожидают отправки`,
      `Ожидают: ${data.pending}`,
    );
  if (data.attachments.some((a) => ['uploading', 'downloading'].includes(a.state)))
    return value('syncing', 'Передаём вложения…');
  if (
    data.deferred ||
    data.pendingBackups ||
    data.attachments.some((a) => a.state.startsWith('pending-'))
  )
    return value('pending', 'Вложения или резервные копии ожидают передачи', 'Ожидает передачи');
  // Retained conflict versions are history, not a failed transport or lost current version.
  if (!pilot.lastSuccessfulSyncAt)
    return value('pending', 'Проверяем синхронизацию…', 'Проверяем…');
  return value('synced', 'Синхронизировано');
}

export function presentAttachment(
  file: SyncAttachmentStatus | undefined,
  localAvailable: boolean,
): string | null {
  if (!file) return localAvailable ? 'Сохранено на устройстве' : null;
  return {
    'pending-upload': 'Сохранено локально · ожидает отправки',
    uploading: 'Обложка / фото отправляется…',
    'retry-upload': 'Сохранено локально · отправка не завершена',
    uploaded: 'Вложение синхронизировано',
    'pending-download': 'Вложение сохранено · ожидает загрузки',
    downloading: 'Загружаем вложение…',
    'retry-download': 'Вложение сохранено · загрузку нужно повторить',
    'available-local': 'Вложение доступно',
    quarantined: 'Вложение не прошло проверку',
    tombstoned: '',
  }[file.state];
}
