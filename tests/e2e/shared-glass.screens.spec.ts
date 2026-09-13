import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Isolated browser context: no fixtures are written into the user's running app.
test('shared glass keeps all main workspaces readable and dialogs inside the viewport', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const mobile = testInfo.project.name === 'mobile-chrome';
  const sizes = mobile
    ? [
        { width: 390, height: 844 },
        { width: 360, height: 800 },
      ]
    : [
        { width: 1600, height: 900 },
        { width: 1280, height: 720 },
      ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    for (const [name, id] of [
      ['День', 'today'],
      ['Управление', 'management'],
      ['Распорядок', 'routine'],
      ['Прогулки', 'walks'],
      ['Сферы', 'spheres'],
      ['История', 'history'],
      ['Вечерняя аналитика', 'analytics'],
      ['Ещё', 'more'],
    ]) {
      await openSection(page, name, mobile);
      await expect(page.locator('main').first().getByRole('heading').first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectReadableWorkspace(page);
      await capture(page, testInfo, `${id}-${size.width}`);
    }
    await page.getByRole('button', { name: /^Настройки Стартовый раздел/ }).click();
    await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
    await expectReadableWorkspace(page);
    await capture(page, testInfo, `settings-${size.width}`);
    await openSection(page, 'Управление', mobile);
    await page.getByRole('tab', { name: 'Альбом целей', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'В Альбоме пока нет целей' })).toBeVisible();
    const createLinks = page.getByRole('link', { name: 'Добавить цель', exact: true });
    for (const link of await createLinks.all()) {
      await expect(link).toHaveCSS('color', 'rgb(16, 22, 25)');
      expect(await link.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(
        'linear-gradient',
      );
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expectReadableWorkspace(page);
    await capture(page, testInfo, `goals-${size.width}`);
    await openSection(page, 'Распорядок', mobile);
    await page.getByRole('button', { name: 'Создать блок', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Создать блок', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Название', exact: true })).toBeFocused();
    const coverage = await dialog.evaluate((element) => {
      const backdrop = element.parentElement!;
      const bounds = backdrop.getBoundingClientRect();
      return {
        position: getComputedStyle(backdrop).position,
        top: bounds.top,
        left: bounds.left,
        height: bounds.height,
        width: bounds.width,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: innerHeight,
      };
    });
    expect(coverage.position).toBe('fixed');
    expect(coverage.top).toBeCloseTo(0, 0);
    expect(coverage.left).toBeCloseTo(0, 0);
    expect(coverage.height).toBeCloseTo(coverage.viewportHeight, 0);
    expect(coverage.width).toBeCloseTo(coverage.viewportWidth, 0);
    await dialog.getByRole('button', { name: 'Создать блок', exact: true }).click({ trial: true });
    await capture(page, testInfo, `routine-dialog-${size.width}`);
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('tab', { name: 'Утро', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Утренний распорядок', exact: true }),
    ).toBeVisible();
    await expectReadableWorkspace(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, testInfo, `morning-${size.width}`);
    await page.getByRole('tab', { name: 'Вечер', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Вечерний центр', exact: true })).toBeVisible();
    for (const value of await page.locator('.evening-kpi-card-copy').all()) {
      const bounds = await value.evaluate((element) => ({
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      expect(
        bounds.scroll,
        'evening summary must fit without clipping its text',
      ).toBeLessThanOrEqual(bounds.width + 1);
    }
    expect(
      await page
        .locator('.evening-not-started-card')
        .evaluate((element) => getComputedStyle(element).backgroundImage),
    ).not.toContain('url(');
    await expectReadableWorkspace(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, testInfo, `evening-${size.width}`);
  }
  expect(errors).toEqual([]);
});

async function openSection(page: Page, name: string, mobile: boolean): Promise<void> {
  if (mobile) await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Основные разделы', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}

async function expectReadableWorkspace(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    atmosphere: getComputedStyle(document.body, '::before').backgroundImage,
    mainFilter: getComputedStyle(document.querySelector('main')!).backdropFilter,
    doublePaint: Array.from(document.querySelectorAll('main *'))
      .filter((element) => {
        if (element.getClientRects().length === 0) return false;
        const layer = getComputedStyle(element, '::before');
        if (layer.content === 'none' || layer.zIndex !== '-1' || layer.backdropFilter === 'none')
          return false;
        const owner = getComputedStyle(element);
        return owner.backgroundColor !== 'rgba(0, 0, 0, 0)' || owner.backgroundImage !== 'none';
      })
      .map((element) => element.className),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.atmosphere).toContain('lifeos-forest-atmosphere.png');
  expect(metrics.mainFilter).toBe('none');
  expect(metrics.doublePaint, 'glass panels must have one painted layer').toEqual([]);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  const path = testInfo.outputPath(`shared-glass-${name}.png`);
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
