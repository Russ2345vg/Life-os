import { expect, test, type Page } from '@playwright/test';
import { Direction, EntityId, Project, Sphere } from '../../src/domain';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';
import { ProjectGoalCompatibility } from '../../src/infrastructure/persistence/mappers/ProjectGoalCompatibility';

const names = [
  '🚀 Проекты и предпринимательство',
  'SYNC03_ANDROID_DIRECTION',
  '💼 Карьера и работа',
  'SYNC04-QA-WIN-DIRECTION',
];
const description =
  'Полное описание направления сохраняется в подробностях и не должно занимать место в обзорной строке.';

async function openDirections(page: Page) {
  await page.goto('/#/goals');
  await page.getByRole('tab', { name: 'Направления', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Направления', exact: true })).toBeVisible();
}

async function seed(page: Page, count = 4) {
  const now = new Date();
  const sphere = Sphere.create({
    id: EntityId.create('compact-sphere'),
    name: 'Работа · компактный каталог',
    now,
  });
  const directions = Array.from({ length: count }, (_, index) =>
    Direction.create({
      id: EntityId.create(`compact-direction-${index}`),
      name:
        names[index] ??
        (index === 4 ? 'SYNC04_' + 'ДЛИННОЕ_НАЗВАНИЕ_'.repeat(7) : `Направление ${index + 1}`),
      description: index === 1 ? null : description,
      sphereId: index === 1 ? null : sphere.id,
      now,
    }),
  );
  const goal = Project.create({
    id: EntityId.create('compact-goal'),
    title: 'Связанная цель',
    directionId: directions[0].id,
    sphereId: sphere.id,
    now,
  });
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['directions', 'spheres', 'goals'], 'readwrite');
        records.directions.forEach((record) => tx.objectStore('directions').put(record));
        tx.objectStore('spheres').put(records.sphere);
        tx.objectStore('goals').put(records.goal);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      directions: directions.map(DirectionRecordMapper.toRecord),
      sphere: SphereRecordMapper.toRecord(sphere),
      goal: ProjectGoalCompatibility.toRecord(goal),
    },
  );
  await openDirections(page);
}

test('catalog keeps the supplied scenario compact readable and keyboard accessible', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDirections(page);
  await seed(page);
  await expect(page.locator('.direction-card')).toHaveCount(4);
  const rows = page.locator('.direction-card');
  for (const text of ['0 целей', '1 цель', 'Нет движения', 'Активность']) {
    expect((await rows.allTextContents()).join(' ')).not.toContain(text);
  }
  await expect(rows.first().locator('.direction-card-description')).toHaveText(description);
  await expect(page.getByRole('heading', { name: 'Все направления', exact: true })).toBeVisible();
  const menu = rows.first().locator('summary');
  await menu.press('Enter');
  await expect(page.getByRole('button', { name: 'Архивировать', exact: true })).toBeVisible();
  await menu.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Направления', exact: true })).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    const undersizedTabs = await page
      .locator('.management-navigation-tab')
      .evaluateAll((tabs) =>
        tabs.filter((tab) => tab.getBoundingClientRect().height < 44).map((tab) => tab.textContent),
      );
    expect(undersizedTabs).toEqual([]);
    if (width === 1440) {
      for (const row of await rows.all()) {
        const box = await row.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(72);
        expect(box?.height).toBeLessThanOrEqual(88);
      }
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const sizes = await page
      .locator('.directions-compact button:visible, .directions-compact summary:visible')
      .evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return [r.width, r.height];
        }),
      );
    for (const [w, h] of sizes) {
      expect(w).toBeGreaterThanOrEqual(43.99);
      expect(h).toBeGreaterThanOrEqual(43.99);
    }
    await page.screenshot({ path: info.outputPath(`directions-${width}.png`), fullPage: true });
  }
  const lowerMenu = rows.nth(2).locator('summary');
  await lowerMenu.press('Enter');
  // Trial click scrolls into view and verifies that the fixed mobile bar does not intercept it.
  await page.getByRole('button', { name: 'Архивировать', exact: true }).click({ trial: true });
  await lowerMenu.press('Escape');
  await expect(lowerMenu).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  const enlarged = await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: info.outputPath('directions-large-text.png'), fullPage: true });
  await enlarged.evaluate((el) => el.remove());
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await expect(page.getByText('Архив пуст.', { exact: true })).toBeVisible();
  expect(
    await page
      .locator('.directions-archive-content')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.getByRole('link', { name: new RegExp(names[0]) }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: names[0], exact: true })).toBeFocused();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.getByText('Связанная цель', { exact: true })).toBeVisible();
  await expect(page.locator('.direction-pulse')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shared atmosphere and glass form remain usable on desktop and mobile', async ({
  page,
}, info) => {
  await openDirections(page);
  await seed(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  const collapse = page.getByRole('button', { name: 'Свернуть боковое меню', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  const form = page.locator('.direction-create-form');
  await expect(form).toBeVisible();
  const materials = await form.evaluate((element) => {
    const surface = getComputedStyle(element, '::before');
    const ancestors: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.filter !== 'none' || style.backdropFilter !== 'none')
        ancestors.push(parent.className);
    }
    return {
      background: getComputedStyle(element).backgroundColor,
      blur: surface.backdropFilter,
      atmosphere: getComputedStyle(document.body, '::before').backgroundImage,
      ancestors,
    };
  });
  expect(materials.background).toBe('rgba(0, 0, 0, 0)');
  expect(materials.blur).toBe('blur(14px)');
  expect(materials.atmosphere).toContain('lifeos-forest-atmosphere.png');
  expect(materials.ancestors).toEqual([]);
  for (const [width, height] of [
    [1672, 941],
    [1600, 900],
    [1280, 720],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    const undersizedTabs = await page
      .locator('.management-navigation-tab')
      .evaluateAll((tabs) =>
        tabs.filter((tab) => tab.getBoundingClientRect().height < 44).map((tab) => tab.textContent),
      );
    expect(undersizedTabs).toEqual([]);
    await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page
      .getByRole('button', { name: 'Создать направление', exact: true })
      .click({ trial: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    const actions = form.locator('.management-form-actions');
    await expect(actions).toHaveCSS('position', 'static');
    const descriptionBox = await form.locator('textarea').boundingBox();
    const actionsBox = await actions.boundingBox();
    expect(descriptionBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(actionsBox!.y).toBeGreaterThanOrEqual(descriptionBox!.y + descriptionBox!.height);
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: info.outputPath(`shared-glass-form-${width}.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: info.outputPath(`shared-glass-viewport-${width}.png`),
      fullPage: false,
    });
  }
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Несохранённый черновик');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.direction-card')).toHaveCount(4);
});

test('empty and single-direction catalog preserves create edit cancel and reload', async ({
  page,
}) => {
  await openDirections(page);
  await expect(page.getByText('Пока нет направлений', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Создать направление', exact: true })).toHaveCount(
    1,
  );
  await expect(page.locator('.directions-priority')).toHaveCount(0);
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await page.locator('#direction-name').fill('Отменённое направление');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('.direction-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await page.locator('#direction-name').fill('Новое направление QA');
  await page.locator('#direction-description').fill(description);
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await expect(page.locator('.direction-card')).toHaveCount(1);
  await page.locator('.direction-card summary').click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Изменить направление', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#direction-description')).toHaveValue(description);
  await page.locator('#direction-name').fill('Сохранённое направление QA');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('#direction-name')).toHaveCount(0);
  await openDirections(page);
  await expect(page.getByRole('link', { name: /Сохранённое направление QA/ })).toBeVisible();
  await expect(page.locator('.direction-card')).toHaveCount(1);
});

test('main changes archive and restore keep identities and goal links intact', async ({
  page,
}, info) => {
  await openDirections(page);
  await seed(page);
  const readGoal = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('lifeos');
        req.onsuccess = () => resolve(req.result);
      });
      const record = await new Promise((resolve) => {
        const req = db.transaction('goals').objectStore('goals').get('compact-goal');
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      return record;
    });
  const goalBefore = await readGoal();
  await page.getByRole('button', { name: 'Выбрать главное', exact: true }).click();
  await page.locator('.directions-main-picker select').selectOption('compact-direction-0');
  await page.getByRole('button', { name: 'Назначить', exact: true }).click();
  await expect(page.locator('.directions-priority .direction-card')).toHaveAttribute(
    'data-direction-id',
    'compact-direction-0',
  );
  await expect(page.locator('.directions-priority summary')).toBeFocused();
  await expect(page.locator('.direction-group .direction-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Изменить выбор', exact: true }).click();
  await page.locator('.directions-main-picker select').press('Escape');
  await expect(page.getByRole('button', { name: 'Изменить выбор', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Изменить выбор', exact: true }).click();
  await page.locator('.directions-main-picker select').selectOption('compact-direction-1');
  await page.getByRole('button', { name: 'Назначить', exact: true }).click();
  await expect(page.locator('.directions-priority .direction-card')).toHaveAttribute(
    'data-direction-id',
    'compact-direction-1',
  );
  await openDirections(page);
  await expect(page.locator('.directions-priority .direction-card')).toHaveAttribute(
    'data-direction-id',
    'compact-direction-1',
  );
  await page.locator('.directions-priority summary').click();
  await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
  await expect(page.locator('.directions-priority')).toContainText(
    'Главное направление пока не выбрано.',
  );
  await expect(page.locator('.directions-archive-toggle')).toBeFocused();
  await page.getByRole('button', { name: 'Архив', exact: true }).click();
  await page.locator('.directions-archive-content summary').click();
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(page.locator('.direction-group .direction-card')).toHaveCount(4);
  await expect(page.locator('.directions-priority')).toContainText(
    'Главное направление пока не выбрано.',
  );
  expect(await readGoal()).toEqual(goalBefore);
  await page.screenshot({ path: info.outputPath('directions-restored.png'), fullPage: true });
});

test('twenty-two directions wrap long names and keep the last menu reachable', async ({
  page,
}, info) => {
  await openDirections(page);
  await seed(page, 22);
  await expect(page.locator('.direction-card')).toHaveCount(22);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  const lastName = await page.locator('.direction-card').last().locator('strong').innerText();
  await page.locator('.direction-card').last().locator('summary').click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await expect(page.locator('#direction-name')).toHaveValue(lastName);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page.locator('.direction-card')).toHaveCount(22);
  await page.locator('[data-direction-id="compact-direction-4"] [role="link"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'SYNC04_' + 'ДЛИННОЕ_НАЗВАНИЕ_'.repeat(7),
  );
  await page.getByRole('button', { name: '← Направления', exact: true }).click();
  await page.screenshot({ path: info.outputPath('directions-many-mobile.png'), fullPage: true });
});

test('query and write failures are recoverable and never erase a draft', async ({ page }) => {
  await page.goto('/tests/fixtures/directions-compact.html');
  await expect(page.getByText('Загружаем направления…', { exact: true })).toBeVisible();
  await expect(page.getByText('Пока нет направлений', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reject query', exact: true }).click();
  await expect(page.getByText('Не удалось загрузить направления.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText('Загружаем направления…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resolve query', exact: true }).click();
  await expect(page.getByRole('link', { name: /Тестовое направление/ })).toBeVisible();
  await page.getByRole('button', { name: 'Выбрать главное', exact: true }).click();
  await page.getByRole('button', { name: 'Назначить', exact: true }).click();
  await expect(
    page.getByText('Не удалось выбрать главное направление. Повторите попытку.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Назначить', exact: true })).toBeEnabled();
  await expect(page.getByText('Главное направление обновлено.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Allow main save', exact: true }).click();
  await page.getByRole('button', { name: 'Назначить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled();
  await page.getByRole('form', { name: 'Выбор главного направления' }).press('Escape');
  await expect(page.getByRole('form', { name: 'Выбор главного направления' })).toBeVisible();
  await expect(page.getByText('Главное направление обновлено.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resolve main save', exact: true }).click();
  await page.getByRole('button', { name: 'Resolve query', exact: true }).click();
  await expect(page.locator('.directions-priority .direction-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await page.locator('#direction-name').fill('Несохранённый черновик');
  await page.locator('#direction-description').fill('Важное описание');
  await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  await expect(
    page.getByText('Не удалось сохранить направление. Повторите попытку.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('#direction-name')).toHaveValue('Несохранённый черновик');
  await expect(page.locator('#direction-description')).toHaveValue('Важное описание');
  await expect(
    page.getByRole('button', { name: 'Создать направление', exact: true }),
  ).toBeEnabled();
});
