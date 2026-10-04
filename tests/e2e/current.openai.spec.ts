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

test('contextual helper previews data, sends on submit and saves only on confirmation', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/openai.html?contextual');
  await page.getByRole('button', { name: 'Спросить помощника о разделе' }).click();
  await expect(page.getByText('Что отправится с вопросом')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-requests', /.+/);
  await page.getByText('Посмотреть данные').click();
  await expect(page.getByText('Прогулка', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Ваш вопрос' }).fill('Что видно за неделю?');
  await page.getByRole('button', { name: 'Спросить', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-section', 'analytics');
  await expect(page.getByLabel('Ответ помощника')).toContainText('<script>unsafe</script>');
  await page.getByRole('button', { name: 'Сохранить мысль во Входящие' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-saved', /.+/);
  await page.getByRole('button', { name: 'Сохранить во Входящие' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-saved', 'Что видно за неделю?');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('opens daily analytics evidence from the assistant answer', async ({ page }) => {
  for (const [title, expectedRoute] of [
    ['Дневник: 2026-10-02', { view: 'diary', period: 'day', date: '2026-10-02' }],
    ['Подготовка ко сну 2026-10-02', { view: 'sleep' }],
  ] as const) {
    await page.goto('/tests/fixtures/openai.html?contextual');
    await page.getByRole('button', { name: 'Спросить помощника о разделе' }).click();
    await page.getByRole('textbox', { name: 'Ваш вопрос' }).fill('Что видно по источникам?');
    await page.getByRole('button', { name: 'Спросить', exact: true }).click();
    await page.getByText('Переданные источники').click();
    await page.getByRole('button', { name: title }).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', JSON.stringify(expectedRoute));
  }
});

test('what-if compares locally and asks AI only after explicit confirmation', async ({ page }) => {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  await page.goto('/tests/fixtures/openai.html?whatif');
  await page.getByRole('button', { name: 'Что будет, если?' }).click();
  await page.locator('#what-if-title-a').fill('Поиграть');
  await page.locator('#what-if-minutes-a').fill('60');
  await page.locator('#what-if-title-b').fill('Сделать задачу');
  await page.locator('#what-if-minutes-b').fill('25');
  await page.getByRole('button', { name: 'Сравнить варианты' }).click();
  await expect(page.getByLabel('Сравнение вариантов')).toBeVisible();
  await expect(page.getByLabel('Вариант А')).toContainText('Поиграть');
  await expect(page.getByLabel('Вариант Б')).toContainText('Сделать задачу');
  await expect(page.getByText('Сон не настроен — влияние на него неизвестно.')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-requests', /.+/);
  await page.getByText('Посмотреть данные').click();
  await expect(page.getByText(/оба варианта начинаются сейчас/)).toBeVisible();
  await page.getByRole('button', { name: 'Получить пояснение ИИ' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-requests', '1');
  await expect(page.locator('html')).toHaveAttribute('data-section', 'today');
  await expect(page.getByLabel('Пояснение ИИ')).toContainText('<script>unsafe</script>');
  await expect(page.locator('html')).not.toHaveAttribute('data-saved', /.+/);
  await page.locator('#what-if-minutes-a').fill('35');
  await expect(page.getByLabel('Сравнение вариантов')).toHaveCount(0);
  await expect(page.getByLabel('Пояснение ИИ')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(issues).toEqual([]);
});

for (const route of ['today', 'actions', 'diary', 'analytics']) {
  test(`shared helper is available on ${route}`, async ({ page }) => {
    await page.goto(`/#/v2/${route}`);
    await expect(page.getByRole('button', { name: 'Спросить помощника о разделе' })).toBeVisible();
  });
}
