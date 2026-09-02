import { expect, test, type Page, type TestInfo } from '@playwright/test';

test('MOR-01 resolves a previous run, resumes Quick Start, and persists shower skip', async ({
  page,
}, testInfo) => {
  const issues = observeRuntimeIssues(page);
  const { today, yesterday } = await openMorningRoute(page);
  await seedPreviousMorning(page, yesterday);
  await page.reload();

  await expect(page.getByText(`Незавершённое утро за ${displayDate(yesterday)}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать утро', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Закрыть прошлый запуск', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Начать утро', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  const quickStartHeading = page.getByRole('heading', { name: 'Быстрый старт', level: 2 });
  await expect(quickStartHeading).toBeFocused();
  await expectQuickStartReviewLayout(page, testInfo);
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  const waterCard = page
    .locator('[data-morning-action-status="completed"]')
    .filter({ hasText: 'Стакан воды' });
  await expect(waterCard.getByText('✓ Выполнено', { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-quick-start-step-status="completed"]').filter({ hasText: 'Вода' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-quick-start-step-status="current"]').filter({ hasText: 'Душ' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByText('8%', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Оставшееся время').getByText(/≈ 26 мин/)).toBeVisible();
  const openQuickStart = page.getByRole('button', { name: 'Открыть', exact: true });
  await openQuickStart.focus();
  await page.keyboard.press('Enter');
  await expect(quickStartHeading).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  const backToCenter = page.getByRole('button', { name: '← Утренний центр', exact: true });
  await expect(backToCenter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(openQuickStart).toBeFocused();
  await openQuickStart.click();
  await page.getByRole('button', { name: 'Пропустить сегодня', exact: true }).click();
  await expect(page.getByText('✓ Быстрый старт завершён', { exact: true })).toBeVisible();
  await expect(page.getByText('Пропущен сегодня', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'К обзору утра', exact: true }).click();
  const physicalStage = page.locator('[data-morning-stage="physical-activation"]');
  await expect(physicalStage).toBeFocused();
  await expect(physicalStage).toHaveAttribute('data-morning-stage-status', 'current');
  await expect(page.getByText('16%', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Оставшееся время').getByText(/≈ 22 мин/)).toBeVisible();

  await page.getByRole('button', { name: /Сократить утро/ }).click();
  await expect(page.getByRole('heading', { name: 'Сократить оставшуюся часть' })).toBeVisible();
  await page.getByRole('button', { name: 'Применить сокращение', exact: true }).click();
  await expect(page.getByText('Сокращённый режим', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Оставшееся время').getByText(/≈ 17 мин/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('Сокращённый режим', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Оставшееся время').getByText(/≈ 17 мин/)).toBeVisible();
  await page.goto(`/#/routine/morning?date=${yesterday}`);
  await expect(page.getByText(/Режим просмотра:/)).toBeVisible();
  const viewHistorical = page.getByRole('button', { name: 'Просмотреть', exact: true });
  await viewHistorical.focus();
  await page.keyboard.press('Enter');
  await expect(quickStartHeading).toBeFocused();
  await expect(
    page.getByText('Режим просмотра: факты этого утра доступны только для чтения.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Начать утро|Выпил воду/ })).toHaveCount(0);
  await page.goto(`/#/routine/morning?date=${today}`);
  await expect(page.getByText('21%', { exact: true })).toBeVisible();
  await expect(page.getByText('Сокращённый режим', { exact: true })).toBeVisible();

  await expectMorningLayout(page, testInfo);
  expect(issues).toEqual([]);
});

test('MOR-01 persists an explicitly completed cold shower', async ({ page }, testInfo) => {
  const issues = observeRuntimeIssues(page);
  await openMorningRoute(page);

  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  await page.getByRole('button', { name: 'Холодный душ выполнен', exact: true }).click();
  await expect(page.getByText('✓ Быстрый старт завершён', { exact: true })).toBeVisible();
  const completedShowerCard = page
    .locator('[data-morning-action-status="completed"]')
    .filter({ hasText: 'Холодный душ' });
  await expect(completedShowerCard.getByText('✓ Выполнено', { exact: true })).toBeVisible();

  await page.reload();
  await page
    .locator('[data-morning-stage="quick-start"]')
    .getByRole('button', { name: 'Открыть', exact: true })
    .click();
  await expect(
    page
      .locator('[data-morning-action-status="completed"]')
      .filter({ hasText: 'Холодный душ' })
      .getByText('✓ Выполнено', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Пропустить сегодня', exact: true })).toHaveCount(
    0,
  );

  await expectMorningLayout(page, testInfo);
  expect(issues).toEqual([]);
});

test('MOR-02 plans physical activation, persists targets, and adds a custom exercise', async ({
  page,
}, testInfo) => {
  const issues = observeRuntimeIssues(page);
  await openMorningRoute(page);
  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  await page.getByRole('button', { name: 'Пропустить сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'К обзору утра', exact: true }).click();

  const physicalStage = page.locator('[data-morning-stage="physical-activation"]');
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Физическая активация', level: 2 });
  await expect(heading).toBeFocused();
  await expect(page.getByRole('button', { name: 'Начать выполнение', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Отжимания повторения', exact: true }).click();
  await page.getByRole('button', { name: 'Подтягивания повторения', exact: true }).click();
  for (let target = 11; target <= 15; target += 1) {
    await page.getByLabel('Увеличить повторения: Отжимания').click();
    await expect(page.getByText(`3 × ${target} повторений`, { exact: true })).toBeVisible();
  }
  for (let target = 9; target >= 6; target -= 1) {
    await page.getByLabel('Уменьшить повторения: Подтягивания').click();
    await expect(page.getByText(`3 × ${target} повторений`, { exact: true })).toBeVisible();
  }

  await expect(
    page.getByText('Выбрано 2 упражнения · 6 подходов · ≈ 12 мин', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать выполнение', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'План на утро готов', exact: true })).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Подтягивания повторения', exact: true }).click();
  await expect(page.getByText('1 упражнение', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Подтягивания повторения', exact: true }).click();
  for (let target = 9; target >= 6; target -= 1) {
    await page.getByLabel('Уменьшить повторения: Подтягивания').click();
    await expect(page.getByText(`3 × ${target} повторений`, { exact: true })).toBeVisible();
  }

  await page.reload();
  await expect(physicalStage.getByText('2 упражнения · 6 подходов', { exact: true })).toBeVisible();
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByText('3 × 15 повторений', { exact: true })).toBeVisible();
  await expect(page.getByText('3 × 6 повторений', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '+ Добавить своё', exact: true }).click();
  await page.getByLabel('Название упражнения').fill('Вис на перекладине');
  await page.getByLabel('Время', { exact: true }).check();
  await page.getByRole('button', { name: 'Добавить упражнение', exact: true }).click();
  await page.getByRole('button', { name: 'Вис на перекладине секунды', exact: true }).click();
  await expect(page.getByText('3 × 30 сек', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Увеличить секунды: Вис на перекладине')).toBeVisible();

  const back = page.getByRole('button', { name: '← Утренний центр', exact: true });
  await back.click();
  await expect(physicalStage.getByRole('button', { name: 'Открыть', exact: true })).toBeFocused();
  await expect(physicalStage.getByText('3 упражнения · 9 подходов', { exact: true })).toBeVisible();
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  await expect(page.getByText('3 × 30 сек', { exact: true })).toBeVisible();

  await expectPhysicalLayout(page, testInfo);
  expect(issues).toEqual([]);
});

test('MOR-03 executes, pauses, resumes, persists, and completes physical activation', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const issues = observeRuntimeIssues(page);
  const { today } = await openMorningRoute(page);
  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  await page.getByRole('button', { name: 'Пропустить сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'К обзору утра', exact: true }).click();

  const physicalStage = page.locator('[data-morning-stage="physical-activation"]');
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  await page.getByRole('button', { name: 'Отжимания повторения', exact: true }).click();
  await page.getByRole('button', { name: 'Планка секунды', exact: true }).click();
  await page.getByLabel('Уменьшить подходы: Отжимания').click();
  await page.getByLabel('Уменьшить подходы: Планка').click();
  await expect(
    page.getByText('Выбрано 2 упражнения · 4 подхода · ≈ 8 мин', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Начать выполнение', exact: true }).click();
  const executionHeading = page.getByRole('heading', {
    name: 'Физическая активация',
    level: 2,
  });
  await expect(executionHeading).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`#/routine/morning\\?date=${today}&view=physical-execution$`),
  );

  await page.getByRole('button', { name: '← Утренний центр', exact: true }).click();
  await expect(
    physicalStage.getByText('Выполняется · 0 из 4 подходов', { exact: true }),
  ).toBeVisible();
  await expect(
    physicalStage.getByRole('button', { name: 'Продолжить', exact: true }),
  ).toBeVisible();
  await expect(physicalStage.getByRole('button', { name: 'Открыть', exact: true })).toHaveCount(0);
  await physicalStage.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(executionHeading).toBeFocused();

  const actual = page.getByLabel('Фактически');
  await expect(page.getByRole('heading', { name: 'Отжимания', level: 3 })).toBeVisible();
  await actual.fill('12');
  await page.getByRole('button', { name: 'Завершить подход', exact: true }).click();
  await expect(page.getByText('Фактически: 12 повторений', { exact: true })).toBeVisible();
  await expect(page.getByText('Подход 1 из 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Следующий подход', exact: true }).click();
  await expect(actual).toBeFocused();
  await expect(page.getByText('Подход 2 из 2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Поставить на паузу', exact: true }).click();
  await expect(page.getByText('На паузе', { exact: true })).toBeVisible();
  const timer = page.getByRole('timer');
  const pausedTimer = await timer.textContent();
  const timerSamples: Array<string | null> = [];
  await expect
    .poll(
      async () => {
        timerSamples.push(await timer.textContent());
        return timerSamples.length;
      },
      { timeout: 2_000, intervals: [500, 500] },
    )
    .toBe(3);
  expect(new Set(timerSamples)).toEqual(new Set([pausedTimer]));

  await page.reload();
  await expect(page.getByText('На паузе', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(timer).toHaveText(pausedTimer ?? '');
  await page.getByRole('button', { name: 'Продолжить выполнение', exact: true }).click();
  await expect(page.getByText('Выполнение идёт', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Пропустить подход', exact: true }).click();
  await expect(page.getByText('Подход пропущен', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Следующий подход', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Планка', level: 3 })).toBeVisible();
  await actual.fill('25');
  await page.getByRole('button', { name: 'Завершить подход', exact: true }).click();
  await expect(page.getByText('Фактически: 25 секунд', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Следующий подход', exact: true }).click();

  await page.getByRole('button', { name: '← Утренний центр', exact: true }).click();
  await expect(
    physicalStage.getByText('Выполняется · 3 из 4 подходов', { exact: true }),
  ).toBeVisible();
  await physicalStage.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Поставить на паузу', exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(
    new RegExp(`#/routine/morning\\?date=${today}&view=physical-execution$`),
  );
  await expect(page.getByText('Упражнение 2 из 2', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Подход 2 из 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Выполнено 3 из 4 подходов', { exact: true })).toBeVisible();

  await actual.fill('20');
  await page.getByRole('button', { name: 'Завершить подход', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить физическую активацию', exact: true }).click();
  const mirrorStage = page.locator('[data-morning-stage="mirror"]');
  await expect(mirrorStage).toHaveAttribute('data-morning-stage-status', 'optional');
  const mainActionStage = page.locator('[data-morning-stage="main-action"]');
  await expect(mainActionStage).toHaveAttribute('data-morning-stage-status', 'current');
  await expect(mainActionStage).toBeFocused();

  await page.goto(`/#/routine/morning?date=${today}&view=physical-execution`);
  await expect(page.getByText('Физическая активация завершена.', { exact: true })).toBeVisible();
  await expect(page.getByText('Выполнено подходов: 3', { exact: true })).toBeVisible();
  await expect(page.getByText('Пропущено подходов: 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Фактические повторения: 12', { exact: true })).toBeVisible();
  await expect(page.getByText('Фактическое время: 45 сек', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завершить подход', exact: true })).toHaveCount(0);

  await expectExecutionLayout(page, testInfo);
  expect(issues).toEqual([]);
});

test('MOR-04 completes mirror focus, persists it, and advances Main Action', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const issues = observeRuntimeIssues(page);
  await openMorningRoute(page);
  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  await page.getByRole('button', { name: 'Пропустить сегодня', exact: true }).click();
  await page.getByRole('button', { name: 'К обзору утра', exact: true }).click();

  const physicalStage = page.locator('[data-morning-stage="physical-activation"]');
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  await page.getByRole('button', { name: 'Отжимания повторения', exact: true }).click();
  await page.getByLabel('Уменьшить подходы: Отжимания').click();
  await page.getByLabel('Уменьшить подходы: Отжимания').click();
  await expect(
    page.getByText('Выбрано 1 упражнение · 1 подход · ≈ 2 мин', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Начать выполнение', exact: true }).click();
  await page.getByLabel('Фактически').fill('10');
  await page.getByRole('button', { name: 'Завершить подход', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить физическую активацию', exact: true }).click();

  const mirrorStage = page.locator('[data-morning-stage="mirror"]');
  await expect(mirrorStage).toHaveAttribute('data-morning-stage-status', 'optional');
  await expect(page.getByText('55%', { exact: true })).toBeVisible();
  const mirrorTrigger = mirrorStage.getByRole('button', { name: 'Открыть', exact: true });
  await mirrorTrigger.focus();
  await page.keyboard.press('Enter');

  const mirrorHeading = page.getByRole('heading', { name: 'Настрой перед зеркалом', level: 1 });
  await expect(mirrorHeading).toBeFocused();
  await expect(page.getByText('Этап 3 из 5', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Посмотри на себя и одним предложением назови, на чём сегодня будет твой главный фокус.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Что я начинаю первым — и почему это важно сегодня?', { exact: true }),
  ).toBeVisible();
  const mirrorView = page.locator('.morning-mirror');
  await expect(mirrorView.getByRole('textbox')).toHaveCount(0);
  await expect(mirrorView.getByRole('timer')).toHaveCount(0);
  await expectMirrorLayout(page, testInfo);

  await page.getByRole('button', { name: '← Утренний центр', exact: true }).click();
  await expect(mirrorTrigger).toBeFocused();
  await mirrorTrigger.click();
  await page.getByRole('button', { name: 'Завершить настрой', exact: true }).click();
  await expect(page.getByText('Фокус определён', { exact: true })).toBeVisible();

  const mainActionStage = page.locator('[data-morning-stage="main-action"]');
  await expect(mainActionStage).toHaveAttribute('data-morning-stage-status', 'current');
  await expect(mainActionStage).toBeFocused();
  await expect(page.getByText('55%', { exact: true })).toBeVisible();
  await expect(page.locator('.morning-center-time strong')).toContainText('≈ 7 мин');

  await page.reload();
  await expect(mainActionStage).toHaveAttribute('data-morning-stage-status', 'current');
  await expect(mirrorStage.getByText(/Настрой завершён ·/)).toBeVisible();
  await mirrorStage.getByRole('button', { name: 'Просмотреть', exact: true }).click();
  await expect(mirrorHeading).toBeFocused();
  await expect(page.getByText(/Завершено в \d{2}:\d{2}/)).toBeVisible();
  await expect(
    page.getByText('Исторический день доступен только для просмотра', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завершить настрой', exact: true })).toHaveCount(0);
  await expectMirrorLayout(page, testInfo);

  expect(issues).toEqual([]);
});

test('MOR-06 completes a normal morning, hands off to Today, and preserves history', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const issues = observeRuntimeIssues(page);
  const { today } = await openMorningRoute(page);
  await seedMorningMainAction(page, today);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Утренний распорядок', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  await page.getByRole('button', { name: 'Холодный душ выполнен', exact: true }).click();
  await page.getByRole('button', { name: 'К обзору утра', exact: true }).click();

  const physicalStage = page.locator('[data-morning-stage="physical-activation"]');
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  await page.getByRole('button', { name: 'Отжимания повторения', exact: true }).click();
  await page.getByLabel('Уменьшить подходы: Отжимания').click();
  await page.getByLabel('Уменьшить подходы: Отжимания').click();
  await page.getByRole('button', { name: 'Начать выполнение', exact: true }).click();
  await page.getByLabel('Фактически').fill('10');
  await page.getByRole('button', { name: 'Завершить подход', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить физическую активацию', exact: true }).click();

  const mirrorStage = page.locator('[data-morning-stage="mirror"]');
  await expect(mirrorStage).toHaveAttribute('data-morning-stage-status', 'optional');
  const workBlockStage = page.locator('[data-morning-stage="work-block"]');
  await expect(workBlockStage).toHaveAttribute('data-morning-stage-status', 'current');
  await workBlockStage.getByRole('button', { name: 'Открыть итог', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Утро завершено', level: 1 })).toBeVisible();
  await expect(
    page.getByText('1 упражнение · 1 подход · 10 повторений', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Подготовить MOR-06 к проверке', level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('09:00–11:00', { exact: true })).toBeVisible();
  await expect(page.locator('.morning-completion-main-action')).toContainText(
    'Рабочий результат MOR-06',
  );
  await expect(page.locator('.morning-completion-main-action')).toContainText(
    'Открыть итоговый экран и проверить переход',
  );
  const workBlockButton = page.getByRole('button', { name: 'Начать рабочий блок →', exact: true });
  await expect(workBlockButton).toBeVisible();
  await expectCompletionLayout(page, testInfo);

  await workBlockButton.click();
  await expect(page.locator('.today-page')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);

  await page.goto(`/#/routine/morning?date=${today}`);
  await expect(page.getByRole('heading', { name: 'Утро завершено', level: 1 })).toBeVisible();
  await expect(page.getByText('Переход к работе зафиксирован', { exact: true })).toBeVisible();
  await expect(workBlockButton).toHaveCount(0);
  await page.getByRole('tab', { name: 'История', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Последние утра', level: 1 })).toBeVisible();
  await expect(page.getByText('Подготовить MOR-06 к проверке', { exact: true })).toBeVisible();
  await expect(page.getByText('Вода', { exact: true })).toBeVisible();
  await expect(page.getByText('Холодный душ', { exact: true })).toBeVisible();
  await expect(page.getByText('Физическая активность', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '30 дней', exact: true }).click();
  await expect(page.getByRole('button', { name: '30 дней', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.getByText('Переход к работе зафиксирован', { exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expectCompletionLayout(page, testInfo);
  expect(issues).toEqual([]);
});

test('MOR-05 persists, reverts, and applies physical shortening at a safe boundary', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const issues = observeRuntimeIssues(page);
  await openMorningRoute(page);
  await page.getByRole('button', { name: 'Начать утро', exact: true }).click();
  await page.getByRole('button', { name: 'Выпил воду', exact: true }).click();
  await page.getByRole('button', { name: 'Холодный душ выполнен', exact: true }).click();
  await page.getByRole('button', { name: 'К обзору утра', exact: true }).click();

  const physicalStage = page.locator('[data-morning-stage="physical-activation"]');
  await physicalStage.getByRole('button', { name: 'Открыть', exact: true }).click();
  await page.getByRole('button', { name: 'Отжимания повторения', exact: true }).click();
  await page.getByLabel('Уменьшить подходы: Отжимания').click();
  await page.getByRole('button', { name: 'Начать выполнение', exact: true }).click();
  await expect(page.getByText('Подход 1 из 2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '← Утренний центр', exact: true }).click();
  const normalRemaining = await page.locator('.morning-center-time strong').textContent();
  await page.getByRole('button', { name: /Сократить утро/ }).click();
  await page.getByLabel('Сократить', { exact: true }).check();
  await page.getByRole('button', { name: 'Применить сокращение', exact: true }).click();

  await expect(page.getByText('Сокращённый режим', { exact: true })).toBeVisible();
  await expect(physicalStage).toHaveAttribute('data-morning-stage-scenario', 'shortened');
  await expect(page.locator('.morning-center-time strong')).not.toHaveText(normalRemaining ?? '');

  await page.reload();
  await expect(page.getByText('Сокращённый режим', { exact: true })).toBeVisible();
  await physicalStage.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByText('Подход 1 из 2', { exact: true })).toBeVisible();
  await page.getByLabel('Фактически').fill('12');
  await page.getByRole('button', { name: 'Завершить подход', exact: true }).click();
  await page.getByRole('button', { name: 'Следующий подход', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Завершить физическую активацию', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Подход 2 из 2', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '← Утренний центр', exact: true }).click();
  await page.getByRole('button', { name: /Вернуться к обычному/ }).click();
  await expect(page.getByText('Обычный режим восстановлен.', { exact: false })).toBeVisible();
  await expect(page.getByText('Сокращённый режим', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Обычный режим восстановлен.', { exact: false })).toBeVisible();
  await expectMorningLayout(page, testInfo);
  expect(issues).toEqual([]);
});

async function openMorningRoute(page: Page): Promise<{ today: string; yesterday: string }> {
  await page.goto('/');
  const dates = await page.evaluate(() => {
    const format = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const now = new Date();
    const previous = new Date(now);
    previous.setDate(previous.getDate() - 1);
    return { today: format(now), yesterday: format(previous) };
  });
  await page.goto(`/#/routine/morning?date=${dates.today}`);
  await expect(
    page.getByRole('heading', { name: 'Утренний распорядок', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Загружаем утренний центр…', { exact: true })).toHaveCount(0);
  return dates;
}

async function seedPreviousMorning(page: Page, dateKey: string): Promise<void> {
  await page.evaluate(async (previousDate) => {
    const startedAt = new Date(`${previousDate}T07:00:00`).toISOString();
    const record = {
      schemaVersion: 1,
      id: 'morning-e2e-previous',
      dayId: 'morning-e2e-previous-day',
      dateKey: previousDate,
      state: 'IN_PROGRESS',
      startedAt,
      finishedAt: null,
      shortenedMode: false,
      stageStates: [],
      waterCompletedAt: null,
      waterAmountMl: null,
      physicalStatus: 'NOT_CONFIGURED',
      physicalUpdatedAt: null,
      updatedAt: startedAt,
      version: 2,
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onerror = () => reject(request.error ?? new Error('Cannot open LifeOS database'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('morningCycles', 'readwrite');
        transaction.objectStore('morningCycles').put(record);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('Cannot seed morning'));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('Seeding morning was aborted'));
        };
      };
    });
  }, dateKey);
}

async function seedMorningMainAction(page: Page, dateKey: string): Promise<void> {
  await page.evaluate(async (today) => {
    const timestamp = new Date(`${today}T06:00:00`).toISOString();
    const decisionId = 'morning-e2e-mor06-decision';
    const actionId = 'morning-e2e-mor06-action';
    const records = {
      tomorrowPlans: {
        schemaVersion: 1,
        id: 'morning-e2e-mor06-plan',
        cycleId: 'morning-e2e-mor06-evening-cycle',
        sourceDayId: 'morning-e2e-mor06-source-day',
        targetDayId: 'morning-e2e-mor06-target-day',
        targetDateKey: today,
        directionId: null,
        vector: null,
        primaryDecisionId: decisionId,
        minimumOutcome: 'Рабочий результат MOR-06',
        targetOutcome: null,
        stretchOutcome: null,
        firstActionId: actionId,
        firstAttentionItem: null,
        planningQuality: 'FULL',
        supportingDecisionIds: [],
        status: 'COMPLETED',
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
        version: 1,
      },
      decisions: {
        schemaVersion: 1,
        id: decisionId,
        title: 'Подготовить MOR-06 к проверке',
        reason: null,
        sphereId: null,
        price: null,
        sacrifices: null,
        priority: 'high',
        projectReference: null,
        projectId: null,
        expectedResult: 'Рабочий результат MOR-06',
        actualResultSummary: null,
        status: 'planned',
        kind: 'main',
        plannedDate: today,
        order: 1,
        createdAt: timestamp,
        plannedAt: timestamp,
        startedAt: null,
        confirmedAt: null,
        cancelledAt: null,
        cancelReason: null,
        archivedAt: null,
        deletedAt: null,
        lastDeletedAt: null,
        restoredFromTrashAt: null,
        evidenceIds: [],
        rescheduleCount: 0,
        rescheduleHistory: [],
        version: 1,
      },
      lifeActions: {
        schemaVersion: 1,
        id: actionId,
        title: 'Открыть итоговый экран и проверить переход',
        description: null,
        expectedResult: 'Рабочий результат MOR-06',
        actualResult: null,
        status: 'ready',
        decisionId,
        sphereId: null,
        plannedDate: today,
        createdAt: timestamp,
        readyAt: timestamp,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        cancelReason: null,
        archivedAt: null,
        rescheduleCount: 0,
        version: 1,
      },
      routineBlocks: {
        schemaVersion: 1,
        id: 'morning-e2e-mor06-work-block',
        anchorDate: today,
        title: 'Рабочий блок MOR-06',
        startTime: '09:00',
        endTime: '11:00',
        category: 'work',
        recurrence: 'none',
        selectedWeekdays: [],
        required: true,
        assignment: 'existingAction',
        actionId,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      },
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lifeos');
      request.onerror = () => reject(request.error ?? new Error('Cannot open LifeOS database'));
      request.onsuccess = () => {
        const database = request.result;
        const stores = Object.keys(records);
        const transaction = database.transaction(stores, 'readwrite');
        for (const store of stores) {
          transaction.objectStore(store).put(records[store as keyof typeof records]);
        }
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('Cannot seed MOR-06 main action'));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error('MOR-06 main action seeding was aborted'));
        };
      };
    });
  }, dateKey);
}

async function expectCompletionLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const clipped = await page
      .locator(
        '.morning-completion, .morning-completion > *, .morning-completion h1, .morning-completion h2, .morning-completion p, .morning-completion strong, .morning-completion span, .morning-completion button',
      )
      .evaluateAll((elements) => {
        const viewportWidth = document.documentElement.clientWidth;
        return elements
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => !element.classList.contains('visually-hidden'))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.left < -1 ||
              rect.right > viewportWidth + 1 ||
              element.scrollWidth > element.clientWidth + 1
            );
          })
          .map((element) => element.outerHTML.slice(0, 180));
      });
    expect(clipped, `${viewport.width}x${viewport.height}`).toEqual([]);
  }
}

async function expectMorningLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const clipped = await page
      .locator(
        '.morning-center, .morning-center > *, .morning-center h2, .morning-center h3, .morning-center p, .morning-center strong, .morning-center span, .morning-center button',
      )
      .evaluateAll((elements) => {
        const viewportWidth = document.documentElement.clientWidth;
        return elements
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => !element.classList.contains('visually-hidden'))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.left < -1 ||
              rect.right > viewportWidth + 1 ||
              element.scrollWidth > element.clientWidth + 1
            );
          })
          .map((element) => ({
            className: element.className,
            text: element.textContent?.slice(0, 80),
          }));
      });
    expect(clipped, `${viewport.width}x${viewport.height}`).toEqual([]);

    const tooSmall = await page
      .locator('.morning-center button:visible')
      .evaluateAll((buttons) =>
        buttons.some((button) => button.getBoundingClientRect().height < 44),
      );
    expect(tooSmall, `${viewport.width}x${viewport.height}`).toBe(false);
  }
}

async function expectQuickStartReviewLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewport =
    testInfo.project.name === 'mobile-chrome'
      ? { width: 390, height: 844, maximumCurrentHeight: 200 }
      : { width: 1600, height: 900, maximumCurrentHeight: 160 };
  await page.setViewportSize(viewport);

  const layout = await page.evaluate(() => {
    const header = document.querySelector('.morning-quick-start-header');
    const steps = document.querySelector('.morning-quick-start-steps');
    const current = document.querySelector('.morning-action-card-current');
    const upcoming = document.querySelector('.morning-action-card-upcoming');
    const primary = current?.querySelector('.primary-button');
    if (!header || !steps || !current || !upcoming || !primary) {
      throw new Error('Quick Start review layout is incomplete');
    }
    const headerStyle = getComputedStyle(header);
    const upcomingStyle = getComputedStyle(upcoming);
    return {
      headerBorderWidth: headerStyle.borderTopWidth,
      headerBackgroundImage: headerStyle.backgroundImage,
      stepsWidth: steps.getBoundingClientRect().width,
      currentHeight: current.getBoundingClientRect().height,
      currentWidth: current.getBoundingClientRect().width,
      primaryWidth: primary.getBoundingClientRect().width,
      upcomingOpacity: upcomingStyle.opacity,
    };
  });

  expect(layout.headerBorderWidth).toBe('0px');
  expect(layout.headerBackgroundImage).toBe('none');
  expect(layout.stepsWidth).toBeLessThanOrEqual(320);
  expect(layout.currentHeight).toBeLessThanOrEqual(viewport.maximumCurrentHeight);
  expect(layout.primaryWidth).toBeLessThan(layout.currentWidth * 0.6);
  expect(layout.upcomingOpacity).toBe('1');
}

async function expectPhysicalLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const overflow = await page.locator('.morning-physical').evaluate((root) => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      section: root.scrollWidth - root.clientWidth,
    }));
    expect(overflow, `${viewport.width}x${viewport.height}`).toEqual({ page: 0, section: 0 });
    const tooSmall = await page
      .locator('.morning-physical button:visible')
      .evaluateAll((buttons) =>
        buttons.some((button) => button.getBoundingClientRect().height < 44),
      );
    expect(tooSmall, `${viewport.width}x${viewport.height}`).toBe(false);

    const composition = await page.locator('.morning-physical-layout').evaluate((layout) => {
      const library = layout.querySelector('.morning-physical-library')?.getBoundingClientRect();
      const plan = layout.querySelector('.morning-physical-plan')?.getBoundingClientRect();
      const selection = layout
        .querySelector('.morning-physical-selection')
        ?.getBoundingClientRect();
      const cta = layout.querySelector('.morning-physical-cta')?.getBoundingClientRect();
      const layoutRect = layout.getBoundingClientRect();
      if (!library || !plan || !selection || !cta) {
        throw new Error('Physical layout is incomplete');
      }
      return {
        layoutWidth: layoutRect.width,
        library: {
          top: library.top + scrollY,
          bottom: library.bottom + scrollY,
          width: library.width,
        },
        plan: { top: plan.top + scrollY, width: plan.width },
        selectionBottom: selection.bottom + scrollY,
        ctaTop: cta.top + scrollY,
      };
    });

    if (testInfo.project.name === 'mobile-chrome') {
      expect(composition.plan.top, `${viewport.width}x${viewport.height}`).toBeGreaterThan(
        composition.library.bottom,
      );
      expect(composition.plan.width, `${viewport.width}x${viewport.height}`).toBeCloseTo(
        composition.library.width,
        0,
      );
      expect(composition.ctaTop, `${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(
        composition.selectionBottom,
      );

      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      const safeArea = await page.evaluate(() => {
        const cta = document.querySelector('.morning-physical-cta')?.getBoundingClientRect();
        const navigation = document
          .querySelector('.application-bottom-navigation')
          ?.getBoundingClientRect();
        if (!cta || !navigation) throw new Error('Mobile CTA or navigation is unavailable');
        return { ctaBottom: cta.bottom, navigationTop: navigation.top };
      });
      expect(safeArea.ctaBottom, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
        safeArea.navigationTop,
      );
    } else {
      const planRatio = composition.plan.width / composition.layoutWidth;
      expect(planRatio, `${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(0.4);
      expect(planRatio, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(0.45);
    }
  }
}

async function expectExecutionLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const overflow = await page.locator('.morning-execution').evaluate((root) => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      section: root.scrollWidth - root.clientWidth,
    }));
    expect(overflow, `${viewport.width}x${viewport.height}`).toEqual({ page: 0, section: 0 });

    const tooSmall = await page
      .locator('.morning-execution button:visible, .morning-execution input:visible')
      .evaluateAll((controls) =>
        controls.some((control) => control.getBoundingClientRect().height < 44),
      );
    expect(tooSmall, `${viewport.width}x${viewport.height}`).toBe(false);

    if (testInfo.project.name === 'mobile-chrome') {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      const safeArea = await page.evaluate(() => {
        const execution = document.querySelector('.morning-execution')?.getBoundingClientRect();
        const navigation = document
          .querySelector('.application-bottom-navigation')
          ?.getBoundingClientRect();
        if (!execution || !navigation) {
          throw new Error('Execution or bottom navigation unavailable');
        }
        return { executionBottom: execution.bottom, navigationTop: navigation.top };
      });
      expect(safeArea.executionBottom, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
        safeArea.navigationTop,
      );
    }
  }
}

async function expectMirrorLayout(page: Page, testInfo: TestInfo): Promise<void> {
  const viewports =
    testInfo.project.name === 'mobile-chrome'
      ? [
          { width: 390, height: 844 },
          { width: 360, height: 800 },
        ]
      : [
          { width: 1600, height: 900 },
          { width: 1280, height: 720 },
        ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const overflow = await page.locator('.morning-mirror').evaluate((root) => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      section: root.scrollWidth - root.clientWidth,
    }));
    expect(overflow, `${viewport.width}x${viewport.height}`).toEqual({ page: 0, section: 0 });

    const controls = await page.locator('.morning-mirror button:visible').evaluateAll((buttons) =>
      buttons.map((button) => ({
        height: button.getBoundingClientRect().height,
        primary: button.classList.contains('primary-button'),
      })),
    );
    expect(
      controls.every((control) => control.height >= 44),
      `${viewport.width}x${viewport.height}`,
    ).toBe(true);
    expect(
      controls.filter((control) => control.primary).every((control) => control.height >= 48),
      `${viewport.width}x${viewport.height}`,
    ).toBe(true);

    if (testInfo.project.name === 'mobile-chrome') {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      const safeArea = await page.evaluate(() => {
        const mirror = document.querySelector('.morning-mirror')?.getBoundingClientRect();
        const navigation = document
          .querySelector('.application-bottom-navigation')
          ?.getBoundingClientRect();
        if (!mirror || !navigation) throw new Error('Mirror or bottom navigation unavailable');
        return { mirrorBottom: mirror.bottom, navigationTop: navigation.top };
      });
      expect(safeArea.mirrorBottom, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
        safeArea.navigationTop,
      );
    }
  }
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function observeRuntimeIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
      issues.push(`console: ${message.text()}`);
    }
  });
  return issues;
}
