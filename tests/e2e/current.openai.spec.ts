import { expect, test } from '@playwright/test';

test('asks an explicit question, renders plain text and fits the viewport', async ({
  page,
}, info) => {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') issues.push(entry.text());
  });
  await page.goto('/tests/fixtures/openai.html');
  const question = page.getByRole('textbox', { name: 'Вопрос для OpenAI' });
  await question.fill('Как начать день?');
  await question.focus();
  await page.keyboard.press('Tab');
  // Voice is unavailable in this fixture; the submit remains reachable by keyboard.
  await page.getByRole('button', { name: 'Получить ответ' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Ответ OpenAI')).toContainText('<script>unsafe</script>');
  await expect(page.locator('html')).toHaveAttribute('data-requests', '1');
  await expect(page.locator('html')).toHaveAttribute('data-question', 'Как начать день?');
  await expect(question).toHaveValue('Как начать день?');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath(`openai-${info.project.name}.png`),
    fullPage: true,
  });
  expect(issues).toEqual([]);
});

test('keeps input on failure and permits retry', async ({ page }) => {
  await page.goto('/tests/fixtures/openai.html?mode=error');
  await page.getByRole('textbox', { name: 'Вопрос для OpenAI' }).fill('Вопрос');
  await page.getByRole('button', { name: 'Получить ответ' }).click();
  await expect(page.getByRole('alert')).toContainText('Лимит OpenAI');
  await expect(page.getByRole('textbox')).toHaveValue('Вопрос');
  await page.getByRole('button', { name: 'Получить ответ' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-requests', '2');
});

test('blocks duplicate submits and allows cancelling a pending request', async ({ page }) => {
  await page.goto('/tests/fixtures/openai.html?mode=pending');
  await page.getByRole('textbox', { name: 'Вопрос для OpenAI' }).fill('Вопрос');
  await page.getByRole('button', { name: 'Получить ответ' }).click();
  await expect(page.getByRole('button', { name: 'Получить ответ' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('готовит ответ');
  await page.getByRole('button', { name: 'Отменить запрос' }).click();
  await expect(page.getByRole('alert')).toContainText('Запрос отменён');
  await expect(page.getByRole('textbox')).toHaveValue('Вопрос');
  await expect(page.getByRole('button', { name: 'Получить ответ' })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-requests', '1');
});

test('default browser build shows the actual connection availability', async ({ page }) => {
  await page.goto('/#/v2/account');
  await expect(page.getByRole('heading', { name: 'Помощник OpenAI' })).toBeVisible();
  await expect(page.getByText(/Подключение OpenAI ещё не настроено/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Получить ответ' })).toHaveCount(0);
});
