import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`morning workout restores progress and completes without a timer on ${viewport.name}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/#/v2/today');

    const card = page.getByRole('region', { name: 'Утренняя зарядка' });
    await expect(card).toContainText('≈ 30 минут');
    await expect(card).toContainText('15 подходов');
    await expect(card.getByRole('timer')).toHaveCount(0);
    await card.getByRole('button', { name: 'Начать зарядку' }).click();
    await expect(card).toContainText('0 из 15 подходов');

    await card.getByRole('button', { name: 'Готово' }).click();
    await expect(card).toContainText('1 из 15 подходов');
    await page.reload();
    await expect(card).toContainText('1 из 15 подходов');

    for (let completed = 2; completed <= 15; completed += 1) {
      await card.getByRole('button', { name: 'Готово' }).click();
      await expect(card).toContainText(`${completed} из 15 подходов`);
    }

    await expect(card).toContainText('Зарядка выполнена');
    await expect(card).toContainText('Нагрузка на следующее утро');
    await expect(card.getByRole('button', { name: 'Принять на завтра' })).toBeVisible();
    await card.getByRole('button', { name: 'Принять на завтра' }).click();
    await expect(card).toContainText('Новая нагрузка принята');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
