import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type {
  SyncApplication,
  SyncOverview,
  SyncPairingInvitation,
} from '../../application/sync/SyncApplicationService';
import type { CachedSyncDevice } from '../../application/sync/ports/SyncDeviceCacheRepository';
import type { PilotSyncStatus } from '../../application/sync/pilot/PilotSyncCoordinator';
import { SectionPageHeader } from '../components/SectionPageHeader';
import { SyncRecoveryPanel } from './SyncRecoveryPanel';
import { useSyncStatus } from './SyncStatusContext';

interface SyncPageProps {
  readonly sync: SyncApplication;
  readonly onBack: () => void;
}

type EntryMode = 'none' | 'pairing' | 'recovery';

export function SyncPage({ sync, onBack }: SyncPageProps) {
  const live = useSyncStatus();
  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryMaterial, setRecoveryMaterial] = useState<string | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [invitation, setInvitation] = useState<SyncPairingInvitation | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [entryMode, setEntryMode] = useState<EntryMode>('none');
  const [entryValue, setEntryValue] = useState('');
  const [revokeCandidate, setRevokeCandidate] = useState<string | null>(null);
  const [deviceNameDraft, setDeviceNameDraft] = useState<string | null>(null);
  const [pilotStatus, setPilotStatus] = useState<PilotSyncStatus>(() => sync.pilotStatus());

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await sync.loadOverview();
      setOverview(result);
      if (result.installation.setupState === 'recovery_unconfirmed') {
        setRecoveryMaterial(await sync.exportRecoveryMaterial());
      }
    } catch (cause: unknown) {
      setError(publicMessage(cause));
    }
  }, [sync]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => sync.subscribePilotStatus(setPilotStatus), [sync]);

  useEffect(() => {
    if (invitation === null) return;
    const update = () => {
      const next = Math.max(0, Math.ceil((Date.parse(invitation.expiresAt) - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next === 0) setInvitation(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [invitation]);

  async function run(operation: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause: unknown) {
      setError(publicMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (overview === null) {
    return (
      <SyncFrame onBack={onBack}>
        <section className="settings-panel sync-state-panel" aria-live="polite">
          <p className="sync-loading">{error ?? 'Проверяем защищённое состояние устройства…'}</p>
          {error !== null ? (
            <button className="secondary-button" type="button" onClick={() => void load()}>
              Повторить
            </button>
          ) : null}
        </section>
      </SyncFrame>
    );
  }

  const installation = overview.installation;
  const notConfigured = installation.spaceId === null;
  const visibleDeviceName = deviceNameDraft ?? installation.deviceName;

  return (
    <SyncFrame onBack={onBack}>
      {error !== null ? (
        <p className="settings-message error" role="alert">
          {error}
        </p>
      ) : null}
      {overview.warning !== null ? (
        <p className="settings-message notice" role="status">
          {overview.warning}
        </p>
      ) : null}

      {notConfigured ? (
        <section className="settings-panel sync-state-panel" aria-labelledby="sync-start-heading">
          <div className="settings-panel-heading">
            <div>
              <p className="section-page-eyebrow">Не настроено</p>
              <h2 id="sync-start-heading">Защищённое пространство LifeOS</h2>
            </div>
            <span>Локальные данные не отправляются</span>
          </div>
          <p className="sync-explanation">
            Создайте пространство на первом устройстве, подключитесь по одноразовому коду или
            восстановите доступ. Цели, дневник и другие записи пока остаются только здесь.
          </p>
          {entryMode === 'none' ? (
            <div className="settings-actions sync-start-actions">
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await sync.setupFirstSpace();
                    setOverview(result.overview);
                    setRecoveryMaterial(result.recoveryMaterial);
                  })
                }
              >
                Создать защищённое пространство
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => setEntryMode('pairing')}
              >
                Подключить это устройство
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => setEntryMode('recovery')}
              >
                Восстановить доступ
              </button>
            </div>
          ) : (
            <EntryPanel
              mode={entryMode}
              value={entryValue}
              busy={busy}
              onValueChange={setEntryValue}
              onError={setError}
              onCancel={() => {
                setEntryMode('none');
                setEntryValue('');
              }}
              onSubmit={() =>
                void run(async () => {
                  const result =
                    entryMode === 'pairing'
                      ? await sync.claimPairingPayload(entryValue)
                      : await sync.recover(entryValue);
                  setOverview(result);
                  setEntryMode('none');
                  setEntryValue('');
                })
              }
            />
          )}
        </section>
      ) : null}

      {installation.setupState === 'recovery_unconfirmed' && recoveryMaterial !== null ? (
        <RecoveryExport
          material={recoveryMaterial}
          confirmed={recoverySaved}
          busy={busy}
          onConfirmedChange={setRecoverySaved}
          onComplete={() => void run(async () => setOverview(await sync.confirmRecoverySaved()))}
        />
      ) : null}

      {installation.membershipStatus === 'pending' ? (
        <section className="settings-panel sync-state-panel" aria-labelledby="sync-pending-heading">
          <p className="section-page-eyebrow">Ожидание доверенного устройства</p>
          <h2 id="sync-pending-heading">Подтвердите подключение</h2>
          <p>
            На доверенном устройстве нажмите «Проверить новые устройства», затем завершите
            подключение здесь. Данные с обоих устройств будут объединены; перед этим сохраняется
            резервный снимок.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (await sync.completePendingPairing()) await load();
              })
            }
          >
            Завершить подключение
          </button>
        </section>
      ) : null}

      {installation.setupState === 'rotation_pending' ? (
        <RotationPendingPanel
          busy={busy}
          onRetry={() =>
            void run(async () => {
              setOverview(await sync.retryPendingRotation());
            })
          }
        />
      ) : null}

      {installation.setupState === 'configured' ? (
        <>
          <PilotSyncPanel
            status={{
              ...pilotStatus,
              pendingCount: live.data?.pending ?? pilotStatus.pendingCount,
              conflictCount: live.data?.conflicts ?? pilotStatus.conflictCount,
            }}
            presentation={live.sync === sync ? live.presentation : undefined}
            disabled={busy || !live.online}
            onSync={() =>
              void run(async () => {
                await sync.syncPilotNow();
                await load();
              })
            }
          />
          <section
            className="settings-panel sync-trust-summary"
            aria-labelledby="sync-ready-heading"
          >
            <div>
              <p className="section-page-eyebrow">Защита</p>
              <h2 id="sync-ready-heading">Сквозное шифрование включено</h2>
              <p>Записи, фото и резервные снимки шифруются на вашем устройстве.</p>
              <p>
                {installation.recoveryConfirmedAt
                  ? 'Сохранение ключа восстановления подтверждено.'
                  : 'Сохраните ключ восстановления отдельно от устройств.'}
              </p>
              <small>Версия ключа: {installation.currentKeyEpoch}</small>
            </div>
            <span
              className={`section-status ${overview.connection === 'online' ? 'section-status-active' : 'section-status-muted'}`}
            >
              {overview.connection === 'online' ? 'Защищено' : 'Офлайн'}
            </span>
          </section>

          {overview.connection === 'offline' && installation.platform === 'android' ? (
            <ReconnectRecoveryPanel
              busy={busy}
              open={entryMode === 'recovery'}
              value={entryValue}
              onOpen={() => setEntryMode('recovery')}
              onValueChange={setEntryValue}
              onCancel={() => {
                setEntryMode('none');
                setEntryValue('');
              }}
              onSubmit={() =>
                void run(async () => {
                  setOverview(await sync.recover(entryValue));
                  setEntryMode('none');
                  setEntryValue('');
                })
              }
            />
          ) : null}

          <div className="settings-actions sync-toolbar">
            <button
              className="secondary-button"
              type="button"
              disabled={busy || invitation !== null || overview.connection !== 'online'}
              onClick={() =>
                void run(async () => setInvitation(await sync.createPairingInvitation()))
              }
            >
              Подключить устройство
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await sync.fulfillPendingPairings();
                  await load();
                })
              }
            >
              Проверить новые устройства
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => setRecoveryMaterial(await sync.exportRecoveryMaterial()))
              }
            >
              Показать ключ восстановления
            </button>
          </div>

          <section
            className="settings-panel sync-device-name-panel"
            aria-labelledby="sync-device-name-heading"
          >
            <div>
              <p className="section-page-eyebrow">Это устройство</p>
              <h2 id="sync-device-name-heading">Имя устройства</h2>
            </div>
            <VoiceField className="settings-field">
              <span>Видно только вашим доверенным устройствам в зашифрованном виде</span>
              <VoiceTextInput
                value={visibleDeviceName}
                maxLength={64}
                autoComplete="off"
                onValueChange={(value) => setDeviceNameDraft(value)}
              />
            </VoiceField>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || visibleDeviceName.trim() === installation.deviceName}
              onClick={() =>
                void run(async () => {
                  setOverview(await sync.updateDeviceName(visibleDeviceName));
                  setDeviceNameDraft(null);
                })
              }
            >
              Сохранить имя
            </button>
          </section>

          {invitation !== null ? (
            <PairingInvitationPanel
              invitation={invitation}
              remainingSeconds={remainingSeconds}
              busy={busy}
              onCancel={() =>
                void run(async () => {
                  await sync.cancelPairingInvitation(invitation.inviteId);
                  setInvitation(null);
                })
              }
            />
          ) : null}

          {recoveryMaterial !== null ? (
            <RecoveryCopyPanel
              material={recoveryMaterial}
              onClose={() => setRecoveryMaterial(null)}
            />
          ) : null}

          <DeviceList
            devices={overview.devices}
            currentDeviceId={installation.deviceId}
            revokeCandidate={revokeCandidate}
            busy={busy}
            onAskRevoke={setRevokeCandidate}
            onCancelRevoke={() => setRevokeCandidate(null)}
            onRevoke={(deviceId) =>
              void run(async () => {
                setOverview(await sync.revokeDevice(deviceId));
                setRevokeCandidate(null);
              })
            }
          />
        </>
      ) : null}
      {installation.setupState === 'configured' && sync.recovery ? (
        <SyncRecoveryPanel recovery={sync.recovery} />
      ) : null}
      {live.data?.configured ? (
        <details className="settings-panel sync-diagnostics">
          <summary>Диагностика синхронизации</summary>
          <p>Позиция получения: {live.data.cursor ?? 'ещё не получена'}</p>
          <p>Ожидают связанные записи: {live.data.deferred}</p>
          <p>Записи, не прошедшие проверку: {live.data.quarantined}</p>
          <p>Резервные копии ожидают отправки: {live.data.pendingBackups}</p>
          <p>
            LifeOS обменивается изменениями, пока открыт. После возвращения получает пропущенное с
            сохранённой позиции.
          </p>
        </details>
      ) : null}
    </SyncFrame>
  );
}

export function PilotSyncPanel(props: {
  readonly status: PilotSyncStatus;
  readonly disabled: boolean;
  readonly onSync: () => void;
  readonly presentation?: import('./syncStatusPresentation').SyncStatusPresentation | undefined;
}) {
  const { status } = props;
  return (
    <section className="settings-panel sync-pilot-panel" aria-labelledby="sync-pilot-heading">
      <div className="settings-panel-heading">
        <div>
          <p className="section-page-eyebrow">Состояние</p>
          <h2 id="sync-pilot-heading">Синхронизация LifeOS</h2>
        </div>
        <span
          className={`section-status ${props.presentation ? `sync-tone-${props.presentation.state}` : pilotStatusClass(status.state)}`}
          aria-live="polite"
        >
          {props.presentation?.label ?? pilotStatusLabel(status)}
        </span>
      </div>
      <p>
        Направления, цели, дневник, распорядок и прогулки сохраняются локально и передаются в
        зашифрованном виде. Фото загружаются отдельно.
      </p>
      <div className="sync-pilot-metrics">
        <span>Ожидают отправки: {status.pendingCount}</span>
        <span>Сохранённые конфликтные версии: {status.conflictCount}</span>
        <span>
          Последняя успешная синхронизация:{' '}
          {status.lastSuccessfulSyncAt === null
            ? 'ещё не выполнялась'
            : formatDate(status.lastSuccessfulSyncAt)}
        </span>
      </div>
      <button
        className="primary-button"
        type="button"
        disabled={props.disabled || status.state === 'syncing'}
        onClick={props.onSync}
      >
        Синхронизировать сейчас
      </button>
    </section>
  );
}

export function ReconnectRecoveryPanel(props: {
  readonly busy: boolean;
  readonly open: boolean;
  readonly value: string;
  readonly onOpen: () => void;
  readonly onValueChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  return (
    <section
      className="settings-panel sync-state-panel pending"
      aria-labelledby="sync-reconnect-heading"
    >
      <p className="section-page-eyebrow">Восстановление соединения</p>
      <h2 id="sync-reconnect-heading">Повторно подключить устройство</h2>
      <p>
        Используйте ключ восстановления, если устройство было отозвано. Локальные данные LifeOS
        останутся на устройстве; будет заменена только техническая Sync-идентификация.
      </p>
      {props.open ? (
        <EntryPanel
          mode="recovery"
          value={props.value}
          busy={props.busy}
          onValueChange={props.onValueChange}
          onError={() => undefined}
          onCancel={props.onCancel}
          onSubmit={props.onSubmit}
        />
      ) : (
        <button
          className="primary-button"
          type="button"
          disabled={props.busy}
          onClick={props.onOpen}
        >
          Повторно подключить устройство
        </button>
      )}
    </section>
  );
}

export function RotationPendingPanel(props: {
  readonly busy: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <section
      className="settings-panel sync-state-panel pending"
      aria-labelledby="sync-rotation-heading"
    >
      <p className="section-page-eyebrow">Требуется завершение</p>
      <h2 id="sync-rotation-heading">Ротация ключа не завершена</h2>
      <p>
        Отозванное устройство уже заблокировано. Завершите обновление защиты остальных устройств.
      </p>
      <button
        className="primary-button"
        type="button"
        disabled={props.busy}
        onClick={() => props.onRetry()}
      >
        Повторить ротацию
      </button>
    </section>
  );
}

function SyncFrame({
  onBack,
  children,
}: {
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  return (
    <main className="section-page sync-page">
      <button className="back-link-button" type="button" onClick={onBack}>
        ← Вернуться в «Ещё»
      </button>
      <SectionPageHeader
        eyebrow="Настройки"
        title="Синхронизация"
        description="Устройства, сквозное шифрование и восстановление доступа."
      />
      {children}
    </main>
  );
}

function RecoveryExport(props: {
  readonly material: string;
  readonly confirmed: boolean;
  readonly busy: boolean;
  readonly onConfirmedChange: (value: boolean) => void;
  readonly onComplete: () => void;
}) {
  return (
    <section className="settings-panel sync-recovery-panel" aria-labelledby="sync-recovery-heading">
      <p className="section-page-eyebrow">Обязательный шаг</p>
      <h2 id="sync-recovery-heading">Сохраните ключ восстановления</h2>
      <p>Без него после потери всех устройств восстановить доступ невозможно.</p>
      <code className="sync-recovery-code">{props.material}</code>
      <div className="settings-actions">
        <CopyButton value={props.material} label="Копировать ключ" />
        <button
          className="secondary-button"
          type="button"
          onClick={() => downloadRecovery(props.material)}
        >
          Скачать файл
        </button>
      </div>
      <label className="settings-toggle sync-recovery-confirm">
        <input
          type="checkbox"
          checked={props.confirmed}
          onChange={(event) => props.onConfirmedChange(event.target.checked)}
        />
        <span>Я сохранил ключ восстановления</span>
      </label>
      <button
        className="primary-button"
        type="button"
        disabled={!props.confirmed || props.busy}
        onClick={props.onComplete}
      >
        Завершить настройку
      </button>
    </section>
  );
}

function RecoveryCopyPanel({
  material,
  onClose,
}: {
  readonly material: string;
  readonly onClose: () => void;
}) {
  return (
    <section
      className="settings-panel sync-recovery-panel"
      aria-label="Экспорт ключа восстановления"
    >
      <h2>Ключ восстановления</h2>
      <code className="sync-recovery-code">{material}</code>
      <div className="settings-actions">
        <CopyButton value={material} label="Копировать" />
        <button
          className="secondary-button"
          type="button"
          onClick={() => downloadRecovery(material)}
        >
          Скачать файл
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>
          Скрыть
        </button>
      </div>
    </section>
  );
}

function PairingInvitationPanel(props: {
  readonly invitation: SyncPairingInvitation;
  readonly remainingSeconds: number;
  readonly busy: boolean;
  readonly onCancel: () => void;
}) {
  return (
    <section className="settings-panel sync-pairing-panel" aria-labelledby="sync-pairing-heading">
      <div>
        <p className="section-page-eyebrow">Одноразовое приглашение</p>
        <h2 id="sync-pairing-heading">Сканируйте QR на новом устройстве</h2>
        <p>
          Код истечёт через {formatCountdown(props.remainingSeconds)} и не содержит постоянных
          ключей LifeOS.
        </p>
      </div>
      <img
        className="sync-qr"
        src={svgDataUrl(props.invitation.qrSvg)}
        alt="Одноразовый QR-код подключения устройства"
      />
      <details>
        <summary>Ручной код</summary>
        <code className="sync-pairing-code">{props.invitation.payload}</code>
        <CopyButton value={props.invitation.payload} label="Копировать ручной код" />
      </details>
      <button
        className="secondary-button"
        type="button"
        disabled={props.busy}
        onClick={props.onCancel}
      >
        Отменить приглашение
      </button>
    </section>
  );
}

function EntryPanel(props: {
  readonly mode: Exclude<EntryMode, 'none'>;
  readonly value: string;
  readonly busy: boolean;
  readonly onValueChange: (value: string) => void;
  readonly onError: (message: string) => void;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}) {
  const pairing = props.mode === 'pairing';
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useQrCamera(videoRef, props.onValueChange, props.onError);
  return (
    <div className="sync-entry-panel">
      <h3>{pairing ? 'Подключение по приглашению' : 'Восстановление доступа'}</h3>
      {pairing ? (
        <>
          <button
            className="secondary-button"
            type="button"
            disabled={props.busy || camera.active}
            onClick={() => void camera.start()}
          >
            {camera.active ? 'Камера включена…' : 'Сканировать QR'}
          </button>
          <video
            ref={videoRef}
            className={camera.active ? 'sync-camera active' : 'sync-camera'}
            muted
            playsInline
            aria-label="Камера для сканирования QR"
          />
        </>
      ) : null}
      <label className="settings-field">
        <span>
          {pairing ? 'Или вставьте ручной код' : 'Ключ или содержимое файла восстановления'}
        </span>
        <textarea
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          rows={5}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {!pairing ? (
        <label className="settings-field">
          <span>Открыть файл восстановления</span>
          <input
            type="file"
            accept="text/plain,.txt"
            disabled={props.busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 8192) {
                props.onError('Файл восстановления слишком большой. Выберите файл ключа LifeOS.');
                return;
              }
              void file
                .text()
                .then(props.onValueChange)
                .catch(() => props.onError('Не удалось прочитать файл восстановления.'));
            }}
          />
        </label>
      ) : null}
      <div className="settings-actions">
        <button
          className="primary-button"
          type="button"
          disabled={props.busy || props.value.trim().length === 0}
          onClick={props.onSubmit}
        >
          {pairing ? 'Принять приглашение' : 'Восстановить'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={props.busy}
          onClick={() => {
            camera.stop();
            props.onCancel();
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function DeviceList(props: {
  readonly devices: readonly CachedSyncDevice[];
  readonly currentDeviceId: string;
  readonly revokeCandidate: string | null;
  readonly busy: boolean;
  readonly onAskRevoke: (deviceId: string) => void;
  readonly onCancelRevoke: () => void;
  readonly onRevoke: (deviceId: string) => void;
}) {
  return (
    <section
      className="section-entity-list sync-device-list"
      aria-labelledby="sync-devices-heading"
    >
      <div className="section-list-heading">
        <div>
          <p className="section-page-eyebrow">Доверие</p>
          <h2 id="sync-devices-heading">Мои устройства</h2>
        </div>
        <span>{props.devices.length}</span>
      </div>
      {props.devices.length === 0 ? (
        <p className="sync-empty">Список устройств пока недоступен.</p>
      ) : (
        <ul>
          {props.devices.map((device) => {
            const current = device.deviceId === props.currentDeviceId;
            const confirming = device.deviceId === props.revokeCandidate;
            return (
              <li key={device.deviceId}>
                <div>
                  <strong>
                    {device.displayName}
                    {current ? ' · это устройство' : ''}
                  </strong>
                  <span>
                    {device.platform === 'android' ? 'Android' : 'Windows'} ·{' '}
                    {membershipLabel(device.status)}
                  </span>
                  <span>Добавлено: {formatDate(device.activatedAt ?? device.createdAt)}</span>
                  {device.lastSeenAt !== null ? (
                    <span>Последняя активность: {formatDate(device.lastSeenAt)}</span>
                  ) : null}
                </div>
                {confirming ? (
                  <div className="sync-revoke-confirm" role="alert">
                    <p>
                      Отзыв блокирует будущий доступ, но не стирает уже скачанные данные с
                      устройства.
                    </p>
                    <button
                      className="destructive-button"
                      type="button"
                      disabled={props.busy}
                      onClick={() => props.onRevoke(device.deviceId)}
                    >
                      Отозвать и сменить ключ
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={props.busy}
                      onClick={props.onCancelRevoke}
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={props.busy || current || device.status !== 'active'}
                    onClick={() => props.onAskRevoke(device.deviceId)}
                  >
                    {current ? 'Текущее' : device.status === 'revoked' ? 'Отозвано' : 'Отозвать'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CopyButton({ value, label }: { readonly value: string; readonly label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      className="secondary-button"
      type="button"
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setFailed(false);
          })
          .catch(() => setFailed(true))
      }
    >
      {failed ? 'Не удалось скопировать — выделите код' : copied ? 'Скопировано' : label}
    </button>
  );
}

function useQrCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  onValue: (value: string) => void,
  onError: (message: string) => void,
) {
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const scanGeneration = useRef(0);
  const [active, setActive] = useState(false);

  const stop = useCallback(() => {
    scanGeneration.current++;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    const generation = ++scanGeneration.current;
    const Detector = resolveBarcodeDetector();
    if (Detector === null || navigator.mediaDevices?.getUserMedia === undefined) {
      onError('Камера не поддерживает QR-сканирование. Используйте ручной код.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (generation !== scanGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video === null) throw new Error('Camera preview is unavailable.');
      video.srcObject = stream;
      await video.play();
      if (generation !== scanGeneration.current) return;
      setActive(true);
      const detector = new Detector({ formats: ['qr_code'] });
      const scan = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          if (!streamRef.current) return;
          const value = codes.find((code) => code.rawValue.trim().length > 0)?.rawValue;
          if (value !== undefined) {
            onValue(value);
            stop();
            return;
          }
          frameRef.current = requestAnimationFrame(() => void scan());
        } catch {
          stop();
          onError('Не удалось прочитать QR. Повторите сканирование или используйте ручной код.');
        }
      };
      frameRef.current = requestAnimationFrame(() => void scan());
    } catch {
      stop();
      onError('Не удалось открыть камеру. Разрешите доступ или используйте ручной код.');
    }
  }, [onError, onValue, stop, videoRef]);

  return { active, start, stop };
}

interface BarcodeDetectorResult {
  readonly rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<readonly BarcodeDetectorResult[]>;
}
interface BarcodeDetectorConstructor {
  new (options: { readonly formats: readonly string[] }): BarcodeDetectorInstance;
}

function resolveBarcodeDetector(): BarcodeDetectorConstructor | null {
  const value = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return value ?? null;
}

function downloadRecovery(material: string): void {
  const blob = new Blob([`${material}\n`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'LifeOS-Recovery-Key.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function membershipLabel(status: CachedSyncDevice['status']): string {
  if (status === 'active') return 'активно';
  if (status === 'pending') return 'ожидает подтверждения';
  return 'отозвано';
}

function pilotStatusLabel(status: PilotSyncStatus): string {
  if (status.state === 'syncing') return 'Синхронизация…';
  if (status.state === 'offline') {
    return status.pendingCount > 0 ? 'Нет сети — изменения сохранены локально' : 'Нет сети';
  }
  if (status.state === 'attention') return 'Синхронизация требует внимания';
  if (status.state === 'error') return 'Ошибка синхронизации';
  if (status.pendingCount > 0) return `${status.pendingCount} изменений ожидают отправки`;
  return status.lastSuccessfulSyncAt ? 'Синхронизировано' : 'Проверяем синхронизацию…';
}

function pilotStatusClass(state: PilotSyncStatus['state']): string {
  if (state === 'idle') return 'section-status-active';
  if (state === 'attention' || state === 'error') return 'section-status-error';
  return 'section-status-muted';
}

function publicMessage(cause: unknown): string {
  void cause;
  return 'Операция синхронизации не выполнена. Данные сохранены на устройстве. Проверьте соединение и повторите действие.';
}
