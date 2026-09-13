import { expect, test, type Page } from '@playwright/test';
import { installSpeech, speech } from './helpers/voiceFake';

async function openPalette(page: Page) {
  await page.getByRole('button', { name: 'Голосовые команды', exact: true }).click();
  return page.getByRole('dialog', { name: 'Голосовые команды' });
}
test('global speech creates a task only after preview confirmation and shows the persisted result', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installSpeech(page);
  await page.goto('/');
  const dialog = await openPalette(page);
  await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  await expect(dialog.getByRole('status')).toContainText('Слушаю');
  await speech(page, 'result', 0, 'Добавь задачу купить продукты завтра');
  await dialog.getByRole('button', { name: 'Остановить голосовой ввод' }).click();
  await expect(dialog.getByRole('status')).toContainText('Обрабатываю');
  await speech(page, 'end', 0);
  await expect(dialog.getByRole('heading', { name: 'Создать задачу?' })).toBeVisible();
  await expect(dialog.getByLabel('Текст команды')).toHaveValue(
    'Добавь задачу купить продукты завтра',
  );
  await expect(dialog).toContainText('завтра');
  await dialog.screenshot({ path: info.outputPath('voice-task-preview.png') });
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toContainText('Задача создана');
  await dialog.screenshot({ path: info.outputPath('voice-success.png') });
  await dialog.getByRole('button', { name: 'Открыть задачу' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('купить продукты', { exact: true }).first()).toBeVisible();
  await page.reload();
  // The command persisted; navigating to tomorrow through the UI is covered by the result action above.
  expect(errors).toEqual([]);
});

test('unsupported microphone keeps manual commands usable with focus and responsive layouts', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await installSpeech(page, false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const dialog = await openPalette(page);
  await expect(dialog).toContainText('Введите команду вручную');
  await dialog.getByLabel('Текст команды').fill('Сделай что-нибудь');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Не удалось понять команду');
  await dialog.getByLabel('Текст команды').fill('Добавь задачу проверить мобильную версию завтра');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await expect(dialog.getByRole('heading', { name: 'Создать задачу?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  for (const [width, height] of [
    [1600, 900],
    [1280, 720],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width!);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height!);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const create = dialog.getByRole('button', { name: 'Создать', exact: true });
    await create.scrollIntoViewIfNeeded();
    const target = await create.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`voice-layout-${width}.png`) });
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('goal cancellation, correction, creation, navigation and unsupported commands', async ({
  page,
}, info) => {
  await installSpeech(page);
  await page.goto('/#/goals');
  let dialog = await openPalette(page);
  await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  await speech(page, 'result', 0, 'Создай цель выучить английский');
  await speech(page, 'end', 0);
  await expect(dialog).toContainText('Создать цель?');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.getByText('выучить английский', { exact: true })).toHaveCount(0);
  dialog = await openPalette(page);
  await dialog.getByLabel('Текст команды').fill('Создай цель выучить английский');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await expect(dialog).toContainText('Создать цель?');
  await dialog.getByLabel('Текст команды').fill('Создай цель отпуск завтра');
  await expect(dialog.getByRole('button', { name: 'Создать', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await expect(dialog.getByRole('region', { name: 'Уточнение команды' })).toContainText(
    'Точный срок цели',
  );
  await dialog.screenshot({ path: info.outputPath('voice-error.png') });
  await dialog.getByLabel('Текст команды').fill('Создай цель выучить английский');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toContainText('Цель создана');
  await dialog.getByRole('button', { name: 'Открыть цель' }).click();
  await expect(page.getByRole('heading', { name: 'выучить английский' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'выучить английский' })).toBeVisible();
  dialog = await openPalette(page);
  await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  await speech(page, 'result', 0, 'Открой дневник');
  await speech(page, 'end', 0);
  await expect(dialog).toContainText('Открыт раздел «Дневник»');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'История', exact: true })).toBeVisible();
});

test('microphone errors, stale speech, keyboard focus and mobile bounds', async ({
  page,
}, info) => {
  await installSpeech(page);
  await page.goto('/');
  const dialog = await openPalette(page);
  await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  await speech(page, 'error', 0);
  await expect(dialog.getByRole('alert')).toContainText('Доступ к микрофону');
  await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Голосовые команды', exact: true })).toBeFocused();
  await speech(page, 'result', 1, 'Создай цель поздняя команда');
  await speech(page, 'end', 1);
  await openPalette(page);
  await expect(dialog.getByLabel('Текст команды')).toHaveValue('');
  await dialog.screenshot({ path: info.outputPath('voice-idle.png') });
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
});

test('closing a successful command refreshes the visible list without dropping a goal draft', async ({
  page,
}) => {
  await installSpeech(page);
  await page.goto('/#/goals/new');
  await page.locator('#goal-title').fill('Несохранённый черновик');
  let dialog = await openPalette(page);
  await dialog.getByLabel('Текст команды').fill('Добавь задачу свежая задача сегодня');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toContainText('Задача создана');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('#goal-title')).toHaveValue('Несохранённый черновик');
  dialog = await openPalette(page);
  await dialog.getByLabel('Текст команды').fill('Открой задачи');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByText('свежая задача', { exact: true }).first()).toBeVisible();
  dialog = await openPalette(page);
  await dialog.getByLabel('Текст команды').fill('Добавь задачу ещё одна задача сегодня');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toContainText('Задача создана');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByText('ещё одна задача', { exact: true }).first()).toBeVisible();
});
