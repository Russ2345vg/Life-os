import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.goto('/#/v2/directions');
  await expect(page.getByRole('heading', { name: 'Направления', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const [{ Direction, Sphere, EntityId }, { DirectionRecordMapper }, { SphereRecordMapper }] =
      await Promise.all([
        import('/src/domain/index.ts'),
        import('/src/infrastructure/persistence/mappers/DirectionRecordMapper.ts'),
        import('/src/infrastructure/persistence/mappers/SphereRecordMapper.ts'),
      ]);
    const now = new Date();
    const s = Sphere.create({
      id: EntityId.create('patch-sphere'),
      name: 'Восстановление QA',
      now,
    });
    const d = Direction.create({
      id: EntityId.create('patch-direction'),
      name: 'Сон QA',
      sphereId: s.id,
      now,
    });
    const other = Direction.create({ id: EntityId.create('patch-other'), name: 'Другое QA', now });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['spheres', 'directions'], 'readwrite');
      tx.objectStore('spheres').put(SphereRecordMapper.toRecord(s));
      [d, other].forEach((x) =>
        tx.objectStore('directions').put(DirectionRecordMapper.toRecord(x)),
      );
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
}

test('direction context, sphere filtering and optional completion result survive reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await page.getByRole('combobox', { name: 'Сфера', exact: true }).selectOption('patch-sphere');
  await expect(page.getByRole('link', { name: 'Сон QA', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Другое QA', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Сон QA', exact: true }).click();
  await page.getByRole('link', { name: 'Создать цель', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Направление необязательно' })).toHaveValue(
    'patch-direction',
  );
  await page.getByLabel('Название', { exact: true }).fill('Наладить сон QA');
  await page.getByRole('button', { name: 'Создать цель', exact: true }).click();
  await expect(page).toHaveURL(/directions\/patch-direction$/);
  await expect(page.getByRole('link', { name: 'Наладить сон QA', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Создать действие', exact: true }).click();
  await page
    .getByLabel('Название', { exact: true })
    .fill('Подготовить спальню с очень длинным названием для проверки переноса');
  await page.getByRole('button', { name: 'Создать действие', exact: true }).click();
  await expect(page).toHaveURL(/directions\/patch-direction$/);
  await page
    .getByRole('link', {
      name: 'Подготовить спальню с очень длинным названием для проверки переноса',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('paragraph').filter({ hasText: 'Восстановление QA / Сон QA' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Выполнить: Подготовить спальню/ }).click();
  await page.getByText('Добавить результат', { exact: true }).click();
  const result = page.getByLabel('Результат и заметка', { exact: true });
  await result.fill('Сделано: проветрил комнату. Результат: прохладно. Заметка: лёг раньше.');
  await page.getByRole('button', { name: 'Сохранить результат', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Результат сохранён' })).toBeVisible();
  await page.reload();
  await page.getByText('Результат выполнения', { exact: true }).click();
  await expect(result).toHaveValue(/проветрил/);
  await result.focus();
  await expect(result).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('completion-result.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('routine picker selects one stable series and keeps dated completions', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await page.evaluate(async () => {
    const [
      { LifeAction, LifeActionTitle, EntityId, DayDate },
      { LifeActionRecordMapper },
      { addDays },
    ] = await Promise.all([
      import('/src/domain/index.ts'),
      import('/src/infrastructure/persistence/mappers/LifeActionRecordMapper.ts'),
      import('/src/domain/planner/PlanningPeriod.ts'),
    ]);
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const rules = ['repeat-a', 'repeat-b'].map((id) => ({
      id,
      title: id === 'repeat-a' ? 'Витамины QA' : 'Зарядка QA',
      goalId: null,
      priority: null,
      startDate: date,
      endDate: null,
      maxCompletions: null,
      paused: false,
      pauseUntil: null,
      schedule: { kind: 'daily' },
      revision: 1,
      effectiveFrom: date,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    }));
    const actions = Array.from({ length: 100 }, (_, i) => {
      const d = addDays(date, i);
      const a = LifeAction.createDraft({
        id: EntityId.create('repeat-action-' + i),
        title: LifeActionTitle.create('Витамины QA'),
        plannedDate: DayDate.create(d),
        createdAt: now,
        eventId: EntityId.create('repeat-event-' + i),
      });
      a.setPlanningMetadata({
        occurrence: { ruleId: 'repeat-a', slot: d, originalDate: d, ruleRevision: 1 },
      });
      return LifeActionRecordMapper.toRecord(a);
    });
    const ordinary = LifeAction.createDraft({
      id: EntityId.create('ordinary-qa'),
      title: LifeActionTitle.create('Позвонить QA'),
      createdAt: now,
      eventId: EntityId.create('ordinary-event'),
    });
    actions.push(LifeActionRecordMapper.toRecord(ordinary));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('lifeos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['lifeActions', 'recurrenceRules'], 'readwrite');
      actions.forEach((a) => tx.objectStore('lifeActions').put(a));
      rules.forEach((r) => tx.objectStore('recurrenceRules').put(r));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Старая версия', exact: true }).click();
  if (info.project.name === 'mobile-chrome')
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Основные разделы', exact: true })
    .getByRole('button', { name: 'Распорядок', exact: true })
    .click();
  await page.getByRole('button', { name: 'Создать блок', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Создать блок', exact: true });
  await dialog
    .getByRole('combobox', { name: 'Назначение', exact: true })
    .selectOption('existingAction');
  const choices = dialog.getByRole('combobox', { name: /^Связанное действие/ });
  await expect(choices.locator('option').filter({ hasText: 'Витамины QA' })).toHaveCount(1);
  await expect(choices.locator('option').filter({ hasText: 'Зарядка QA' })).toHaveCount(1);
  await expect(choices.locator('option').filter({ hasText: 'Позвонить QA' })).toHaveCount(1);
  await dialog.getByRole('textbox', { name: 'Поиск действия', exact: true }).fill('Витамины');
  await expect(choices.locator('option')).toHaveCount(2);
  await choices.selectOption('series:repeat-a');
  await dialog.getByRole('textbox', { name: 'Название', exact: true }).fill('Приём витаминов QA');
  await dialog.getByLabel('Начало', { exact: true }).fill('10:00');
  await dialog.getByLabel('Окончание', { exact: true }).fill('10:30');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('series-picker.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Создать блок', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Приём витаминов QA', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
