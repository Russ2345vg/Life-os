import { expect, test, type Page } from '@playwright/test';
import { installSpeech, speech } from './helpers/voiceFake';

async function open(page: Page) {
  await page.getByRole('button', { name: 'Голосовые команды', exact: true }).click();
  return page.getByRole('dialog', { name: 'Голосовые команды' });
}
async function say(page: Page, index: number, text: string) {
  const dialog = page.getByRole('dialog', { name: 'Голосовые команды' });
  await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  await speech(page, 'result', index, text);
  await speech(page, 'end', index);
}
test.beforeEach(async ({ page }) => {
  await installSpeech(page);
  await page.clock.setFixedTime(new Date('2026-09-08T03:00:00Z'));
  await page.goto('/');
});

test('punctuated task command preserves the whole title and waits for confirmation', async ({
  page,
}) => {
  const title = 'распланировать съем квартиры и разобраться в юридических вопросах';
  let dialog = await open(page);
  await say(page, 0, `Добавить задачу, ${title}.`);
  await expect(dialog.getByRole('heading', { name: 'Создать задачу?' })).toBeVisible();
  await expect(dialog).toContainText(title);
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  dialog = await open(page);
  await say(page, 1, 'Покажи мои задачи на сегодня');
  await expect(dialog).toContainText('Ничего не найдено');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  dialog = await open(page);
  await dialog.getByLabel('Текст команды').fill(`Добавить задачу, ${title}.`);
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toContainText('Задача создана');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  dialog = await open(page);
  await say(page, 2, 'Покажи мои задачи на сегодня');
  const items = dialog.getByRole('region', { name: 'Результаты запроса' }).getByRole('listitem');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText(title);
});

test('natural speech retains time and title through voice clarification, explicit omission and query', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let dialog = await open(page);
  await say(page, 0, 'Завтра вечером мне надо купить продукты');
  await expect(dialog.getByRole('region', { name: 'Уточнение команды' })).toContainText(
    'точное время',
  );
  await say(page, 1, 'В 11 утра');
  await expect(dialog).toContainText('Время 11:00 распознано');
  await expect(dialog.getByLabel('Текст команды')).toHaveValue(
    'Завтра вечером мне надо купить продукты',
  );
  await expect(dialog.getByRole('button', { name: 'Создать', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('stage3-time-clarification.png') });
  await dialog.getByRole('button', { name: 'Продолжить без времени' }).click();
  await expect(dialog.getByRole('heading', { name: 'Создать задачу?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(dialog).toContainText('Задача создана');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  dialog = await open(page);
  await say(page, 2, 'Что у меня запланировано на завтра?');
  await expect(dialog.getByRole('region', { name: 'Результаты запроса' })).toContainText(
    'купить продукты',
  );
  await expect(dialog).toContainText('2026-09-09');
  await page.screenshot({ path: info.outputPath('stage3-read-result.png') });
  expect(errors).toEqual([]);
});

test('goal deadline requires explicit omission and cancellation clears the draft', async ({
  page,
}, info) => {
  let dialog = await open(page);
  await say(page, 0, 'Создай цель накопить 300 тысяч до первого декабря');
  await expect(dialog).toContainText('2026-12-01');
  await dialog.getByRole('button', { name: 'Продолжить без срока' }).click();
  await expect(dialog.getByRole('heading', { name: 'Создать цель?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  dialog = await open(page);
  await expect(dialog.getByLabel('Текст команды')).toHaveValue('');
  await say(page, 1, 'Завтра в десять мне надо купить продукты');
  await expect(dialog).toContainText('Время 10:00 распознано');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  dialog = await open(page);
  await say(page, 2, 'Покажи активные цели');
  await expect(dialog).toContainText('Ничего не найдено');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  dialog = await open(page);
  await say(page, 3, 'Открой дневник');
  await expect(dialog).toContainText('Открыт раздел «Дневник»');
  await page.screenshot({ path: info.outputPath('stage3-navigation.png') });
});

test('ambiguous move requires target selection, previews before and after, and persists one move', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const date of ['сегодня', 'завтра']) {
    const dialog = await open(page);
    await dialog.getByLabel('Текст команды').fill(`Мне нужно купить продукты ${date}`);
    await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
    await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(dialog).toContainText('Задача создана');
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  }
  let dialog = await open(page);
  await say(page, 0, 'Перенеси задачу купить продукты на пятницу');
  await expect(dialog).toContainText('Укажите причину переноса');
  await dialog.getByLabel('Ответ на уточнение').fill('Магазин закрыт');
  await dialog.getByRole('button', { name: 'Продолжить', exact: true }).click();
  const selection = dialog.getByRole('region', { name: 'Выбор задачи' });
  await expect(selection.getByRole('button')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Изменить', exact: true })).toHaveCount(0);
  for (const width of [1600, 1280, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    for (const button of await selection.getByRole('button').all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`stage3-choice-${width}.png`) });
  }
  await selection.getByRole('button', { name: 'купить продукты 2026-09-09' }).click();
  await expect(dialog).toContainText('Было: 2026-09-09');
  await expect(dialog).toContainText('Станет: 2026-09-11');
  await page.screenshot({ path: info.outputPath('stage3-move-preview.png') });
  await dialog.getByRole('button', { name: 'Изменить', exact: true }).focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(dialog).toContainText('Задача перенесена');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  dialog = await open(page);
  await dialog.getByLabel('Текст команды').fill('Покажи мои задачи на пятницу');
  await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  await expect(
    dialog.getByRole('region', { name: 'Результаты запроса' }).getByRole('listitem'),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('successive questions clear the previous answer and cancellation prevents a move', async ({
  page,
}) => {
  const dialog = await open(page);
  await say(page, 0, 'Перенеси встречу');
  await expect(dialog).toContainText('На какую дату перенести задачу');
  await dialog.getByLabel('Ответ на уточнение').fill('завтра');
  await dialog.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(dialog).toContainText('Укажите причину переноса');
  await expect(dialog.getByLabel('Ответ на уточнение')).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
