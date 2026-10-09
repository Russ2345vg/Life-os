import { expect, test } from '@playwright/test';

test('questions preserve the draft, focus the note and persist as an ordinary thought', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Новая мысль', exact: true });
  await note.fill('Уже записанная мысль');
  const prompts = page.locator('.walk-note-prompts');
  await expect(prompts).not.toHaveAttribute('open');
  await prompts.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(prompts).toHaveAttribute('open');
  await expect(page.getByLabel('Тема размышления').getByRole('option')).toHaveCount(6);
  await expect(prompts).toContainText('Вопрос 1 из 6');
  await expect(page.getByRole('button', { name: 'Предыдущий вопрос', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click();
  await expect(prompts).toContainText('Вопрос 2 из 6');
  await page.getByLabel('Тема размышления').selectOption('ideas');
  await expect(prompts).toContainText('Вопрос 1 из 6');
  await expect(note).toHaveValue('Уже записанная мысль');
  const question = await prompts.locator('.walk-note-question').innerText();
  await page.getByRole('button', { name: 'Добавить вопрос в заметку', exact: true }).click();
  await expect(note).toHaveValue(`Уже записанная мысль\n\n${question}\n`);
  await expect(note).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Добавить вопрос в заметку', exact: true }),
  ).toBeDisabled();
  const styles = await page.locator('.walk-side').evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      color: css.color,
      background: css.backgroundColor,
      font: css.fontFamily,
      padding: css.padding,
      width: element.getBoundingClientRect().width,
    };
  });
  const touchHeights = await prompts
    .locator('button, select, summary')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(touchHeights.every((height) => height >= 44)).toBe(true);
  await info.attach('computed-styles', {
    body: JSON.stringify({ styles, touchHeights }),
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('walk-notes-expanded.png'), fullPage: true });
  await prompts.screenshot({ path: info.outputPath('walk-note-questions.png') });
  const text = `Уже записанная мысль\n\n${question}\nПроверить идею маленьким экспериментом`;
  await note.fill(text);
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  await expect(note).toHaveValue('');
  await expect(page.locator('.walk-notes p')).toHaveText(text);
  await page.reload();
  await expect(page.locator('.walk-notes p')).toHaveText(text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('question navigation is bounded and a full draft is never truncated', async ({ page }) => {
  await page.goto('/#/v2/walks');
  await page.getByRole('button', { name: 'Начать прогулку', exact: true }).click();
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.getByText('Вопросы для заметки', { exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Новая мысль', exact: true });
  const fullDraft = 'я'.repeat(500);
  await note.fill(fullDraft);
  await expect(
    page.getByRole('button', { name: 'Добавить вопрос в заметку', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Не хватает места для вопроса');
  const topics = ['day', 'self', 'priorities', 'relationships', 'ideas', 'choice'];
  for (const topic of topics) {
    await page.getByLabel('Тема размышления').selectOption(topic);
    await expect(page.locator('.walk-note-prompts')).toContainText('Вопрос 1 из 6');
    await expect(note).toHaveValue(fullDraft);
    await expect(
      page.getByRole('button', { name: 'Добавить вопрос в заметку', exact: true }),
    ).toBeDisabled();
  }
  for (let index = 1; index < 6; index++) {
    await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click();
  }
  await expect(page.locator('.walk-note-prompts')).toContainText('Вопрос 6 из 6');
  await expect(page.getByRole('button', { name: 'Следующий вопрос', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Предыдущий вопрос', exact: true }).click();
  await expect(page.locator('.walk-note-prompts')).toContainText('Вопрос 5 из 6');
  await page.getByText('Вопросы для заметки', { exact: true }).click();
  await expect(note).toHaveValue(fullDraft);
  await note.fill('Свободная заметка без вопросов');
  await page.getByRole('button', { name: 'Сохранить мысль', exact: true }).click();
  await expect(page.locator('.walk-notes p')).toHaveText('Свободная заметка без вопросов');
});
