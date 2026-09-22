import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AccountOverview, AccountSync } from '../../application';
import type { CachedSyncDevice } from '../../application/sync/ports/SyncDeviceCacheRepository';
import { AccountSyncPageView } from './AccountSyncPage';
import { redactAccountError } from './accountSyncPresentation';

const RECOVERY = 'LIFEOS-RECOVERY-V1:private-material';
const PASSWORD = 'correct horse battery';

describe('AccountSyncPage', () => {
  it('shows local storage, registration email and a sign-in choice', () => {
    const html = render(localOverview(), 'register');

    expect(html).toContain('Данные хранятся только на этом устройстве');
    expect(html).toContain('Создать аккаунт');
    expect(html).toContain('войти');
    expect(html).toContain('type="email"');
  });

  it('shows verification, password and recovery setup as explicit steps', () => {
    const verification = render(
      { ...localOverview(), state: 'email_verification_pending', email: 'person@example.com' },
      'verify',
    );
    expect(verification).toContain('Код из письма');
    expect(verification).toContain('inputMode="numeric"');

    const password = render(
      { ...localOverview(), state: 'email_verification_pending', email: 'person@example.com' },
      'set-password',
    );
    expect(password).toContain('Создайте пароль');
    expect(password).toContain('type="password"');

    const recovery = render(
      {
        ...localOverview(),
        state: 'recovery_confirmation_pending',
        email: 'person@example.com',
        recoveryMaterial: RECOVERY,
      },
      'save-recovery',
    );
    expect(recovery).toContain('Сохраните ключ восстановления');
    expect(recovery).toContain(RECOVERY);
    expect(recovery).toContain('Я сохранил ключ');
  });

  it('shows password login followed by recovery input on a new device', () => {
    const login = render(localOverview(), 'sign-in');
    expect(login).toContain('Войти в LifeOS');
    expect(login).toContain('После входа понадобится ключ восстановления');

    const recovery = render(
      {
        ...localOverview(),
        state: 'recovery_confirmation_pending',
        email: 'person@example.com',
      },
      'recover',
    );
    expect(recovery).toContain(
      'Введите ключ восстановления для расшифровки данных на этом устройстве',
    );
    expect(recovery).toContain('Восстановить данные');
  });

  it('shows account identity, sync health and semantic device states', () => {
    const ready = render({
      ...localOverview(),
      state: 'ready',
      email: 'person@example.com',
      connection: 'online',
      devices: [device('Ноутбук', 'active'), device('Телефон', 'revoked')],
    });
    expect(ready).toContain('Синхронизировано и защищено');
    expect(ready).toContain('person@example.com');
    expect(ready).toContain('Ноутбук');
    expect(ready).toContain('Телефон');
    expect(ready).toContain('Отключено');

    const offline = render({
      ...localOverview(),
      state: 'ready',
      email: 'person@example.com',
      connection: 'offline',
      pendingMutations: 3,
      conflicts: 2,
    });
    expect(offline).toContain('Офлайн — изменения ожидают отправки');
    expect(offline).toContain('Ожидают отправки: 3');
    expect(offline).toContain('Конфликты: 2');
  });

  it('explains local removal before sign-out and the safe retry when sign-out is pending', () => {
    const confirm = render(
      { ...localOverview(), state: 'ready', email: 'person@example.com' },
      'sign-out-confirm',
    );
    expect(confirm).toContain('Удалить данные с этого устройства?');
    expect(confirm).toContain('Другие устройства останутся подключены');

    const pending = render({
      ...localOverview(),
      state: 'sign_out_pending',
      email: 'person@example.com',
    });
    expect(pending).toContain(
      'Выход не выполнен: сначала нужно сохранить изменения и резервную копию',
    );
    expect(pending).toContain('Повторить безопасный выход');
  });

  it('redacts submitted secrets from public errors', () => {
    const error = redactAccountError(new Error(`Rejected ${PASSWORD} ${RECOVERY}`), [
      PASSWORD,
      RECOVERY,
    ]);
    expect(error).not.toContain(PASSWORD);
    expect(error).not.toContain(RECOVERY);
    expect(error).toBe('Не удалось выполнить действие. Проверьте данные и повторите.');
  });
});

function render(
  overview: AccountOverview,
  initialStep?: Parameters<typeof AccountSyncPageView>[0]['initialStep'],
) {
  return renderToStaticMarkup(
    createElement(AccountSyncPageView, {
      service: service(),
      overview,
      onOverview: vi.fn(),
      onBack: vi.fn(),
      ...(initialStep ? { initialStep } : {}),
    }),
  );
}

function localOverview(): AccountOverview {
  return {
    state: 'local_anonymous',
    email: null,
    connection: 'local',
    recoveryMaterial: null,
    pendingMutations: 0,
    conflicts: 0,
    devices: [],
  };
}

function device(displayName: string, status: CachedSyncDevice['status']): CachedSyncDevice {
  return {
    deviceId: `${displayName}-id`,
    spaceId: 'space-id',
    encryptedName: null,
    encryptedNameNonce: null,
    encryptedNameKeyEpoch: null,
    displayName,
    platform: displayName === 'Телефон' ? 'android' : 'windows',
    publicKey: 'public',
    status,
    createdAt: '2026-09-20T10:00:00.000Z',
    activatedAt: '2026-09-20T10:00:00.000Z',
    lastSeenAt: '2026-09-22T10:00:00.000Z',
    revokedAt: status === 'revoked' ? '2026-09-22T11:00:00.000Z' : null,
    updatedAt: '2026-09-22T11:00:00.000Z',
  };
}

function service(): AccountSync {
  const overview = localOverview();
  return {
    load: async () => overview,
    beginRegistration: async () => overview,
    resendVerification: async () => undefined,
    verifyEmail: async () => overview,
    setPasswordAndAdopt: async () => overview,
    confirmRecoverySaved: async () => overview,
    signIn: async () => overview,
    recoverDevice: async () => overview,
    requestPasswordReset: async () => undefined,
    updatePassword: async () => overview,
    syncNow: async () => overview,
    revokeDevice: async () => overview,
    signOut: async () => undefined,
  };
}
