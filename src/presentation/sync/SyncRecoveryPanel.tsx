import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RecoveryHistoryItem,
  RecoverySnapshot,
  RestorePreview,
  SyncRecovery,
} from '../../application/sync/recovery/SyncRecovery';
import type { DurableAttachment } from '../../application/sync/attachments/AttachmentContracts';
import { useSyncContentChanged } from './SyncStatusContext';

export function SyncRecoveryPanel({ recovery }: { readonly recovery: SyncRecovery }) {
  const [files, setFiles] = useState<readonly DurableAttachment[]>([]);
  const [conflicts, setConflicts] = useState<readonly RecoveryHistoryItem[]>([]);
  const [deleted, setDeleted] = useState<readonly RecoveryHistoryItem[]>([]);
  const [snapshots, setSnapshots] = useState<readonly RecoverySnapshot[]>([]);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [inspection, setInspection] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<{ kind: 'conflicts' | 'deleted'; id: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadQueue = useRef<{ running: Promise<void> | null; dirty: boolean }>({
    running: null,
    dirty: false,
  });
  const load = useCallback(async () => {
    const queue = loadQueue.current;
    queue.dirty = true;
    if (queue.running) return queue.running;
    queue.running = (async () => {
      do {
        queue.dirty = false;
        const [f, c, d, s] = await Promise.all([
          recovery.listAttachments(),
          recovery.listHistory('conflicts'),
          recovery.listHistory('deleted'),
          recovery.listSnapshots(),
        ]);
        if (!queue.dirty) {
          setFiles(f);
          setConflicts(c);
          setDeleted(d);
          setSnapshots(s);
          setLoaded(true);
        }
      } while (queue.dirty);
    })().finally(() => {
      queue.running = null;
    });
    return queue.running;
  }, [recovery]);
  const refresh = useCallback(() => {
    void load().catch(() => setError('Не удалось обновить историю. Повторите обновление.'));
  }, [load]);
  useSyncContentChanged(
    'sync_snapshot_meta|sync_attachment_queue|sync_conflicts|sync_object_meta',
    refresh,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => setError('Не удалось загрузить историю. Повторите обновление.'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
    } catch {
      setError('Не удалось завершить действие. Данные сохранены; обновите список и повторите.');
    } finally {
      setBusy(false);
    }
  }
  const failed = files.filter((f) =>
    ['quarantined', 'retry-upload', 'retry-download'].includes(f.state),
  );
  function history(
    title: string,
    kind: 'conflicts' | 'deleted',
    items: readonly RecoveryHistoryItem[],
  ) {
    return (
      <section className="settings-panel">
        <h2>
          {title} <small>({items.length})</small>
        </h2>
        {items.length === 0 ? (
          <p className="sync-explanation">{loaded ? 'История пуста.' : 'Загружаем историю…'}</p>
        ) : (
          <ul className="sync-recovery-list">
            {[...items]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{item.label ?? entityLabel(item.entityType)}</strong> ·{' '}
                    {formatDate(item.createdAt)}
                    {item.expiresAt ? ` · Восстановление до ${formatDate(item.expiresAt)}` : ''}
                    {item.resolvedAt ? ' · Версия уже восстановлена' : ''}
                  </span>
                  <div className="sync-actions">
                    <button
                      className="secondary-button"
                      disabled={busy || !item.recoverable}
                      onClick={() =>
                        void run(async () => {
                          const value = await recovery.inspect(kind, item.id);
                          setInspection(
                            JSON.stringify(
                              value.record,
                              (key, val: unknown) =>
                                ['dataUrl', 'syncSnapshotImage'].includes(key)
                                  ? '[изображение]'
                                  : val,
                              2,
                            ),
                          );
                        })
                      }
                    >
                      Просмотреть
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy || !item.recoverable}
                      onClick={() => setCandidate({ kind, id: item.id })}
                    >
                      Восстановить
                    </button>
                  </div>
                  {!item.recoverable ? (
                    <span>
                      {item.expiresAt && Date.parse(item.expiresAt) <= Date.now()
                        ? 'Срок восстановления истёк'
                        : 'Предыдущая версия недоступна'}
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>
    );
  }
  return (
    <div className="sync-recovery">
      {error ? (
        <p role="alert" className="settings-message error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="settings-message">
          {message}
        </p>
      ) : null}
      <section className="settings-panel">
        <h2>Вложения</h2>
        <p>
          Ожидают отправки:{' '}
          {
            files.filter((f) => ['pending-upload', 'uploading', 'retry-upload'].includes(f.state))
              .length
          }{' '}
          · Ожидают загрузки:{' '}
          {
            files.filter((f) =>
              ['pending-download', 'downloading', 'retry-download'].includes(f.state),
            ).length
          }{' '}
          · Ошибки: {failed.length}
        </p>
        <button className="secondary-button" disabled={busy} onClick={() => void run(load)}>
          Обновить
        </button>
        {failed.map((file) => (
          <button
            key={file.attachmentId}
            className="secondary-button"
            disabled={busy}
            onClick={() => void run(() => recovery.retryAttachment(file.attachmentId))}
          >
            Повторить передачу {file.entityType === 'goal' ? 'обложки' : 'фото'}
          </button>
        ))}
      </section>
      {history('История конфликтов', 'conflicts', conflicts)}
      {history('Недавно удалённые', 'deleted', deleted)}
      {inspection ? (
        <section className="settings-panel">
          <h3>Предыдущая версия</h3>
          <pre className="sync-recovery-inspect">{inspection}</pre>
          <button className="secondary-button" onClick={() => setInspection(null)}>
            Закрыть просмотр
          </button>
        </section>
      ) : null}
      {candidate ? (
        <section
          className="settings-panel"
          role="region"
          aria-label="Подтверждение восстановления версии"
        >
          <p>
            Восстановить предыдущую версию? Сначала будет создан проверенный снимок текущего
            состояния.
          </p>
          <div className="sync-actions">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await recovery.restoreHistory(candidate.kind, candidate.id);
                  setCandidate(null);
                  setMessage('Версия восстановлена. Изменение ожидает синхронизации.');
                })
              }
            >
              Подтвердить восстановление версии
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => setCandidate(null)}>
              Отмена
            </button>
          </div>
        </section>
      ) : null}
      <section className="settings-panel">
        <h2>Резервные снимки</h2>
        <p>Последний проверенный снимок: {latestSnapshot(snapshots)}</p>
        <p>
          Ежедневный: {latestSnapshot(snapshots.filter((s) => s.kind === 'daily'))} · Хранится 30
          дней
        </p>
        <p>
          Еженедельный: {latestSnapshot(snapshots.filter((s) => s.kind === 'weekly'))} · Хранится 12
          недель
        </p>
        <p className="sync-explanation">
          Ежедневные и еженедельные снимки создаются, пока LifeOS открыт. Перед восстановлением
          сохраняется текущее состояние.
        </p>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await recovery.createSnapshot();
              setMessage(
                'Зашифрованный снимок проверен локально. Облачная копия ожидает отправки.',
              );
            })
          }
        >
          Создать снимок сейчас
        </button>
        {snapshots.length === 0 ? (
          <p>{loaded ? 'Проверенных снимков пока нет.' : 'Загружаем снимки…'}</p>
        ) : (
          <ul className="sync-recovery-list">
            {[...snapshots]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((s) => (
                <li key={s.snapshotId}>
                  <span>
                    {formatDate(s.createdAt)} · {kindLabel(s.kind)} ·{' '}
                    {s.cloudVerifiedAt
                      ? 'Проверен в облаке'
                      : s.verifiedAt
                        ? s.retryCount > 0
                          ? 'Проверен локально; отправка повторится автоматически'
                          : 'Проверен локально; облако ожидает'
                        : 'Проверка не завершена'}
                  </span>
                  <button
                    className="secondary-button"
                    disabled={busy || !s.verifiedAt}
                    onClick={() =>
                      void run(async () => setPreview(await recovery.preview(s.snapshotId)))
                    }
                  >
                    Предпросмотр
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
      {preview ? (
        <section className="settings-panel" aria-label="Предпросмотр восстановления">
          <h3>Восстановление от {formatDate(preview.snapshot.createdAt)}</h3>
          <p>
            Добавится: {preview.added} · Изменится: {preview.changed} · Будет удалено:{' '}
            {preview.deleted}
          </p>
          <p>
            Вложения доступны локально: {preview.availableAttachments} из {preview.attachments}.
            Остальные загрузятся отдельно.
          </p>
          <p>
            Версия данных совместима. Записей:{' '}
            {Object.values(preview.entityCounts).reduce((a, b) => a + b, 0)}.
          </p>
          <p>Текущее состояние будет сохранено в проверенном снимке перед восстановлением.</p>
          <div className="sync-actions">
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await recovery.restore(preview);
                  setPreview(null);
                  setMessage('Снимок восстановлен. Изменения ожидают синхронизации.');
                })
              }
            >
              Подтвердить восстановление снимка
            </button>
            <button className="secondary-button" disabled={busy} onClick={() => setPreview(null)}>
              Отмена
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU');
}
function kindLabel(kind: RecoverySnapshot['kind']): string {
  return {
    manual: 'Ручной',
    daily: 'Ежедневный',
    weekly: 'Еженедельный',
    'pre-restore': 'Перед восстановлением',
  }[kind];
}
function latestSnapshot(snapshots: readonly RecoverySnapshot[]): string {
  const snapshot = snapshots
    .filter((s) => s.verifiedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return snapshot ? formatDate(snapshot.createdAt) : 'ещё не создан';
}
function entityLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    goal: 'Цель',
    project: 'Цель',
    direction: 'Направление',
    walk: 'Прогулка',
    day: 'День',
    decision: 'Решение',
    life_action: 'Действие',
    journal_entry: 'Запись дневника',
    user_settings: 'Настройки',
  };
  return labels[type] ?? 'Запись LifeOS';
}
