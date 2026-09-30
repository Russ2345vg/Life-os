import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const RECOVERY = 'LIFEOS-RECOVERY-V1:fixture-private-material';

test('completes password reset, rejects mismatched passwords and returns to sign-in', async ({
  page,
}, info) => {
  const issues = observeRuntimeIssues(page);
  await page.goto('/tests/fixtures/account-sync.html');
  await page.getByRole('button', { name: /Уже есть аккаунт/ }).click();
  await page.getByRole('button', { name: 'Забыли пароль?' }).click();
  await page.getByLabel('Электронная почта').fill('person@example.com');
  await page.getByRole('button', { name: 'Отправить письмо' }).click();
  await page.getByLabel('Код или ссылка из письма').fill('123456');
  await page.getByLabel('Новый пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Повторите новый пароль').fill('different password');
  await page.getByRole('button', { name: 'Сохранить новый пароль' }).click();
  await expect(page.getByRole('alert')).toHaveText('Пароли не совпадают.');
  await page.getByLabel('Повторите новый пароль').fill(PASSWORD);
  await assertResponsivePage(page, info.project.name);
  await page.screenshot({
    path: info.outputPath(`account-reset-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Сохранить новый пароль' }).click();
  await expect(page.getByRole('button', { name: 'Сохранить новый пароль' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Войти в LifeOS' })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toContainText(
    'Пароль изменён. Войдите с новым паролем.',
  );
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
  expect(issues).toEqual([]);
});

test('shows reauthentication and device recovery without claiming completed sync', async ({
  page,
}, info) => {
  const issues = observeRuntimeIssues(page);
  await page.goto('/tests/fixtures/account-sync.html?state=sign-in-required');
  await expect(page.getByText('Нужно войти', { exact: true })).toBeVisible();
  await page.getByLabel('Пароль', { exact: true }).fill('old8');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Восстановите доступ', { exact: true })).toBeVisible();
  await expect(page.getByText('Ожидают отправки: 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Синхронизировать сейчас' })).toHaveCount(0);
  await assertResponsivePage(page, info.project.name);
  await page.screenshot({
    path: info.outputPath(`account-reconnect-${info.project.name}.png`),
    fullPage: true,
  });
  await page.goto('/tests/fixtures/account-sync.html?state=unavailable');
  await expect(page.getByText('Синхронизация доступна только в приложении LifeOS.')).toBeVisible();
  await expect(page.getByLabel('Электронная почта')).toHaveCount(0);
  expect(issues).toEqual([]);
});

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

  await page.getByRole('button', { name: 'Показать ключ восстановления' }).click();
  await expect(page.getByLabel('Ключ восстановления')).toHaveText(RECOVERY);
  await assertResponsivePage(page, info.project.name);
  await page.screenshot({
    path: info.outputPath(`account-recovery-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Скопировать ключ' }).click();
  await expect(page.locator('[aria-live="polite"]')).toContainText(
    'Ключ восстановления скопирован',
  );
  await page.getByRole('button', { name: 'Скрыть ключ' }).click();
  expect(await page.locator('body').textContent()).not.toContain(RECOVERY);

  await page.getByRole('button', { name: 'Синхронизировать сейчас' }).click();
  await expect(page.getByText('Офлайн — изменения ожидают отправки')).toBeVisible();
  await expect(page.getByText('Ожидают отправки: 2')).toBeVisible();
  await expect(page.getByText('Синхронизация завершена.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Синхронизировано и защищено')).toHaveCount(0);
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
  await expect(page.getByText(/Чтобы подключить другой компьютер/)).toBeVisible();
  const syncButton = page.getByRole('button', { name: 'Синхронизировать сейчас' });
  await syncButton.click();
  await expect(page.getByText('Синхронизация завершена.', { exact: true })).toHaveCount(0);
  await syncButton.click();
  await expect(page.getByText('Обмен данными не завершён. Повторите синхронизацию.')).toBeVisible();
  await expect(page.getByText('Синхронизация завершена.', { exact: true })).toHaveCount(0);
  await syncButton.click();
  await expect(
    page.getByText('Не все данные согласованы. Проверьте состояние синхронизации.'),
  ).toBeVisible();
  await expect(page.getByText('Синхронизация завершена.', { exact: true })).toHaveCount(0);
  await syncButton.click();
  await expect(page.getByText('Синхронизация завершена.', { exact: true })).toBeVisible();
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
