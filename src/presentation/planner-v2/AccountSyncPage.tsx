import { useEffect, useRef, useState } from 'react';
import type { AccountOverview, AccountSync } from '../../application';
import type { CachedSyncDevice } from '../../application/sync/ports/SyncDeviceCacheRepository';
import { AppIcon } from '../components/AppIcon';
import { redactAccountError } from './accountSyncPresentation';
import './account-sync.css';

export type AccountPageStep =
  | 'register'
  | 'sign-in'
  | 'reset-password'
  | 'verify'
  | 'set-password'
  | 'migration'
  | 'save-recovery'
  | 'recover'
  | 'ready'
  | 'sign-out-pending'
  | 'sign-out-confirm';

interface AccountSyncPageProps {
  readonly service: AccountSync;
  readonly onBack: () => void;
}

export function AccountSyncPage({ service, onBack }: AccountSyncPageProps) {
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void service
      .load()
      .then((value) => {
        if (active) setOverview(value);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(redactAccountError(reason, []));
      });
    return () => {
      active = false;
    };
  }, [service, reload]);

  if (overview === null) {
    return (
      <section
        className="account-sync-page account-sync-page--loading"
        aria-labelledby="account-title"
      >
        <AccountHeader onBack={onBack} />
        {loadError ? (
          <div className="account-feedback account-feedback--error" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setReload((value) => value + 1);
              }}
            >
              Повторить загрузку
            </button>
          </div>
        ) : (
          <div className="account-loading" role="status" aria-live="polite">
            <span aria-hidden="true" />
            Загружаем состояние аккаунта…
          </div>
        )}
      </section>
    );
  }

  return (
    <AccountSyncPageView
      service={service}
      overview={overview}
      onOverview={setOverview}
      onBack={onBack}
    />
  );
}

export function AccountSyncPageView({
  service,
  overview,
  onOverview,
  onBack,
  initialStep,
}: {
  readonly service: AccountSync;
  readonly overview: AccountOverview;
  readonly onOverview: (overview: AccountOverview) => void;
  readonly onBack: () => void;
  readonly initialStep?: AccountPageStep;
}) {
  const [step, setStep] = useState<AccountPageStep>(() => initialStep ?? stepFor(overview));
  const [email, setEmail] = useState(overview.email ?? '');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const working = useRef(false);

  const perform = async (
    work: () => Promise<AccountOverview>,
    secrets: readonly string[],
    next?: AccountPageStep,
    success?: string,
  ) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await work();
      onOverview(updated);
      setEmail(updated.email ?? email);
      setStep(next ?? stepFor(updated));
      if (success) setNotice(success);
    } catch (reason: unknown) {
      setError(redactAccountError(reason, secrets));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await service.signOut();
      onOverview(localOverview());
      setStep('register');
      setNotice('Вы вышли. Локальные данные и ключи этого устройства удалены.');
    } catch {
      setStep('sign-out-pending');
      setError('Выход не выполнен: сначала нужно сохранить изменения и резервную копию');
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const status = accountStatus(overview);
  return (
    <section className="account-sync-page" aria-labelledby="account-title">
      <AccountHeader onBack={onBack} />
      <div className={`account-hero account-hero--${status.tone}`}>
        <span className="account-hero__icon" aria-hidden="true">
          <AppIcon name={overview.state === 'ready' ? 'lock' : 'account'} />
        </span>
        <div>
          <span className="account-status">{status.label}</span>
          <h2>{overview.email ?? 'Личное пространство LifeOS'}</h2>
          <p>{status.description}</p>
        </div>
      </div>

      <div className="account-live" aria-live="polite" aria-atomic="true">
        {busy ? 'Выполняем защищённую операцию…' : notice}
      </div>
      {error ? (
        <p className="account-feedback account-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      {overview.pendingMutations > 0 ? (
        <p className="account-feedback account-feedback--pending">
          Ожидают отправки: {overview.pendingMutations}
        </p>
      ) : null}
      {overview.conflicts > 0 ? (
        <p className="account-feedback account-feedback--error" role="alert">
          Конфликты: {overview.conflicts}. Откройте синхронизацию после подключения.
        </p>
      ) : null}

      <div className="account-workspace">
        {step === 'register' ? (
          <AccountForm
            title="Создать аккаунт"
            description="Ваши текущие данные будут сохранены и привязаны к аккаунту."
            busy={busy}
            onSubmit={(form) => {
              const submittedEmail = readFormValue(form, 'email', email);
              setEmail(submittedEmail);
              void perform(
                () => service.beginRegistration(submittedEmail),
                [],
                'verify',
                'Письмо с кодом отправлено.',
              );
            }}
          >
            <EmailField value={email} onChange={setEmail} autoFocus />
            <button className="account-button account-button--primary" type="submit">
              Продолжить
            </button>
            <button
              className="account-button account-button--text"
              type="button"
              onClick={() => {
                setError(null);
                setStep('sign-in');
              }}
            >
              Уже есть аккаунт — войти
            </button>
          </AccountForm>
        ) : null}

        {step === 'sign-in' ? (
          <AccountForm
            title="Войти в LifeOS"
            description="После входа понадобится ключ восстановления для расшифровки данных на этом устройстве."
            busy={busy}
            onSubmit={(form) => {
              const submittedEmail = readFormValue(form, 'email', email);
              const submittedPassword = readFormValue(form, 'password', password);
              setEmail(submittedEmail);
              void perform(
                () => service.signIn(submittedEmail, submittedPassword),
                [submittedPassword],
                'recover',
              ).finally(() => setPassword(''));
            }}
          >
            <EmailField value={email} onChange={setEmail} autoFocus />
            <PasswordField
              label="Пароль"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
            <button className="account-button account-button--primary" type="submit">
              Войти
            </button>
            <div className="account-form__links">
              <button
                className="account-button account-button--text"
                type="button"
                onClick={() => setStep('reset-password')}
              >
                Забыли пароль?
              </button>
              <button
                className="account-button account-button--text"
                type="button"
                onClick={() => setStep('register')}
              >
                Создать аккаунт
              </button>
            </div>
          </AccountForm>
        ) : null}

        {step === 'reset-password' ? (
          <AccountForm
            title="Восстановить пароль"
            description="Отправим письмо для безопасной смены пароля."
            busy={busy}
            onSubmit={(form) => {
              if (working.current) return;
              const submittedEmail = readFormValue(form, 'email', email);
              setEmail(submittedEmail);
              working.current = true;
              setBusy(true);
              setError(null);
              void service
                .requestPasswordReset(submittedEmail)
                .then(() => setNotice('Письмо для смены пароля отправлено.'))
                .catch((reason: unknown) => setError(redactAccountError(reason, [])))
                .finally(() => {
                  working.current = false;
                  setBusy(false);
                });
            }}
          >
            <EmailField value={email} onChange={setEmail} autoFocus />
            <button className="account-button account-button--primary" type="submit">
              Отправить письмо
            </button>
            <button
              className="account-button account-button--text"
              type="button"
              onClick={() => setStep('sign-in')}
            >
              Вернуться ко входу
            </button>
          </AccountForm>
        ) : null}

        {step === 'verify' ? (
          <AccountForm
            title="Подтвердите почту"
            description={`Код отправлен на ${overview.email ?? email}.`}
            busy={busy}
            onSubmit={(form) => {
              const submitted = readFormValue(form, 'token', token);
              void perform(
                () => service.verifyEmail(submitted),
                [submitted],
                'set-password',
                'Почта подтверждена.',
              ).finally(() => setToken(''));
            }}
          >
            <label>
              <span>Код из письма</span>
              <input
                name="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
              />
            </label>
            <button className="account-button account-button--primary" type="submit">
              Подтвердить код
            </button>
            <button
              className="account-button account-button--text"
              type="button"
              disabled={busy}
              onClick={() => {
                void service
                  .resendVerification()
                  .then(() => setNotice('Новый код отправлен.'))
                  .catch((reason: unknown) => setError(redactAccountError(reason, [])));
              }}
            >
              Отправить код ещё раз
            </button>
          </AccountForm>
        ) : null}

        {step === 'set-password' ? (
          <AccountForm
            title="Создайте пароль"
            description="После этого LifeOS сделает проверенную резервную копию и подключит текущие данные."
            busy={busy}
            onSubmit={(form) => {
              const submitted = readFormValue(form, 'password', password);
              void perform(() => service.setPasswordAndAdopt(submitted), [submitted]).finally(() =>
                setPassword(''),
              );
            }}
          >
            <PasswordField
              label="Новый пароль"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <button className="account-button account-button--primary" type="submit">
              Защитить и синхронизировать
            </button>
          </AccountForm>
        ) : null}

        {step === 'migration' ? (
          <div className="account-panel" role="status">
            <h3>Подключаем данные</h3>
            <p>Проверяем резервную копию и завершаем первую синхронизацию.</p>
          </div>
        ) : null}

        {step === 'save-recovery' && overview.recoveryMaterial ? (
          <div className="account-panel account-panel--important">
            <p className="account-eyebrow">Ключ восстановления</p>
            <h3>Сохраните ключ восстановления</h3>
            <p>
              Он нужен, чтобы расшифровать данные на новом устройстве. LifeOS не сможет восстановить
              его за вас.
            </p>
            <output className="account-recovery-material" aria-label="Ключ восстановления">
              {overview.recoveryMaterial}
            </output>
            <button
              className="account-button account-button--primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void perform(
                  () => service.confirmRecoverySaved(),
                  [],
                  'ready',
                  'Аккаунт готов к синхронизации.',
                )
              }
            >
              Я сохранил ключ
            </button>
          </div>
        ) : null}

        {step === 'recover' ? (
          <AccountForm
            title="Расшифровать данные"
            description="Введите ключ восстановления для расшифровки данных на этом устройстве"
            busy={busy}
            onSubmit={(form) => {
              const submitted = readFormValue(form, 'recovery', recovery);
              void perform(
                () => service.recoverDevice(submitted),
                [submitted],
                'ready',
                'Данные восстановлены и синхронизированы.',
              ).finally(() => setRecovery(''));
            }}
          >
            <label>
              <span>Ключ восстановления</span>
              <textarea
                name="recovery"
                value={recovery}
                onChange={(event) => setRecovery(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
                autoFocus
              />
            </label>
            <button className="account-button account-button--primary" type="submit">
              Восстановить данные
            </button>
          </AccountForm>
        ) : null}

        {step === 'ready' || step === 'sign-out-confirm' ? (
          <ReadyAccountPanel
            overview={overview}
            busy={busy}
            onSync={() =>
              void perform(() => service.syncNow(), [], 'ready', 'Синхронизация завершена.')
            }
            onRevoke={(device) =>
              void perform(
                () => service.revokeDevice(device.deviceId),
                [],
                'ready',
                `${device.displayName}: доступ отключён.`,
              )
            }
            onChangePassword={(value) =>
              void perform(
                () => service.updatePassword(value),
                [value],
                'ready',
                'Пароль обновлён.',
              )
            }
            onSignOut={() => setStep('sign-out-confirm')}
          />
        ) : null}

        {step === 'sign-out-pending' ? (
          <div className="account-panel account-panel--danger">
            <h3>Безопасный выход не завершён</h3>
            <p>Выход не выполнен: сначала нужно сохранить изменения и резервную копию</p>
            <button
              className="account-button account-button--danger"
              type="button"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Повторить безопасный выход
            </button>
          </div>
        ) : null}
      </div>

      {step === 'sign-out-confirm' ? (
        <SignOutDialog
          busy={busy}
          onCancel={() => setStep('ready')}
          onConfirm={() => void signOut()}
        />
      ) : null}
    </section>
  );
}

function AccountHeader({ onBack }: { readonly onBack: () => void }) {
  return (
    <header className="account-header">
      <button className="account-back" type="button" onClick={onBack} aria-label="Вернуться назад">
        ←
      </button>
      <div>
        <p className="account-eyebrow">Настройки</p>
        <h1 id="account-title">Аккаунт и синхронизация</h1>
        <p>Одни данные на ваших устройствах — в зашифрованном виде.</p>
      </div>
    </header>
  );
}

function AccountForm({
  title,
  description,
  busy,
  onSubmit,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly busy: boolean;
  readonly onSubmit: (form: HTMLFormElement) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <form
      className="account-panel account-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event.currentTarget);
      }}
    >
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <fieldset disabled={busy}>{children}</fieldset>
    </form>
  );
}

function EmailField({
  value,
  onChange,
  autoFocus = false,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoFocus?: boolean;
}) {
  return (
    <label>
      <span>Электронная почта</span>
      <input
        name="email"
        type="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="email"
        required
        autoFocus={autoFocus}
      />
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: 'current-password' | 'new-password';
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        name="password"
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={12}
        required
        autoFocus
      />
    </label>
  );
}

function ReadyAccountPanel({
  overview,
  busy,
  onSync,
  onRevoke,
  onChangePassword,
  onSignOut,
}: {
  readonly overview: AccountOverview;
  readonly busy: boolean;
  readonly onSync: () => void;
  readonly onRevoke: (device: CachedSyncDevice) => void;
  readonly onChangePassword: (password: string) => void;
  readonly onSignOut: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  return (
    <div className="account-ready-grid">
      <section className="account-panel account-panel--important">
        <p className="account-eyebrow">Состояние</p>
        <h3>{overview.email}</h3>
        <dl className="account-metrics">
          <div>
            <dt>Соединение</dt>
            <dd>{connectionLabel(overview.connection)}</dd>
          </div>
          <div>
            <dt>Изменения</dt>
            <dd>{overview.pendingMutations}</dd>
          </div>
          <div>
            <dt>Конфликты</dt>
            <dd>{overview.conflicts}</dd>
          </div>
        </dl>
        <button
          className="account-button account-button--primary"
          type="button"
          disabled={busy}
          onClick={onSync}
        >
          Синхронизировать сейчас
        </button>
      </section>
      <section className="account-panel account-devices" aria-labelledby="account-devices-title">
        <div>
          <p className="account-eyebrow">Доступ</p>
          <h3 id="account-devices-title">Ваши устройства</h3>
        </div>
        {overview.devices.length === 0 ? (
          <p className="account-muted">Другие устройства ещё не подключены.</p>
        ) : (
          <ul>
            {overview.devices.map((device) => (
              <DeviceRow
                key={device.deviceId}
                device={device}
                busy={busy}
                onRevoke={() => onRevoke(device)}
              />
            ))}
          </ul>
        )}
      </section>
      <section className="account-panel account-security">
        <div className="account-security__summary">
          <p className="account-eyebrow">Безопасность</p>
          <h3>Пароль и выход</h3>
          <p>Перед выходом LifeOS проверит отправку изменений и резервную копию.</p>
        </div>
        <form
          className="account-password-change"
          onSubmit={(event) => {
            event.preventDefault();
            const submitted = readFormValue(event.currentTarget, 'password', newPassword);
            onChangePassword(submitted);
            setNewPassword('');
          }}
        >
          <PasswordField
            label="Новый пароль"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <button className="account-button" type="submit" disabled={busy}>
            Обновить пароль
          </button>
        </form>
        <button
          className="account-button account-button--danger"
          type="button"
          disabled={busy}
          onClick={onSignOut}
        >
          Выйти на этом устройстве
        </button>
      </section>
    </div>
  );
}

function readFormValue(form: HTMLFormElement, name: string, fallback: string): string {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
    ? control.value
    : fallback;
}

function DeviceRow({
  device,
  busy,
  onRevoke,
}: {
  readonly device: CachedSyncDevice;
  readonly busy: boolean;
  readonly onRevoke: () => void;
}) {
  return (
    <li>
      <span className="account-device__icon" aria-hidden="true">
        <AppIcon name={device.platform === 'android' ? 'today' : 'management'} />
      </span>
      <span>
        <strong>{device.displayName}</strong>
        <small>
          {device.platform === 'android' ? 'Android' : 'Windows'} ·{' '}
          {device.lastSeenAt
            ? `активно ${formatDate(device.lastSeenAt)}`
            : 'нет данных об активности'}
        </small>
      </span>
      <span className={`account-device__status account-device__status--${device.status}`}>
        {device.status === 'active'
          ? 'Активно'
          : device.status === 'pending'
            ? 'Ожидает'
            : 'Отключено'}
      </span>
      {device.status === 'active' ? (
        <button
          className="account-button account-button--text"
          type="button"
          disabled={busy}
          onClick={onRevoke}
        >
          Отключить
        </button>
      ) : null}
    </li>
  );
}

function SignOutDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="account-sign-out"
      aria-labelledby="sign-out-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <p className="account-eyebrow">Безопасный выход</p>
      <h2 id="sign-out-title">Удалить данные с этого устройства?</h2>
      <p>
        LifeOS сначала отправит изменения и проверит резервную копию, затем удалит локальные данные
        и ключи. Другие устройства останутся подключены.
      </p>
      <div>
        <button className="account-button" type="button" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
        <button
          className="account-button account-button--danger"
          type="button"
          disabled={busy}
          onClick={onConfirm}
        >
          Выйти и удалить локальные данные
        </button>
      </div>
    </dialog>
  );
}

function stepFor(overview: AccountOverview): AccountPageStep {
  if (overview.state === 'local_anonymous') return 'register';
  if (overview.state === 'email_verification_pending')
    return overview.emailVerified ? 'set-password' : 'verify';
  if (overview.state === 'account_migration_pending') return 'migration';
  if (overview.state === 'recovery_confirmation_pending')
    return overview.recoveryMaterial ? 'save-recovery' : 'recover';
  if (overview.state === 'sign_out_pending') return 'sign-out-pending';
  return 'ready';
}

function accountStatus(overview: AccountOverview): {
  readonly label: string;
  readonly description: string;
  readonly tone: 'local' | 'success' | 'pending' | 'offline';
} {
  if (overview.state === 'local_anonymous')
    return {
      label: 'Только это устройство',
      description: 'Данные хранятся только на этом устройстве',
      tone: 'local',
    };
  if (overview.state === 'ready' && overview.connection === 'online')
    return { label: 'Защищено', description: 'Синхронизировано и защищено', tone: 'success' };
  if (overview.state !== 'ready')
    return {
      label: 'Настройка',
      description: 'Завершите защищённое подключение аккаунта',
      tone: 'pending',
    };
  if (overview.connection === 'offline')
    return {
      label: 'Нет соединения',
      description: 'Офлайн — изменения ожидают отправки',
      tone: 'offline',
    };
  return {
    label: 'Настройка',
    description: 'Завершите защищённое подключение аккаунта',
    tone: 'pending',
  };
}

function connectionLabel(connection: AccountOverview['connection']): string {
  return connection === 'online' ? 'В сети' : connection === 'offline' ? 'Офлайн' : 'Локально';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'недавно'
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date);
}

function localOverview(): AccountOverview {
  return {
    state: 'local_anonymous',
    email: null,
    emailVerified: false,
    connection: 'local',
    recoveryMaterial: null,
    pendingMutations: 0,
    conflicts: 0,
    devices: [],
  };
}
