import { expect, test } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`motion ${reducedMotion}: editing, feedback and disclosures remain usable`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion });
    await page.goto('/#/v2/today');
    await page.getByRole('button', { name: 'Создать с параметрами', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Новое действие' });
    const title = panel.getByLabel('Название', { exact: true });
    await expect(title).toBeFocused();
    await title.fill('Черновик при открытии панели');
    // The fixed resize handle must retain viewport coordinates throughout entrance.
    await expect(panel).toHaveCSS('transform', 'none');
    if (reducedMotion === 'reduce') {
      await expect(panel).toHaveCSS('animation-name', 'none');
      await expect(panel.locator('.planner-form')).toHaveCSS('animation-name', 'none');
      await expect(panel).toHaveCSS('opacity', '1');
      expect(await panel.evaluate((e) => getComputedStyle(e, '::backdrop').animationName)).toBe(
        'none',
      );
    } else {
      await expect(panel).not.toHaveCSS('animation-name', 'none');
      await expect(panel.locator('.planner-form')).not.toHaveCSS('animation-name', 'none');
      const seconds = await panel.evaluate((e) =>
        Number.parseFloat(getComputedStyle(e).animationDuration),
      );
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(0.32);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.locator('#planner-main-content')).toBeFocused();

    const quickTitle = page.getByRole('textbox', { name: 'Новое действие на сегодня' });
    await quickTitle.fill('Проверка отклика');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    const notice = page.locator('.planner-notice');
    await expect(notice).toContainText('Действие добавлено на сегодня');
    await expect(notice).toHaveCSS('opacity', '1');
    const noticeBox = await notice.boundingBox();
    expect(noticeBox!.x).toBeGreaterThanOrEqual(0);
    expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.getByRole('checkbox', { name: 'Выполнить: Проверка отклика', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Итог задачи', exact: true })
      .getByRole('button', { name: 'Пропустить', exact: true })
      .click();
    await expect(page.getByRole('progressbar', { name: 'Прогресс дня' })).toHaveAttribute(
      'value',
      '100',
    );
    await page.locator('.planner-completed > summary').click();
    await expect(
      page.getByRole('checkbox', { name: 'Выполнить: Проверка отклика', exact: true }),
    ).toBeChecked();
    // Idle UI must settle completely; motion cannot leave hidden or constantly moving content.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.getAnimations().filter((a) => a.playState === 'running').length,
        ),
      )
      .toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('motion responds immediately when the system reduces movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#/v2/goals');
  await page.getByRole('button', { name: 'Новая цель', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Новая цель' });
  const title = panel.getByLabel('Название', { exact: true });
  await title.fill('Сохранённый в форме текст');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(title).toHaveValue('Сохранённый в форме текст');
  await expect(title).toBeFocused();
  await expect(panel.locator('.planner-form')).toHaveCSS('transform', 'none');
  await expect(panel.locator('.planner-form')).toHaveCSS('animation-name', 'none');
  await expect(panel).toHaveCSS('opacity', '1');
  const primary = panel.getByRole('button', { name: 'Создать цель', exact: true });
  await primary.focus();
  await page.keyboard.down('Space');
  await expect(primary).toHaveCSS('transform', 'none');
  await title.focus();
  await page.keyboard.up('Space');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
