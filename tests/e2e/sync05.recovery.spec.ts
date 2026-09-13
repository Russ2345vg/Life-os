import { expect, test } from '@playwright/test';

test('SYNC-05 creates a verified offline snapshot and safely previews restore', async ({
  page,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === 'mobile-chrome'
      ? { width: 390, height: 844 }
      : { width: 1366, height: 900 },
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (path: string) => import(path);
    const [
      {
        default: { createElement },
      },
      {
        default: { createRoot },
      },
      { SyncRecoveryPanel },
      { LifeOsIndexedDb, LIFE_OS_SYNC_STORE },
      { IndexedDbRecoveryStore },
      { IndexedDbPilotMutationRecorder },
      { SyncRecoveryService },
    ] = await Promise.all([
      load('/node_modules/.vite/deps/react.js'),
      load('/node_modules/.vite/deps/react-dom_client.js'),
      load('/src/presentation/sync/SyncRecoveryPanel.tsx'),
      load('/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts'),
      load('/src/infrastructure/sync/recovery/IndexedDbRecoveryStore.ts'),
      load('/src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.ts'),
      load('/src/application/sync/recovery/SyncRecoveryService.ts'),
    ]);
    const db = new LifeOsIndexedDb();
    const connection = await db.open();
    const tx = connection.transaction(LIFE_OS_SYNC_STORE.settings, 'readwrite');
    tx.objectStore(LIFE_OS_SYNC_STORE.settings).put({
      id: 'sync',
      setupState: 'configured',
      membershipStatus: 'active',
      spaceId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'synthetic-browser',
      currentKeyEpoch: 1,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
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
    const transport = {
      upload: async () => {
        throw new Error('offline');
      },
      download: async () => {
        throw new Error('offline');
      },
      listSnapshots: async () => [],
    };
    const recovery = new SyncRecoveryService(
      new IndexedDbRecoveryStore(db, new IndexedDbPilotMutationRecorder()),
      crypto,
      transport,
      { retry: async () => {} },
    );
    const root = document.getElementById('root');
    if (root) root.style.display = 'none';
    const host = document.createElement('main');
    host.className = 'section-page sync-page';
    document.body.append(host);
    createRoot(host).render(createElement(SyncRecoveryPanel, { recovery }));
  });
  await expect(page.getByRole('heading', { name: 'Резервные снимки', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать снимок сейчас', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('проверен локально');
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  const preview = page.getByLabel('Предпросмотр восстановления');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Будет удалено: 0');
  await expect(preview).toContainText('проверенном снимке перед восстановлением');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('sync05-recovery-preview.png'),
    fullPage: true,
  });
  await preview.getByRole('button', { name: 'Отмена', exact: true }).focus();
  await expect(preview.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(preview).toHaveCount(0);
  expect(errors).toEqual([]);
});
