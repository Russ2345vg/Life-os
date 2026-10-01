import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const channels =
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    if (channels.length !== 3) throw new Error(`Expected opaque RGB color: ${value}`);
    const [red, green, blue] = channels.map((channel) => {
      const unit = channel / 255;
      return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function clickDataStatusEntry(page: Page) {
  if (page.viewportSize()!.width <= 760) {
    const menu = page.locator('#planner-more-menu');
    if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Ещё' }).click();
    await expect(menu.locator('a').first()).toHaveText('Состояние данных');
    await expect(menu.locator('a[href="#/v2/account"]')).toHaveCount(1);
    await menu.getByRole('link', { name: 'Состояние данных' }).click();
  } else {
    const link = page.locator('.planner-sidebar > .planner-data-status-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '#/v2/account');
    await link.click();
  }
}

async function openDataStatus(page: Page) {
  await clickDataStatusEntry(page);
  await expect(page).toHaveURL(/#\/v2\/account$/);
  await expect(page.getByRole('heading', { name: 'Аккаунт и синхронизация' })).toBeVisible();
}

test('data status is discoverable and returns to the source route', async ({ page }) => {
  await page.goto('/#/v2/today?day=tomorrow');
  await expect(page.getByRole('heading', { name: 'Завтра', exact: true })).toBeVisible();
  await openDataStatus(page);
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  await expect(page).toHaveURL(/#\/v2\/today\?day=tomorrow$/);

  await page.goto('/#/v2/diary?period=day&date=2026-09-22');
  await openDataStatus(page);
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  await expect(page).toHaveURL(/#\/v2\/diary\?period=day&date=2026-09-22$/);

  await page.goto('/#/v2/actions?view=time');
  await openDataStatus(page);
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  await expect(page).toHaveURL(/#\/v2\/actions\?view=time$/);
});

test('direct entry, reload and browser history use a safe return target', async ({ page }) => {
  await page.goto('/#/v2/account');
  await expect(page.getByRole('button', { name: 'К плану дня' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'К плану дня' }).click();
  await expect(page).toHaveURL(/#\/v2\/today$/);

  await openDataStatus(page);
  await page.goBack();
  await expect(page).toHaveURL(/#\/v2\/today$/);
  await page.goForward();
  await expect(page.getByRole('button', { name: 'К плану дня' })).toBeVisible();
});

test('an unfinished account form can refuse the return without losing its source', async ({
  page,
}, info) => {
  await page.goto('/tests/fixtures/quick-access-account.html#/v2/today?day=tomorrow');
  await expect(page.getByRole('heading', { name: 'Завтра', exact: true })).toBeVisible();
  await openDataStatus(page);
  const email = page.getByLabel('Электронная почта', { exact: true });
  await email.fill('draft@example.test');
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  const dialog = page.getByRole('dialog', { name: 'Подтверждение ухода' });
  await expect(dialog).toBeVisible();
  const confirmation = page.getByRole('alertdialog', { name: 'Несохранённые изменения' });
  await expect(confirmation).toBeVisible();
  await page.screenshot({
    path: info.outputPath(`implementation-back-confirm-${info.project.name}.png`),
  });
  expect(await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 180))).toMatch(
    /^<button[^>]*>Остаться<\/button>/,
  );
  await expect(confirmation.getByRole('button', { name: 'Остаться' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirmation.getByRole('button', { name: 'Перейти без сохранения' })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document.querySelector('.planner-account-leave-dialog')?.contains(document.activeElement),
    ),
  ).toBe(true);
  await confirmation.getByRole('button', { name: 'Остаться' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Вернуться в предыдущий раздел' })).toBeFocused();
  await expect(page).toHaveURL(/#\/v2\/account$/);
  await expect(email).toHaveValue('draft@example.test');
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Вернуться в предыдущий раздел' })).toBeFocused();
  await expect(email).toHaveValue('draft@example.test');
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  await confirmation.getByRole('button', { name: 'Перейти без сохранения' }).click();
  await expect(page).toHaveURL(/#\/v2\/today\?day=tomorrow$/);
});

test('browser history cancels an unfinished account leave decision', async ({ page }) => {
  await page.goto('/tests/fixtures/quick-access-account.html#/v2/today');
  await openDataStatus(page);
  await page.getByLabel('Электронная почта', { exact: true }).fill('draft@example.test');
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  const dialog = page.getByRole('dialog', { name: 'Подтверждение ухода' });
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/v2\/today$/);
  await expect(dialog).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('button', { name: 'К плану дня' })).toBeVisible();
});

test('failed diary save refuses entry and keeps the original return route', async ({ page }) => {
  await page.goto('/#/v2/diary?period=day&date=2026-09-22');
  const note = page.getByRole('textbox', { name: 'Свободная заметка' });
  await expect(note).toBeVisible();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    const fixture = window as Window & { diaryOriginalTransaction?: typeof original };
    fixture.diaryOriginalTransaction = original;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const stores = typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]);
      if (args[1] === 'readwrite' && stores.includes('diaryEntries'))
        throw new Error('Проверка временной ошибки дневника');
      return original.apply(this, args);
    };
  });
  await note.fill('Не потерять запись при переходе');
  await expect(page.getByRole('alert')).toContainText('Локальный текст сохранён');
  await clickDataStatusEntry(page);
  await expect(page).toHaveURL(/#\/v2\/diary\?period=day&date=2026-09-22$/);
  await expect(note).toHaveValue('Не потерять запись при переходе');
  await page.evaluate(() => {
    const fixture = window as Window & {
      diaryOriginalTransaction?: typeof IDBDatabase.prototype.transaction;
    };
    if (fixture.diaryOriginalTransaction)
      IDBDatabase.prototype.transaction = fixture.diaryOriginalTransaction;
  });
  await page.getByRole('button', { name: 'Повторить сохранение' }).click();
  await expect(page.getByText('Все изменения сохранены', { exact: true })).toBeVisible();
  await openDataStatus(page);
  await page.getByRole('button', { name: 'Вернуться в предыдущий раздел' }).click();
  await expect(page).toHaveURL(/#\/v2\/diary\?period=day&date=2026-09-22$/);
});

test('the responsive entry remains reachable without clipping', async ({ page }) => {
  const narrow = page.viewportSize()!.width <= 760;
  await page.setViewportSize(narrow ? { width: 320, height: 700 } : { width: 1280, height: 720 });
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  if (narrow) {
    const more = page.getByRole('button', { name: 'Ещё' });
    await more.click();
    await expect(page.locator('#planner-more-menu a').first()).toHaveText('Состояние данных');
    await page.locator('#planner-more-menu a').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#planner-more-menu')).toBeHidden();
    await expect(more).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await more.click();
    const entry = page.locator('#planner-more-menu a').first();
    expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page
        .locator('#planner-more-menu')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/v2\/account$/);
  } else {
    const entry = page.locator('.planner-sidebar > .planner-data-status-link');
    const box = (await entry.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(720);
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/v2\/account$/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('captures the implemented entry and account states at desktop and mobile widths', async ({
  page,
}, info) => {
  const widths = info.project.name === 'desktop-chrome' ? [1440, 1280] : [390, 320];
  const metrics: {
    width: number;
    name: string;
    foreground: string;
    background: string;
    contrast: number;
  }[] = [];
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  for (const width of widths) {
    await page.setViewportSize({
      width,
      height: width >= 761 ? (width === 1440 ? 900 : 720) : 844,
    });
    await page.goto('/#/v2/today');
    await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
    if (width <= 760) {
      await page.getByRole('button', { name: 'Ещё' }).click();
      await expect
        .poll(() =>
          page
            .locator('#planner-more-menu')
            .evaluate((element) => getComputedStyle(element).opacity),
        )
        .toBe('1');
    } else await page.locator('.planner-data-status-link').focus();
    const entryColors = await page.evaluate((mobile) => {
      const entry = document.querySelector<HTMLElement>(
        mobile ? '#planner-more-menu a' : '.planner-data-status-link',
      )!;
      const surface = mobile ? entry.parentElement! : document.querySelector('.planner-sidebar')!;
      return {
        foreground: getComputedStyle(entry).color,
        background: getComputedStyle(surface).backgroundColor,
      };
    }, width <= 760);
    const entryContrast = contrastRatio(entryColors.foreground, entryColors.background);
    metrics.push({ width, name: 'entry', ...entryColors, contrast: entryContrast });
    expect(entryContrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: info.outputPath(`implementation-entry-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await page.goto('/tests/fixtures/account-sync.html?state=ready');
    await expect(page.getByRole('heading', { name: 'Состояние данных' })).toBeVisible();
    const labelColors = await page.evaluate(() => {
      const label = document.querySelector<HTMLElement>('.account-metrics dt')!;
      return {
        foreground: getComputedStyle(label).color,
        background: getComputedStyle(label.parentElement!).backgroundColor,
      };
    });
    const labelContrast = contrastRatio(labelColors.foreground, labelColors.background);
    metrics.push({ width, name: 'metric-label', ...labelColors, contrast: labelContrast });
    expect(labelContrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({
      path: info.outputPath(`implementation-ready-${width}.png`),
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    if (width === 1280 || width === 320) continue;
    for (const state of [
      'offline',
      'pending',
      'error',
      'sign-in-required',
      'unavailable',
    ] as const) {
      await page.goto(`/tests/fixtures/account-sync.html?state=${state}`);
      await expect(page.getByRole('heading', { name: 'Аккаунт и синхронизация' })).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`implementation-${state}-${width}.png`),
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await writeFile(
    info.outputPath(`implementation-metrics-${info.project.name}.json`),
    `${JSON.stringify(metrics, null, 2)}\n`,
  );
  expect(issues).toEqual([]);
});
