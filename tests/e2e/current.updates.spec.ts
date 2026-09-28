import { expect, test, type Page } from '@playwright/test';

async function updateRuntime(
  page: Page,
  scenario: 'available' | 'failure' | 'offline' | 'external-installer',
) {
  await page.route('**/src/app/composition/createApplicationUpdateService.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { ApplicationUpdateService } from '/src/application/updates/ApplicationUpdateService.ts';
      let attempts = 0;
      export function createApplicationUpdateService() {
        return new ApplicationUpdateService({check: async () => {
          if (${JSON.stringify(scenario)} === 'offline' && attempts++ === 0) throw new Error('offline');
          return { version: '1.0.14', close: async () => {}, install: async (progress) => {
            progress(50);
            if (${JSON.stringify(scenario)} === 'failure' && attempts++ === 0) throw new Error('download failed');
            await new Promise(resolve => setTimeout(resolve, 300));
            if (${JSON.stringify(scenario)} === 'external-installer') return 'installer-opened';
          }};
        }});
      }`,
    }),
  );
}

test('offers an update without blocking work, supports keyboard dismissal and narrow windows', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await updateRuntime(page, 'available');
  await page.goto('/#/v2/today');
  const notice = page.getByRole('region', { name: 'Обновление LifeOS' });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  await expect(notice).toContainText('Сохраните открытые формы');
  await notice.getByRole('button', { name: 'Обновить', exact: true }).focus();
  await expect(notice.getByRole('button', { name: 'Обновить', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('update-available.png'), fullPage: true });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(notice).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('retries a failed installation and prevents a second install while busy', async ({ page }) => {
  await updateRuntime(page, 'failure');
  await page.goto('/#/v2/today');
  const notice = page.getByRole('region', { name: 'Обновление LifeOS' });
  await notice.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(notice.getByRole('alert')).toContainText('Не удалось установить');
  await notice.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(notice.getByRole('button', { name: 'Устанавливаем…' })).toBeDisabled();
  await expect(notice).toContainText('Обновление передано установщику');
});

test('an offline startup check stays quiet without losing access to the planner', async ({
  page,
}) => {
  await updateRuntime(page, 'offline');
  await page.goto('/#/v2/today');
  await expect(page.getByRole('region', { name: 'Обновление LifeOS' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
});

test('an external installer leaves the update retryable and dismissible after cancellation', async ({
  page,
}) => {
  await updateRuntime(page, 'external-installer');
  await page.goto('/#/v2/today');
  const notice = page.getByRole('region', { name: 'Обновление LifeOS' });
  const install = notice.getByRole('button', { name: 'Обновить', exact: true });
  await install.click();
  await expect(install).toBeEnabled();
  await install.click();
  await expect(install).toBeEnabled();
  await notice.getByRole('button', { name: 'Позже', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
});
