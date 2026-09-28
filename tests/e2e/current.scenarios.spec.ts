import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  for (const title of [
    'Прочитать главу',
    'Подготовить проект',
    'Разобрать документы',
    'Начать разговор',
  ]) {
    await page.getByRole('textbox', { name: 'Новое действие на сегодня', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  }
}
async function createScenario(page: Page, title: string, reusable = true) {
  const panel = page.getByRole('region', { name: 'Сценарии задач' });
  await panel.getByRole('button', { name: 'Создать сценарий', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Название сценария', exact: true }).fill(title);
  await panel.getByRole('checkbox', { name: 'Сохранять на следующие дни' }).setChecked(reusable);
  await panel.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect(panel.getByRole('heading', { name: `${title} 0 из 3`, exact: true })).toBeVisible();
  return panel;
}
async function add(page: Page, title: string, count: number) {
  const panel = page.getByRole('region', { name: 'Сценарии задач' });
  await panel.getByRole('button', { name: `Добавить в сценарий: ${title}`, exact: true }).click();
  await expect(panel.getByRole('heading', { level: 3 })).toContainText(`${count} из 3`);
}

test('scenario menus ignore delayed scroll events but close on actual movement and preserve held-touch clicks', async ({
  page,
}) => {
  await prepare(page);
  const panel = await createScenario(page, 'Рабочая тройка');
  await add(page, 'Прочитать главу', 1);
  const row = panel
    .locator('.planner-entity-context')
    .filter({ has: page.getByRole('button', { name: 'Прочитать главу', exact: true }) });
  const trigger = row.getByRole('button', { name: 'Действия: Прочитать главу', exact: true });
  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
  await expect(page.getByRole('menu')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, window.scrollY > 0 ? 0 : 200));
  await expect(page.getByRole('menu')).toHaveCount(0);

  await row.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    isPrimary: true,
    clientX: 50,
    clientY: 200,
  });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
  await row.dispatchEvent('pointerup', { pointerType: 'touch' });
  await row.getByRole('button', { name: 'Прочитать главу', exact: true }).dispatchEvent('click');
  await expect(page).toHaveURL(/#\/v2\/today$/);
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('a post-commit read failure never creates a duplicate on save retry', async ({ page }) => {
  await page.goto('/#/v2/today');
  const panel = page.getByRole('region', { name: 'Сценарии задач' });
  await panel.getByRole('button', { name: 'Создать сценарий', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Название сценария', exact: true }).fill('Один набор');
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'taskScenarios')
        document.documentElement.dataset.scenarioReadFailure = 'true';
      return add.apply(this, args);
    };
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      if (this.name === 'taskScenarios' && document.documentElement.dataset.scenarioReadFailure)
        throw new Error('Не удалось загрузить сценарии. Повторите попытку.');
      return getAll.apply(this, args);
    };
  });
  await panel.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Не удалось загрузить сценарии');
  await page.evaluate(() => {
    delete document.documentElement.dataset.scenarioReadFailure;
  });
  await panel.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open('lifeos');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        const count = await new Promise<number>((resolve, reject) => {
          const request = db.transaction('taskScenarios').objectStore('taskScenarios').count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return count;
      }),
    )
    .toBe(1);
  await expect(
    panel.getByRole('heading', { name: 'Один набор 0 из 3', exact: true }),
  ).toBeVisible();
});

test('scenarios collect three tasks, share completion, preserve saved sets and support editing', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await prepare(page);
  const panel = await createScenario(page, 'Дома за компьютером');
  await add(page, 'Прочитать главу', 1);
  await add(page, 'Подготовить проект', 2);
  await add(page, 'Разобрать документы', 3);
  await expect(
    panel.getByRole('button', { name: 'Добавить задачу в сценарий', exact: true }),
  ).toHaveCount(0);
  await expect(panel.locator('.planner-scenario-tasks > li')).toHaveCount(3);
  await createScenario(page, 'Среди людей');
  await add(page, 'Прочитать главу', 1);
  await panel
    .getByRole('combobox', { name: 'Сейчас я…' })
    .selectOption({ label: 'Дома за компьютером' });
  await panel.getByRole('checkbox', { name: 'Выполнить: Прочитать главу', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Итог задачи', exact: true })
    .getByRole('button', { name: 'Пропустить', exact: true })
    .click();
  await expect(
    panel.getByRole('checkbox', { name: 'Выполнить: Прочитать главу', exact: true }),
  ).toBeChecked();
  await panel.getByRole('combobox', { name: 'Сейчас я…' }).selectOption({ label: 'Среди людей' });
  await expect(
    panel.getByRole('checkbox', { name: 'Выполнить: Прочитать главу', exact: true }),
  ).toBeChecked();
  await expect(
    panel.getByRole('checkbox', { name: 'Выполнить: Прочитать главу', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await panel
    .getByRole('combobox', { name: 'Сейчас я…' })
    .selectOption({ label: 'Дома за компьютером' });
  await expect(panel.locator('.planner-scenario-tasks > li')).toHaveCount(3);
  await expect(
    panel.getByRole('checkbox', { name: 'Выполнить: Прочитать главу', exact: true }),
  ).toBeChecked();
  await panel.getByRole('button', { name: 'Изменить сценарий' }).click();
  await panel
    .getByRole('textbox', { name: 'Название сценария', exact: true })
    .fill('Дома — работа и учёба');
  await panel.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect(panel.getByRole('heading', { level: 3 })).toContainText('Дома — работа и учёба');
  await panel
    .getByRole('button', { name: 'Убрать из сценария: Разобрать документы', exact: true })
    .click();
  await expect(panel.getByRole('heading', { level: 3 })).toContainText('2 из 3');
  await add(page, 'Начать разговор', 3);
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const control of await panel.locator('button:visible, select:visible').all()) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const select = panel.getByRole('combobox', { name: 'Сейчас я…' });
  for (const checkbox of await panel.locator('.planner-check').all()) {
    const targetHeight = await checkbox.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hitArea = getComputedStyle(element, '::before');
      return box.height - parseFloat(hitArea.top) - parseFloat(hitArea.bottom);
    });
    expect(targetHeight).toBeGreaterThanOrEqual(44);
  }
  await select.focus();
  await expect(select).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle),
  ).not.toBe('none');
  await page.screenshot({ path: testInfo.outputPath('scenario.png'), fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(select).toBeVisible();
  expect(errors).toEqual([]);
  await panel.getByRole('button', { name: 'Удалить сценарий', exact: true }).click();
  await expect(
    panel.getByRole('option', { name: 'Дома — работа и учёба', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Разобрать документы', exact: true }),
  ).toBeVisible();
});

test('day-only scenarios stay on their date while saved scenarios are reusable', async ({
  page,
}) => {
  await prepare(page);
  await createScenario(page, 'Только сегодня', false);
  await add(page, 'Начать разговор', 1);
  await createScenario(page, 'Сохранённый набор');
  await add(page, 'Подготовить проект', 1);
  await page
    .getByRole('group', { name: 'План на день' })
    .getByRole('button', { name: 'Завтра', exact: true })
    .click();
  const panel = page.getByRole('region', { name: 'Сценарии задач' });
  await expect(panel.getByRole('combobox')).toBeEnabled();
  await expect(panel.getByRole('option', { name: /Только сегодня/ })).toHaveCount(0);
  await panel.getByRole('combobox').selectOption({ label: 'Сохранённый набор' });
  await expect(
    panel.getByRole('button', { name: 'Подготовить проект', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: 'План на день' })
    .getByRole('button', { name: 'Сегодня', exact: true })
    .click();
  await panel.getByRole('combobox').selectOption({ label: 'Только сегодня · на этот день' });
  await expect(panel.getByRole('button', { name: 'Начать разговор', exact: true })).toBeVisible();
});

test('missing task links can be removed and failed saves preserve the scenario', async ({
  page,
}) => {
  await prepare(page);
  const panel = await createScenario(page, 'Проверка сохранения');
  await add(page, 'Прочитать главу', 1);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lifeos');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('lifeActions', 'readwrite');
      tx.objectStore('lifeActions').clear();
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await panel.getByRole('combobox').selectOption({ label: 'Проверка сохранения' });
  await expect(panel.getByText('Задача недоступна', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Убрать из сценария: задача 1', exact: true }).click();
  await expect(panel.getByRole('heading', { level: 3 })).toContainText('0 из 3');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'taskScenarios')
        throw new Error('Не удалось сохранить сценарий. Повторите попытку.');
      return put.apply(this, args);
    };
  });
  await panel.getByRole('button', { name: 'Изменить сценарий', exact: true }).click();
  await panel
    .getByRole('textbox', { name: 'Название сценария', exact: true })
    .fill('Несохранённое название');
  await panel.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Не удалось сохранить');
  await expect(panel.getByRole('textbox', { name: 'Название сценария', exact: true })).toHaveValue(
    'Несохранённое название',
  );
  await page.reload();
  await expect(panel.getByRole('option', { name: 'Проверка сохранения', exact: true })).toHaveCount(
    1,
  );
  await expect(
    panel.getByRole('option', { name: 'Несохранённое название', exact: true }),
  ).toHaveCount(0);
});
