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
  it('shows sign-in and recovery separately from a connected account', () => {
    const login = render({
      ...localOverview(),
      state: 'sign_in_required',
      email: 'person@example.com',
    });
    expect(login).toContain('Нужно войти');
    expect(login).toContain('Войти в LifeOS');
    const recovery = render({
      ...localOverview(),
      state: 'device_recovery_required',
      email: 'person@example.com',
    });
    expect(recovery).toContain('Восстановите доступ');
    expect(recovery).toContain('Ключ восстановления');
    expect(recovery).not.toContain('Синхронизировать сейчас');
  });
  it('shows why account access is unavailable without offering a broken form', () => {
    const html = render({
      ...localOverview(),
      availability: { available: false, reason: 'Доступно только в установленном приложении.' },
    });
    expect(html).toContain('Доступно только в установленном приложении.');
    expect(html).not.toContain('type="email"');
  });
  it('provides proof and repeated password fields for password recovery', () => {
    const html = render(localOverview(), 'reset-confirm');
    expect(html).toContain('Код или ссылка из письма');
    expect(html).toContain('Повторите новый пароль');
  });
  it('does not apply the new-password minimum to an existing password at login', () => {
    expect(render(localOverview(), 'sign-in')).not.toContain('minLength="12"');
    expect(
      render(
        { ...localOverview(), state: 'email_verification_pending', emailVerified: true },
        'set-password',
      ),
    ).toContain('minLength="12"');
  });
  it.each(['error', 'attention', 'syncing', 'offline'] as const)(
    'never claims success for an online %s transfer',
    (syncState) => {
      const html = render({ ...localOverview(), state: 'ready', connection: 'online', syncState });
      expect(html).not.toContain('Синхронизировано и защищено');
    },
  );

  it('requires a confirmed exchange and empty queue before showing success', () => {
    const overview = { ...localOverview(), state: 'ready' as const, connection: 'online' as const };
    expect(render(overview)).not.toContain('Синхронизировано и защищено');
    expect(
      render({ ...overview, lastSuccessfulSyncAt: '2026-09-25T10:00:00Z', pendingMutations: 1 }),
    ).not.toContain('Синхронизировано и защищено');
    expect(
      render({ ...overview, lastSuccessfulSyncAt: '2026-09-25T10:00:00Z', conflicts: 1 }),
    ).not.toContain('Синхронизировано и защищено');
  });

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

  it('opens password setup after out-of-band verification and does not call setup offline', () => {
    const html = render({
      ...localOverview(),
      state: 'email_verification_pending',
      email: 'person@example.com',
      emailVerified: true,
      connection: 'offline',
    });

    expect(html).toContain('Создайте пароль');
    expect(html).toContain('Завершите защищённое подключение аккаунта');
    expect(html).not.toContain('Код из письма');
    expect(html).not.toContain('Нет соединения');
  });

  it('keeps an unverified pending email on the code form', () => {
    const html = render({
      ...localOverview(),
      state: 'email_verification_pending',
      email: 'person@example.com',
      emailVerified: false,
    });

    expect(html).toContain('Код из письма');
    expect(html).not.toContain('Создайте пароль');
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
      lastSuccessfulSyncAt: '2026-09-25T10:00:00Z',
      devices: [device('Ноутбук', 'active'), device('Телефон', 'revoked')],
    });
    expect(ready).toContain('Синхронизировано и защищено');
    expect(ready).toContain('person@example.com');
    expect(ready).toContain('Ноутбук');
    expect(ready).toContain('Телефон');
    expect(ready).toContain('Отключено');
    expect(ready).toContain('Показать ключ восстановления');

    const revealed = render({
      ...localOverview(),
      state: 'ready',
      email: 'person@example.com',
      connection: 'online',
      recoveryMaterial: RECOVERY,
    });
    expect(revealed).toContain(RECOVERY);
    expect(revealed).toContain('Скопировать ключ');
    expect(revealed).toContain('Скрыть ключ');

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

  it('explains what the ready-state counts and exchange time mean', () => {
    const html = render({
      ...localOverview(),
      state: 'ready',
      email: 'person@example.com',
      connection: 'online',
      pendingMutations: 2,
      conflicts: 1,
    });
    expect(html).toContain('<h3>Состояние данных</h3>');
    expect(html).toContain('<dt>Ожидают отправки</dt>');
    expect(html).toContain('Количество изменений, а не задач');
    expect(html).toContain('<dt>Сохранённые конфликтные версии</dt>');
    expect(html).toContain('Последний успешный обмен в этом сеансе:');
    expect(html).toContain('ещё не подтверждён');
    expect(html).toContain('Сохранение на устройстве и обмен между устройствами — разные этапы.');
    expect(html).toContain('Сохранение текущего текста проверяйте в его редакторе');
    expect(html.match(/Синхронизировать сейчас/g)).toHaveLength(1);
  });

  it('uses a contextual back name while keeping the direct-entry fallback', () => {
    expect(render(localOverview())).toContain('aria-label="К плану дня"');
    expect(render(localOverview(), undefined, 'Вернуться в предыдущий раздел')).toContain(
      'aria-label="Вернуться в предыдущий раздел"',
    );
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
  backLabel?: string,
) {
  return renderToStaticMarkup(
    createElement(AccountSyncPageView, {
      service: service(),
      overview,
      onOverview: vi.fn(),
      onBack: vi.fn(),
      ...(backLabel ? { backLabel } : {}),
      ...(initialStep ? { initialStep } : {}),
    }),
  );
}

function localOverview(): AccountOverview {
  return {
    state: 'local_anonymous',
    email: null,
    emailVerified: false,
    connection: 'local',
    recoveryMaterial: null,
    pendingMutations: 0,
    syncState: 'idle',
    lastSuccessfulSyncAt: null,
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
    revealRecoveryMaterial: async () => overview,
    signIn: async () => overview,
    recoverDevice: async () => overview,
    requestPasswordReset: async () => undefined,
    completePasswordReset: async () => undefined,
    updatePassword: async () => overview,
    syncNow: async () => overview,
    revokeDevice: async () => overview,
    signOut: async () => undefined,
  };
}
