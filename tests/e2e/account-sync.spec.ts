import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const RECOVERY = 'LIFEOS-RECOVERY-V1:fixture-private-material';

function observeRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  return issues;
}

test('completes registration, recovery confirmation, offline attention and safe sign-out', async ({
  page,
}, info) => {
  const issues = observeRuntimeIssues(page);
  await page.goto('/tests/fixtures/account-sync.html');
  await expect(page.getByText('Данные хранятся только на этом устройстве')).toBeVisible();

  const email = page.getByLabel('Электронная почта');
  await email.fill('person@example.com');
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Код из письма')).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toContainText('Письмо с кодом отправлено');

  await page.getByLabel('Код из письма').fill('123456');
  await page.getByRole('button', { name: 'Подтвердить код' }).click();
  await expect(page.getByRole('heading', { name: 'Создайте пароль' })).toBeVisible();
  await page.getByLabel('Новый пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Защитить и синхронизировать' }).click();
  await expect(page.getByText('Сохраните ключ восстановления')).toBeVisible();
  await expect(page.getByLabel('Ключ восстановления')).toHaveText(RECOVERY);
  await page.getByRole('button', { name: 'Я сохранил ключ' }).click();

  await expect(page.getByText('Синхронизировано и защищено')).toBeVisible();
  await expect(page.getByText('Ноутбук')).toBeVisible();
  expect(await page.locator('body').textContent()).not.toContain(PASSWORD);
  expect(await page.locator('body').textContent()).not.toContain(RECOVERY);

  await page.getByRole('button', { name: 'Синхронизировать сейчас' }).click();
  await expect(page.getByText('Офлайн — изменения ожидают отправки')).toBeVisible();
  await expect(page.getByText('Ожидают отправки: 2')).toBeVisible();
  await expect(page.getByText(/Конфликты: 1/)).toBeVisible();

  await page.getByRole('button', { name: 'Выйти на этом устройстве' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить данные с этого устройства?' });
  await expect(dialog).toContainText('Другие устройства останутся подключены');
  await dialog.getByRole('button', { name: 'Выйти и удалить локальные данные' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: 'Выход не выполнен: сначала нужно сохранить изменения и резервную копию',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Повторить безопасный выход' }).click();
  await expect(page.getByText('Данные хранятся только на этом устройстве')).toBeVisible();

  await assertResponsivePage(page, info.project.name);
  await page.screenshot({
    path: info.outputPath(`account-lifecycle-${info.project.name}.png`),
    fullPage: true,
  });
  expect(issues).toEqual([]);
});

test('signs in on a new device and requires recovery material before data appears', async ({
  page,
}) => {
  const issues = observeRuntimeIssues(page);
  await page.goto('/tests/fixtures/account-sync.html');
  await page.getByRole('button', { name: /Уже есть аккаунт/ }).click();
  await page.getByLabel('Электронная почта').fill('person@example.com');
  await page.getByLabel('Пароль').fill(PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByText('Введите ключ восстановления для расшифровки данных на этом устройстве'),
  ).toBeVisible();
  await page.getByLabel('Ключ восстановления').fill(RECOVERY);
  await page.getByRole('button', { name: 'Восстановить данные' }).click();
  await expect(page.getByText('Синхронизировано и защищено')).toBeVisible();
  expect(await page.locator('body').textContent()).not.toContain(PASSWORD);
  expect(await page.locator('body').textContent()).not.toContain(RECOVERY);
  expect(issues).toEqual([]);
});

test('submits the email visibly inserted by WebView autofill without a change event', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/account-sync.html');
  await page.getByLabel('Электронная почта').evaluate((element) => {
    (element as HTMLInputElement).value = 'person@example.com';
  });

  await page.getByRole('button', { name: 'Продолжить' }).click();

  await expect(page.getByLabel('Код из письма')).toBeVisible();
});

async function assertResponsivePage(page: Page, projectName: string): Promise<void> {
  const sizes =
    projectName === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [{ width: 1440, height: 900 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      targets: Array.from(document.querySelectorAll<HTMLElement>('button,input,textarea'))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect().height),
    }));
    expect(metrics.content).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(Math.min(...metrics.targets)).toBeGreaterThanOrEqual(44);
  }
}
