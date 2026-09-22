import { expect, test, type Page } from '@playwright/test';

import { installSpeech, speech, type VoiceTest } from './helpers/voiceFake';

async function openForm(page: Page) {
  await page.goto('/#/v2/goals/new');
  await expect(page.locator('#planner-goal-title')).toBeVisible();
}

test('textarea counter stays below voice feedback and multi-phrase text reaches the field', async ({
  page,
}) => {
  await installSpeech(page);
  await page.goto('/tests/fixtures/voice-input.html');
  await page.locator('button[aria-controls="fixture-note"]').click();
  await speech(page, 'error', 0);
  const feedback = await page.locator('#fixture-note-voice-message').boundingBox();
  const counter = await page.locator('.voice-textarea-shell > small').boundingBox();
  expect(counter!.y).toBeGreaterThanOrEqual(feedback!.y + feedback!.height);
  await page.locator('button[aria-controls="fixture-note"]').click();
  await speech(page, 'result', 1, 'Заметка голосом');
  await speech(page, 'end', 1);
  await expect(page.locator('#fixture-note')).toHaveValue('Заметка голосом');
  await expect(page.getByRole('searchbox')).toHaveValue('Заметка голосом');
});

test('shared fields preserve implicit labels, latest draft, same-text caret, limits, refs and disabled cleanup', async ({
  page,
}) => {
  await installSpeech(page);
  await page.goto('/tests/fixtures/voice-input.html');
  const title = page.locator('#fixture-title');
  const mic = page.locator('button[aria-controls="fixture-title"]');
  await expect(title).toHaveAccessibleName('Название');
  await title.fill('Сегодня я');
  await mic.click();
  await title.press('End');
  await title.pressSequentially(' иду');
  await speech(page, 'result', 0, 'домой');
  await speech(page, 'end', 0);
  await expect(title).toHaveValue('Сегодня я иду домой');
  await title.fill('мир');
  await title.selectText();
  await mic.click();
  await speech(page, 'result', 1, 'мир');
  await speech(page, 'end', 1);
  await expect(title).toBeFocused({ timeout: 300 });
  expect(await title.evaluate((node: HTMLInputElement) => node.selectionStart)).toBe(3);
  await title.fill('x'.repeat(30));
  await mic.click();
  await speech(page, 'result', 2, 'дополнение');
  await speech(page, 'end', 2);
  await expect(title).toHaveValue('x'.repeat(30));
  await expect(page.locator('#fixture-title-voice-message')).toContainText('лимит');
  await page.getByRole('button', { name: 'Очистить', exact: true }).click();
  await mic.click();
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { voiceTest: VoiceTest }).voiceTest.instances[3]!.aborted,
    ),
  ).toBe(true);
  await speech(page, 'result', 3, 'поздний текст');
  await speech(page, 'end', 3);
  await expect(title).toHaveValue('');
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await page.getByRole('button', { name: 'Focus via ref' }).click();
  await expect(title).toBeFocused();
  await mic.click();
  await page.getByRole('button', { name: 'Toggle mount' }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { voiceTest: VoiceTest }).voiceTest.instances[4]!.aborted,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Toggle mount' }).click();
  await mic.click();
  await speech(page, 'result', 5, 'После повторного открытия');
  await speech(page, 'end', 5);
  await expect(title).toHaveValue('После повторного открытия');
  await expect(page.getByLabel('Submits')).toHaveText('0');
});

test('dictation preserves selection, updates the controlled goal draft, stops and never submits', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installSpeech(page);
  await openForm(page);
  const title = page.locator('#planner-goal-title');
  const mic = page.locator('button[aria-controls="planner-goal-title"]');
  await expect(title).toHaveAccessibleName('Название');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { voiceTest: VoiceTest }).voiceTest.instances.length,
      ),
    )
    .toBe(0);
  await mic.focus();
  await page.keyboard.press('Enter');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await speech(page, 'result', 0, 'Это проверка голосового ввода');
  await expect(title).toHaveValue('');
  await mic.click();
  await expect(mic).toBeDisabled();
  await speech(page, 'end', 0);
  await expect(title).toHaveValue('Это проверка голосового ввода');
  await expect(title).toBeFocused();
  await title.fill('Сегодня я пойду домой');
  await title.evaluate((node: HTMLInputElement) => node.setSelectionRange(9, 9));
  await mic.click();
  await speech(page, 'result', 1, 'после работы');
  await speech(page, 'end', 1);
  await expect(title).toHaveValue('Сегодня я после работы пойду домой');
  expect(await title.evaluate((node: HTMLInputElement) => node.selectionStart)).toBe(22);
  await title.evaluate((node: HTMLInputElement) => node.setSelectionRange(23, 28));
  await mic.click();
  await speech(page, 'result', 2, 'поеду');
  await speech(page, 'end', 2);
  await expect(title).toHaveValue('Сегодня я после работы поеду домой');
  await expect(page.locator('.planner-form')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('voice-goal-form.png'), fullPage: true });
});

test('switch, permission denial, manual editing, Escape and unmount release one owner', async ({
  page,
}) => {
  await installSpeech(page);
  await openForm(page);
  await page.getByText('Дополнительно', { exact: true }).click();
  const title = page.locator('#planner-goal-title');
  const first = page.locator('button[aria-controls="planner-goal-title"]');
  const second = page.locator('button[aria-controls="planner-goal-why-important"]');
  await title.fill('Сохранённый текст');
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  expect(
    await page.evaluate(
      () => (window as unknown as { voiceTest: VoiceTest }).voiceTest.instances[0]!.aborted,
    ),
  ).toBe(true);
  await speech(page, 'result', 0, 'Чужой результат');
  await speech(page, 'end', 0);
  await speech(page, 'error', 1);
  await expect(page.locator('#planner-goal-why-important-voice-message')).toContainText(
    'Доступ к микрофону запрещён',
  );
  await expect(title).toHaveValue('Сохранённый текст');
  await page.locator('#planner-goal-why-important').fill('Пишу вручную');
  await expect(page.locator('#planner-goal-why-important-voice-message')).toBeEmpty();
  await first.click();
  await title.focus();
  await page.keyboard.press('Escape');
  await expect(title).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { voiceTest: VoiceTest }).voiceTest.instances[2]!.aborted,
    ),
  ).toBe(true);
});

test('unsupported remains discoverable and keyboard editing plus validation work', async ({
  page,
}) => {
  await installSpeech(page, false);
  await openForm(page);
  const mic = page.locator('button[aria-controls="planner-goal-title"]');
  await expect(mic).toHaveAttribute('aria-disabled', 'true');
  await mic.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#planner-goal-title')).toHaveValue('');
  await page.locator('.planner-form button[type="submit"]').click();
  await expect(page.locator('#planner-goal-title')).toBeFocused();
  expect(
    await page
      .locator('#planner-goal-title')
      .evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(false);
  await page.locator('#planner-goal-title').fill('Новая цель');
  await expect(page.locator('#planner-goal-title')).toHaveValue('Новая цель');
});

test('desktop and mobile reserve action space, touch targets and reduced motion', async ({
  page,
}, testInfo) => {
  await installSpeech(page);
  await openForm(page);
  for (const [width, height] of testInfo.project.name.startsWith('mobile')
    ? [
        [390, 844],
        [360, 800],
      ]
    : [
        [1600, 900],
        [1280, 720],
      ]) {
    await page.setViewportSize({ width: width!, height: height! });
    const bounds = await page.locator('.voice-text-control-row').evaluateAll((rows) =>
      rows.map((row) => {
        const input = row.querySelector('input,textarea')!.getBoundingClientRect();
        const button = row.querySelector('button')!.getBoundingClientRect();
        return {
          right: input.right,
          left: button.left,
          width: button.width,
          height: button.height,
        };
      }),
    );
    for (const bound of bounds) {
      expect(bound.right).toBeLessThanOrEqual(bound.left);
      expect(bound.width).toBeGreaterThanOrEqual(44);
      expect(bound.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`voice-${width}.png`), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('button[aria-controls="planner-goal-title"]').click();
  expect(
    await page
      .locator('button[aria-controls="planner-goal-title"] svg')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
});
