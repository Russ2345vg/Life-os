import { expect, test, type Page } from '@playwright/test';

const SIDEBAR_PREFERENCE_STORAGE_KEY = 'lifeos.sidebar-collapsed.v1';

function observeRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      if (location.url.endsWith('/favicon.ico')) {
        return;
      }
      issues.push(`console: ${message.text()}${location.url === '' ? '' : ` (${location.url})`}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      issues.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  return issues;
}

test('loads LifeOS and navigates between primary sections without runtime errors', async ({
  page,
}, testInfo) => {
  const runtimeIssues = observeRuntimeIssues(page);
  const mobile = testInfo.project.name === 'mobile-chrome';
  const navigationName = mobile ? 'Мобильная навигация' : 'Основные разделы';
  const sectionLabels = mobile
    ? ['День', 'Действия', 'История', 'Ещё']
    : ['День', 'Решения', 'Действия', 'Распорядок', 'Сферы', 'История', 'Ещё'];

  await page.goto('/');

  await expect(page.getByText('LifeOS').first()).toBeVisible();
  const navigation = page.getByRole('navigation', { name: navigationName });
  await expect(navigation).toBeVisible();

  for (const label of sectionLabels) {
    const sectionButton = navigation.getByRole('button', { name: label, exact: true });
    await sectionButton.click();
    await expect(sectionButton).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#application-content')).not.toBeEmpty();
  }

  expect(runtimeIssues).toEqual([]);
});

test('preserves the desktop sidebar preference after reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chrome', 'The sidebar control is desktop-only.');
  const runtimeIssues = observeRuntimeIssues(page);

  await page.goto('/');

  await page.getByRole('button', { name: 'Свернуть боковое меню' }).click();
  await expect(page.getByRole('button', { name: 'Развернуть боковое меню' })).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), SIDEBAR_PREFERENCE_STORAGE_KEY))
    .toBe('true');

  await page.reload();

  await expect(page.getByRole('button', { name: 'Развернуть боковое меню' })).toBeVisible();
  expect(runtimeIssues).toEqual([]);
});
