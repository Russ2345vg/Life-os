import { expect, test } from '@playwright/test';

test('SYNC-06 global indicator opens existing Sync settings without claiming browser success', async ({
  page,
}) => {
  await page.goto('/');
  const indicator = page.getByRole('button', { name: /^Синхронизация:.*Открыть настройки/ });
  await expect(indicator).toBeVisible();
  await expect(indicator).not.toHaveClass(/sync-tone-synced/);
  await indicator.click();
  await expect(page.getByRole('heading', { name: 'Синхронизация', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '← Вернуться в «Ещё»' })).toBeVisible();
  await page.getByRole('button', { name: 'День', exact: true }).last().click();
  await page.getByRole('button', { name: 'Ещё', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Ещё', exact: true })).toBeVisible();
  await indicator.click();
  await expect(page.getByRole('heading', { name: 'Синхронизация', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('SYNC-06 live queues, usable recovery UI and isolated restore apply', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'export {}' }),
  );
  await page.setViewportSize(
    testInfo.project.name === 'mobile-chrome'
      ? { width: 390, height: 844 }
      : { width: 1366, height: 900 },
  );
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (path: string) =>
      import(
        performance.getEntriesByType('resource').find((r) => r.name.includes(`${path}?`))?.name ??
          path
      );
    await load('/src/presentation/styles/global.css');
    const [
      { default: React },
      { default: ReactDOM },
      { SyncPage },
      { SyncStatusProvider },
      { SyncIndicator },
      { AttachmentSyncStatus },
      { LifeOsIndexedDb },
      { IndexedDbRecoveryStore },
      { IndexedDbPilotMutationRecorder },
      { SyncRecoveryService },
      { IndexedDbSyncStatusSource },
    ] = await Promise.all([
      load('/node_modules/.vite/deps/react.js'),
      load('/node_modules/.vite/deps/react-dom_client.js'),
      load('/src/presentation/sync/SyncPage.tsx'),
      load('/src/presentation/sync/SyncStatusContext.tsx'),
      load('/src/presentation/sync/SyncIndicator.tsx'),
      load('/src/presentation/sync/AttachmentSyncStatus.tsx'),
      load('/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts'),
      load('/src/infrastructure/sync/recovery/IndexedDbRecoveryStore.ts'),
      load('/src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.ts'),
      load('/src/application/sync/recovery/SyncRecoveryService.ts'),
      load('/src/infrastructure/sync/IndexedDbSyncStatusSource.ts'),
    ]);
    const database = new LifeOsIndexedDb();
    const db = await database.open();
    const installation = {
      id: 'sync',
      setupState: 'configured',
      membershipStatus: 'active',
      spaceId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'synthetic-browser',
      deviceName: 'SYNC06_TEST Windows',
      currentKeyEpoch: 1,
      platform: 'windows',
      recoveryConfirmedAt: '2026-09-08T00:00:00Z',
    };
    const tx = db.transaction('sync_settings', 'readwrite');
    tx.objectStore('sync_settings').put(installation);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    const crypto = {
      encryptBinary: async (metadata: unknown, plaintext: string) => ({
        metadata,
        ciphertext: btoa(String.fromCharCode(...new TextEncoder().encode(plaintext))),
        nonce: 'synthetic-test-only',
      }),
      decryptBinary: async (envelope: { ciphertext: string }) =>
        new TextDecoder().decode(
          Uint8Array.from(atob(envelope.ciphertext), (c) => c.charCodeAt(0)),
        ),
    };
    const recovery = new SyncRecoveryService(
      new IndexedDbRecoveryStore(database, new IndexedDbPilotMutationRecorder()),
      crypto,
      {
        upload: async () => {
          throw new Error('offline');
        },
        download: async () => {
          throw new Error('offline');
        },
        listSnapshots: async () => [],
      },
      { retry: async () => {} },
    );
    const status = {
      state: 'idle',
      pendingCount: 0,
      conflictCount: 0,
      lastSuccessfulSyncAt: '2026-09-08T00:00:00Z',
    };
    const sync = {
      recovery,
      statusSource: new IndexedDbSyncStatusSource(database),
      pilotStatus: () => status,
      subscribePilotStatus: (listener: (value: unknown) => void) => {
        listener(status);
        return () => {};
      },
      loadOverview: async () => ({
        installation,
        connection: 'online',
        warning: null,
        devices: [
          {
            deviceId: installation.deviceId,
            displayName: installation.deviceName,
            platform: 'windows',
            status: 'active',
            createdAt: '2026-09-08T00:00:00Z',
            activatedAt: null,
            lastSeenAt: '2026-09-08T00:00:00Z',
          },
        ],
      }),
      syncPilotNow: async () => {},
    };
    (window as typeof window & { sync06Queue?: (state: string) => Promise<void> }).sync06Queue =
      async (state) => {
        const tx = db.transaction('sync_attachment_queue', 'readwrite');
        tx.objectStore('sync_attachment_queue').put({
          attachmentId: '22222222-2222-4222-8222-222222222222',
          parentObjectId: 'synthetic-parent',
          entityType: 'goal',
          spaceId: installation.spaceId,
          state,
          deletedAt: state === 'tombstoned' ? '2026-09-08T00:00:00Z' : null,
          localImage: null,
          nextAttemptAt: '2026-09-08T00:00:00Z',
          leaseUntil: null,
          retryCount: 0,
          keyEpoch: 1,
          blobVersion: 1,
        });
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve();
        });
      };
    const original = document.getElementById('root');
    if (original) original.style.display = 'none';
    const host = document.createElement('div');
    document.body.append(host);
    ReactDOM.createRoot(host).render(
      React.createElement(
        SyncStatusProvider,
        { sync },
        React.createElement(SyncIndicator, { onOpen: () => {} }),
        React.createElement(SyncPage, { sync, onBack: () => {} }),
        React.createElement(AttachmentSyncStatus, {
          entityType: 'goal',
          objectId: 'synthetic-parent',
          localAvailable: false,
        }),
      ),
    );
  });
  await expect(page.getByRole('heading', { name: 'Сквозное шифрование включено' })).toBeVisible();
  await expect(page.getByText('Пилот SYNC-03')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Синхронизация:/ })).toHaveClass(
    /sync-tone-synced/,
  );
  for (const [state, text] of [
    ['pending-download', 'Вложение сохранено · ожидает загрузки'],
    ['downloading', 'Загружаем вложение…'],
    ['retry-download', 'Вложение сохранено · загрузку нужно повторить'],
    ['quarantined', 'Вложение не прошло проверку'],
    ['available-local', 'Вложение доступно'],
  ]) {
    await page.evaluate(async (next) => {
      await (
        window as typeof window & { sync06Queue: (state: string) => Promise<void> }
      ).sync06Queue(next!);
    }, state);
    await expect(page.locator('.sync-attachment-status')).toContainText(text!);
  }
  await page.evaluate(async () => {
    await (window as typeof window & { sync06Queue: (state: string) => Promise<void> }).sync06Queue(
      'tombstoned',
    );
  });
  await expect(page.locator('.sync-attachment-status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Создать снимок сейчас', exact: true }).click();
  await expect(
    page.getByText('Зашифрованный снимок проверен локально.', { exact: false }),
  ).toBeVisible();
  // Only this isolated Playwright context is mutated; no real native profile is used.
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const [{ structuredSyncFixtures }, { LifeOsIndexedDb }] = await Promise.all([
      load('/src/infrastructure/sync/pilot/StructuredSyncFixtures.ts'),
      load('/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts'),
    ]);
    const db = await new LifeOsIndexedDb().open();
    const tx = db.transaction('goals', 'readwrite');
    tx.objectStore('goals').put({
      ...structuredSyncFixtures().goal,
      id: 'SYNC06_TEST_ISOLATED',
      title: 'SYNC06_TEST_ISOLATED',
      directionId: null,
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  });
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByLabel('Предпросмотр восстановления');
  await expect(preview).toContainText('Будет удалено: 1');
  await expect(preview).toContainText('проверенном снимке перед восстановлением');
  await preview.getByRole('button', { name: 'Подтвердить восстановление снимка' }).click();
  await expect(
    page.getByText('Снимок восстановлен. Изменения ожидают синхронизации.'),
  ).toBeVisible();
  await expect(
    page.locator('.sync-recovery-list li').filter({ hasText: 'Перед восстановлением' }),
  ).toBeVisible();
  const proof = await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const { LifeOsIndexedDb } = await load(
      '/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts',
    );
    const db = await new LifeOsIndexedDb().open();
    const read = (name: string) =>
      new Promise<unknown[]>((resolve) => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result);
      });
    const goals = (await read('goals')) as { id: string }[];
    const snapshots = (await read('sync_snapshot_meta')) as {
      kind: string;
      verifiedAt: string | null;
    }[];
    return {
      syntheticRemoved: !goals.some((g) => g.id === 'SYNC06_TEST_ISOLATED'),
      preRestoreVerified: snapshots.some((s) => s.kind === 'pre-restore' && s.verifiedAt !== null),
    };
  });
  expect(proof).toEqual({ syntheticRemoved: true, preRestoreVerified: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Синхронизировать сейчас', exact: true }).focus();
  await expect(
    page.getByRole('button', { name: 'Синхронизировать сейчас', exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('sync06-final-ux.png'), fullPage: true });
  expect(errors).toEqual([]);
});
