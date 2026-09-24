import { expect, test, type Page } from '@playwright/test';
import {
  DayDate,
  EntityId,
  Sphere,
  Direction,
  Goal,
  LifeAction,
  LifeActionTitle,
} from '../../src/domain';
import { SphereRecordMapper } from '../../src/infrastructure/persistence/mappers/SphereRecordMapper';
import { DirectionRecordMapper } from '../../src/infrastructure/persistence/mappers/DirectionRecordMapper';
import { GoalRecordMapper } from '../../src/infrastructure/persistence/mappers/GoalRecordMapper';
import type { GoalRecord } from '../../src/infrastructure/persistence/records/GoalRecord';
import { LifeActionRecordMapper } from '../../src/infrastructure/persistence/mappers/LifeActionRecordMapper';

async function seedResponsive(page: Page) {
  await page.goto('/#/v2/today');
  await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const now = new Date(`${today}T00:00:00`);
  const sphere = Sphere.create({
    id: EntityId.create('master-sphere'),
    name: 'Здоровье и устойчивый повседневный ритм',
    manualScore: 4,
    desiredLevel: 8,
    includeInBalanceWheel: true,
    now,
  });
  const direction = Direction.create({
    id: EntityId.create('master-direction'),
    name: 'Регулярное движение и восстановление',
    sphereId: sphere.id,
    description: 'Поддерживать достаточно энергии для важных дел',
    manualScore: 5,
    now,
  });
  const goal = Goal.create({
    id: EntityId.create('master-goal'),
    title: 'Постепенно восстановить устойчивый режим и регулярно двигаться',
    directionId: direction.id,
    status: 'active',
    stage: 'active_goal',
    achievementCriteria: 'Десять прогулок в удобном ритме',
    now,
  });
  const measured = goal.update(
    { title: goal.title, progress: { type: 'metric', current: 3, target: 10, unit: 'прогулок' } },
    now,
  );
  const actions = Array.from({ length: 8 }, (_, index) =>
    LifeAction.createDraft({
      id: EntityId.create(`master-action-${index}`),
      title: LifeActionTitle.create(
        index === 0
          ? 'ОченьДлинноеНазваниеБезПробеловДляПроверкиПереносаИОтсутствияПерекрытияМеню'
          : `Прогуляться по парку и восстановить силы · ${index}`,
      ),
      goalId: index === 7 ? null : goal.id,
      plannedDate: index < 5 ? DayDate.create(today) : null,
      createdAt: now,
      eventId: EntityId.create(`master-created-${index}`),
    }),
  );
  await page.evaluate(
    async (records) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lifeos');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['spheres', 'directions', 'goals', 'lifeActions'], 'readwrite');
        for (const [store, rows] of Object.entries(records))
          rows.forEach((record) => tx.objectStore(store).put(record));
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      spheres: [
        sphere,
        ...['Дом', 'Работа', 'Деньги', 'Отношения', 'Развитие'].map((name, index) =>
          Sphere.create({
            id: EntityId.create(`master-sphere-${index}`),
            name: `${name} MASTER QA`,
            manualScore: index === 2 ? null : 4 + (index % 4),
            desiredLevel: 8,
            includeInBalanceWheel: true,
            now,
          }),
        ),
      ].map(SphereRecordMapper.toRecord),
      directions: [DirectionRecordMapper.toRecord(direction)],
      goals: [GoalRecordMapper.toRecord(measured)],
      lifeActions: actions.map(LifeActionRecordMapper.toRecord),
    },
  );
}

test('MASTER hierarchy creates and edits linked records through contextual panels', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/v2/spheres');
  await page.getByRole('button', { name: 'Новая сфера', exact: true }).click();
  let panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Название', { exact: true }).fill('Дом MASTER');
  await panel.getByLabel('Описание', { exact: true }).fill('Уют и порядок');
  await panel.getByLabel('Желаемый уровень · 0–10').fill('8');
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(panel).toHaveCount(0);
  const sphereCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('link', { name: 'Дом MASTER', exact: true }) });
  await expect(sphereCard.getByText('Нет оценки', { exact: true })).toBeVisible();
  await sphereCard.getByRole('button', { name: 'Оценить сферу' }).click();
  panel = page.getByRole('dialog');
  await expect(panel.getByLabel('Ручная оценка · 0–10')).toBeFocused();
  await panel.getByText('Другие параметры сферы', { exact: true }).click();
  await expect(panel.getByLabel('Описание', { exact: true })).toHaveValue('Уют и порядок');
  await panel.getByLabel('Ручная оценка · 0–10').fill('4');
  await panel.getByLabel('Включить в колесо').check();
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('spheres.png'), fullPage: true });
  await page.goto('/#/v2/directions');
  await page.getByRole('button', { name: '+ Новое направление', exact: true }).click();
  panel = page.getByRole('dialog');
  await panel.getByLabel('Название', { exact: true }).fill('Жильё MASTER');
  await panel
    .getByRole('combobox', { name: 'Сфера', exact: true })
    .selectOption({ label: 'Дом MASTER' });
  await panel.getByLabel('Описание', { exact: true }).fill('Найти уютную квартиру');
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('directions.png'), fullPage: true });
  await page.getByRole('button', { name: 'Действия: Жильё MASTER', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Редактировать', exact: true }).click();
  panel = page.getByRole('dialog');
  await expect(panel.getByLabel('Описание', { exact: true })).toHaveValue('Найти уютную квартиру');
  await panel.getByLabel('Описание', { exact: true }).fill('Найти уютную квартиру рядом с парком');
  await panel.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('link', { name: '+ Добавить цель', exact: true }).click();
  panel = page.getByRole('dialog');
  await expect(panel.getByRole('combobox').first()).not.toHaveValue('');
  await panel.getByLabel('Название', { exact: true }).fill('Снять квартиру MASTER');
  await panel.getByLabel('Желаемый результат').fill('Подписан договор, получены ключи');
  await panel.getByRole('combobox', { name: 'Период', exact: true }).selectOption('quarter');
  await panel.getByLabel('Первый шаг', { exact: false }).fill('Посмотреть объявления');
  await panel.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Жильё MASTER', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Снять квартиру MASTER', exact: true }).click();
  await expect(page.getByText('Дом MASTER › Жильё MASTER')).toBeVisible();
  await page.getByRole('button', { name: 'Действия: Снять квартиру MASTER', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Редактировать', exact: true }).click();
  panel = page.getByRole('dialog');
  await expect(panel.getByLabel('Название', { exact: true })).toHaveValue('Снять квартиру MASTER');
  await expect(panel.getByLabel('Желаемый результат')).toHaveValue(
    'Подписан договор, получены ключи',
  );
  await panel
    .getByLabel('Желаемый результат')
    .fill('Подписан договор, получены ключи и готов переезд');
  await panel.getByRole('button', { name: 'Сохранить цель', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByText('Подписан договор, получены ключи и готов переезд', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '+ Добавить действие', exact: true }).click();
  panel = page.getByRole('dialog');
  await panel.getByLabel('Название', { exact: true }).fill('Позвонить владельцу MASTER');
  await panel.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await panel.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Снять квартиру MASTER', exact: true }),
  ).toBeVisible();
  await page.goto('/#/v2/actions');
  await expect(
    page.getByRole('link', { name: 'Позвонить владельцу MASTER', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('actions.png'), fullPage: true });
  const metadata = await page
    .locator('.planner-action-row--catalog')
    .getByText('Дом MASTER / Жильё MASTER / Снять квартиру MASTER', { exact: true })
    .boundingBox();
  expect(metadata).not.toBeNull();
  // A real pointer at the metadata hits the stretched title link, making the whole row openable.
  await page.mouse.click(metadata!.x + metadata!.width / 2, metadata!.y + metadata!.height / 2);
  await expect(
    page.getByRole('heading', { name: 'Позвонить владельцу MASTER', exact: true }),
  ).toBeVisible();
  await page.getByText('Редактировать действие', { exact: true }).click();
  await page.getByLabel('Описание', { exact: true }).fill('Уточнить время просмотра');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.planner-action-note')).toHaveText('Уточнить время просмотра');
  await page.goto('/#/v2/goals');
  await expect(
    page.getByRole('link', { name: 'Снять квартиру MASTER', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Плановый период', exact: true })
    .selectOption('quarter');
  await page.getByRole('button', { name: /^Показать:/ }).click();
  await expect(
    page.getByRole('link', { name: 'Снять квартиру MASTER', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('goals.png'), fullPage: true });
  await page.goto('/#/v2/today');
  await page
    .getByLabel('Главное направление', { exact: true })
    .selectOption({ label: 'Дом MASTER → Жильё MASTER' });
  await expect(
    page.getByRole('button', { name: 'Позвонить владельцу MASTER', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('today.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'Выполнить: Позвонить владельцу MASTER' }).click();
  await expect(page.getByText('Всё выполнено. Можно спокойно завершить день.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Всё выполнено. Можно спокойно завершить день.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('MASTER filters, views and existing measurement editor retain real data', async ({ page }) => {
  await seedResponsive(page);
  await page.goto('/#/v2/actions');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('button', { name: 'Без цели', exact: true }).click();
  await expect(page.locator('.planner-action-row--catalog')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Сфера', exact: true }).selectOption('master-sphere');
  await expect(page.locator('.planner-action-row--catalog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Направление', exact: true })
    .selectOption('master-direction');
  await expect(page.locator('.planner-action-row--catalog')).toHaveCount(7);
  await page.getByLabel('Поиск действий').fill('ОченьДлинное');
  await expect(page.locator('.planner-action-row--catalog')).toHaveCount(1);
  for (const label of ['Канбан', 'Календарь', 'Список']) {
    await page
      .getByRole('combobox', { name: 'Представление', exact: true })
      .selectOption({ label });
    await expect(page.locator('main h1')).toBeVisible();
  }
  await page.goto('/#/v2/goals/master-goal');
  await page.getByText('Измерение и корректировка', { exact: true }).click();
  await page.getByText('Измерение прогресса', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Тип измерения', exact: true }).selectOption('numeric');
  await page.getByLabel('Целевое значение', { exact: true }).fill('10');
  await page.getByLabel('Точный срок · необязательно', { exact: true }).fill('2027-01-15');
  await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
  await expect(page.getByText('До 2027-01-15', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText('До 2027-01-15', { exact: false })).toBeVisible();
  await expect(page.getByText('3 / 10 раз · 30%', { exact: true })).toBeVisible();
});

test('MASTER goal conflict preserves the draft and the newer saved record', async ({ page }) => {
  await seedResponsive(page);
  await page.goto('/#/v2/goals/master-goal?edit=1');
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Желаемый результат').fill('Мой несохранённый результат');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('goals', 'readwrite');
      const store = tx.objectStore('goals');
      const request = store.get('master-goal');
      request.onsuccess = () => {
        const record = request.result as GoalRecord;
        store.put({
          ...record,
          version: record.version + 1,
          achievementCriteria: 'Внешнее изменение',
          updatedAt: new Date().toISOString(),
        });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await panel.getByRole('button', { name: 'Сохранить цель', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Цель уже изменена');
  await expect(panel.getByLabel('Желаемый результат')).toHaveValue('Мой несохранённый результат');
  await panel.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Внешнее изменение', { exact: true })).toBeVisible();
});

for (const width of [320, 360, 375, 390, 393, 412, 430, 730, 1024, 1280, 1366, 1440, 1600, 1920]) {
  test(`MASTER responsive populated screens at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seedResponsive(page);
    for (const route of ['spheres', 'directions', 'goals', 'actions', 'today']) {
      await page.goto(`/#/v2/${route}`);
      await expect(page.locator('main h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (route === 'today') {
        const row = page.locator('.planner-today .planner-entity-context').first();
        const menu = await row.locator('.planner-entity-more').boundingBox();
        const star = await row.locator('.planner-main-toggle').boundingBox();
        expect(
          menu &&
            star &&
            menu.x < star.x + star.width &&
            menu.x + menu.width > star.x &&
            menu.y < star.y + star.height &&
            menu.y + menu.height > star.y,
        ).toBe(false);
      }
      if (width === 390 || width === 1440)
        await page.screenshot({ path: info.outputPath(`${route}-${width}.png`) });
    }
    await page.getByRole('button', { name: 'Создать с параметрами', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByLabel('Название', { exact: true }).fill('Проверка панели');
    await page.setViewportSize({ width, height: 480 });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Создать действие', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Создать действие', exact: true }),
    ).toBeInViewport();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(
      true,
    );
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
