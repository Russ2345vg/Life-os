# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: management-overview.redesign.spec.ts >> overview reflows and exposes an honest actionable empty state
- Location: tests\e2e\management-overview.redesign.spec.ts:9:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
    - link "Перейти к содержимому" [ref=e4] [cursor=pointer]:
        - /url: '#application-content'
    - complementary "Навигация LifeOS" [ref=e5]:
        - generic [ref=e6]:
            - generic [ref=e7]: L
            - generic [ref=e8]:
                - paragraph [ref=e9]: LifeOS
                - paragraph [ref=e10]: Личная система действий
            - button "Свернуть боковое меню" [ref=e11] [cursor=pointer]
        - navigation "Основные разделы" [ref=e15]:
            - button "День" [ref=e16] [cursor=pointer]
            - button "Управление" [ref=e22] [cursor=pointer]
            - button "Распорядок" [ref=e27] [cursor=pointer]
            - button "Прогулки" [ref=e32] [cursor=pointer]
            - button "Сферы" [ref=e37] [cursor=pointer]
            - button "История" [ref=e42] [cursor=pointer]
            - button "Вечерняя аналитика" [ref=e47] [cursor=pointer]
            - button "Ещё" [ref=e51] [cursor=pointer]
        - button "Голосовые команды" [ref=e58] [cursor=pointer]
        - generic "День не начат. Проверьте главные решения" [ref=e63]:
            - generic [ref=e65]:
                - strong [ref=e66]: День не начат
                - generic [ref=e67]: Проверьте главные решения
        - 'button "Синхронизация: Синхронизация не настроена. Открыть настройки" [ref=e69] [cursor=pointer]':
            - generic [ref=e73]: Локально
    - generic [ref=e76]:
        - navigation "Разделы управления" [ref=e77]:
            - tablist "Управление" [ref=e78]:
                - tab "Обзор" [active] [selected] [ref=e79] [cursor=pointer]
                - tab "Направления" [ref=e81] [cursor=pointer]
                - tab "Альбом целей" [ref=e83] [cursor=pointer]
                - tab "Решения" [ref=e85] [cursor=pointer]
                - tab "Действия" [ref=e87] [cursor=pointer]
                - tab "День" [ref=e89] [cursor=pointer]
        - main [ref=e92]:
            - generic [ref=e93]:
                - generic [ref=e94]:
                    - paragraph [ref=e95]: Текущее состояние
                    - heading "Обзор управления" [level=1] [ref=e96]
                    - paragraph [ref=e97]: Фокус, день, курс и только достоверные сигналы.
                - time [ref=e99]: 9 сентября 2026 г.
            - generic [ref=e104]:
                - region [ref=e105]:
                    - generic [ref=e109]:
                        - paragraph [ref=e110]: Главное сейчас
                        - heading "Фокус не определён" [level=2] [ref=e111]
                        - paragraph [ref=e112]: Выберите главную цель или направление, чтобы видеть их здесь
                    - button "Определить фокус" [ref=e114] [cursor=pointer]
                - generic [ref=e117]:
                    - region "Сегодня" [ref=e118]:
                        - generic [ref=e119]:
                            - generic [ref=e124]:
                                - heading "Сегодня" [level=2] [ref=e125]
                                - paragraph [ref=e126]: Текущий день
                            - button "Открыть день" [ref=e127] [cursor=pointer]
                        - generic [ref=e130]:
                            - generic [ref=e131]:
                                - generic [ref=e132]: Главное решение
                                - strong [ref=e133]: Не определено
                            - generic [ref=e134]:
                                - generic [ref=e135]: Решения
                                - strong [ref=e136]: '0'
                            - generic [ref=e137]:
                                - generic [ref=e138]: Действия
                                - strong [ref=e139]: '0'
                    - region "Курс" [ref=e140]:
                        - generic [ref=e144]:
                            - heading "Курс" [level=2] [ref=e145]
                            - paragraph [ref=e146]: Ваше долгосрочное движение
                        - generic [ref=e147]:
                            - button "Активные направления 0" [ref=e148] [cursor=pointer]:
                                - generic [ref=e149]: Активные направления
                                - strong [ref=e150]: '0'
                            - button "Активные цели 0" [ref=e151] [cursor=pointer]:
                                - generic [ref=e152]: Активные цели
                                - strong [ref=e153]: '0'
                    - region "Внимание" [ref=e154]:
                        - generic [ref=e155]:
                            - generic [ref=e158]:
                                - heading "Внимание" [level=2] [ref=e159]
                                - paragraph [ref=e160]: То, что требует решения
                            - button "Смотреть сигналы" [ref=e161] [cursor=pointer]
                        - generic [ref=e164]:
                            - generic [ref=e165]:
                                - generic [ref=e166]: Всего сигналов
                                - strong [ref=e167]: '1'
                            - paragraph [ref=e168]: Проверьте связи и уточните следующий шаг.
                    - region "Следующий шаг" [ref=e169]:
                        - generic [ref=e174]:
                            - heading "Следующий шаг" [level=2] [ref=e175]
                            - paragraph [ref=e176]: Быстрый переход
                        - button "Определить фокус Выберите, чему уделить главное внимание." [ref=e178] [cursor=pointer]:
                            - generic [ref=e182]:
                                - strong [ref=e183]: Определить фокус
                                - generic [ref=e184]: Выберите, чему уделить главное внимание.
                - region [ref=e187]:
                    - generic [ref=e188]:
                        - generic [ref=e191]:
                            - heading "Сигналы внимания" [level=2] [ref=e192]
                            - paragraph [ref=e193]: То, что требует решения или уточнения
                        - generic [ref=e194]: 'Все сигналы: 1'
                    - list [ref=e195]:
                        - listitem [ref=e196]:
                            - generic [ref=e200]:
                                - heading "Фокус не определён" [level=3] [ref=e201]
                                - paragraph [ref=e202]: Нет главной цели или главного направления.
                            - button "Определить фокус" [ref=e203] [cursor=pointer]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   |
  3   | async function openOverview(page: Page) {
  4   |   await page.goto('/#/goals');
  5   |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  6   |   await expect(page.getByRole('heading', { name: 'Обзор управления', exact: true })).toBeVisible();
  7   | }
  8   |
  9   | test('overview reflows and exposes an honest actionable empty state', async ({ page }, info) => {
  10  |   const errors: string[] = [];
  11  |   page.on('pageerror', (error) => errors.push(error.message));
  12  |   await openOverview(page);
  13  |   for (const [width, height] of [
  14  |     [1440, 900],
  15  |     [1280, 800],
  16  |     [768, 1024],
  17  |     [390, 844],
  18  |     [360, 800],
  19  |   ]) {
  20  |     await page.setViewportSize({ width, height });
  21  |     await expect(page.locator('#management-focus-heading')).toContainText('Фокус не определён');
  22  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  23  |       true,
  24  |     );
  25  |     const sizes = await page.locator('.management-overview button:visible').evaluateAll((buttons) =>
  26  |       buttons.map((button) => {
  27  |         const rect = button.getBoundingClientRect();
  28  |         return [rect.width, rect.height];
  29  |       }),
  30  |     );
> 31  |     expect(sizes.every(([w, h]) => w >= 44 && h >= 44)).toBe(true);
      |                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  32  |     await page.screenshot({ path: info.outputPath(`overview-${width}.png`), fullPage: true });
  33  |   }
  34  |   await expect(page.getByRole('heading', { name: 'Следующий шаг', exact: true })).toBeVisible();
  35  |   await expect(page.getByText('Критичных', { exact: true })).toHaveCount(0);
  36  |   await page.getByRole('button', { name: 'Смотреть сигналы', exact: true }).click();
  37  |   await expect(page.locator('#overview-signals-heading')).toBeFocused();
  38  |   await expect(page.locator('.overview-signal-count')).toHaveText('Все сигналы: 1');
  39  |   await expect(page.locator('.overview-signal-list li')).toHaveCount(1);
  40  |   await page.emulateMedia({ reducedMotion: 'reduce' });
  41  |   expect(
  42  |     await page
  43  |       .locator('.overview-content')
  44  |       .evaluate((element) => getComputedStyle(element).animationName),
  45  |   ).toBe('none');
  46  |   await page.locator('.overview-focus .primary-button').press('Enter');
  47  |   await expect(page.getByRole('tab', { name: 'Направления', exact: true })).toHaveAttribute(
  48  |     'aria-selected',
  49  |     'true',
  50  |   );
  51  |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  52  |   await expect(page.locator('#management-focus-heading')).toHaveText('Фокус не определён');
  53  |   await page.getByRole('button', { name: 'Открыть день', exact: true }).click();
  54  |   await expect(page.getByRole('tab', { name: 'День', exact: true })).toHaveAttribute(
  55  |     'aria-selected',
  56  |     'true',
  57  |   );
  58  |   expect(errors).toEqual([]);
  59  | });
  60  |
  61  | test('overview assigns and persists direction and goal focus through existing commands', async ({
  62  |   page,
  63  | }, info) => {
  64  |   const errors: string[] = [];
  65  |   page.on('pageerror', (error) => errors.push(error.message));
  66  |   await openOverview(page);
  67  |   await page.locator('.overview-focus .primary-button').click();
  68  |   await page.getByRole('button', { name: 'Создать направление', exact: true }).click();
  69  |   await page.locator('#direction-name').fill('Личное развитие');
  70  |   await page
  71  |     .locator('form')
  72  |     .filter({ has: page.locator('#direction-name') })
  73  |     .getByRole('button', { name: 'Создать направление', exact: true })
  74  |     .click();
  75  |   await expect(page.locator('#direction-name')).toHaveCount(0);
  76  |   await page.locator('summary[aria-label="Действия: Личное развитие"]').click();
  77  |   await page.getByRole('button', { name: 'Сделать главным', exact: true }).click();
  78  |   await expect(page.getByText('Главное направление обновлено.', { exact: true })).toBeVisible();
  79  |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  80  |   await expect(page.locator('#management-focus-heading')).toHaveText('Личное развитие');
  81  |   await page.reload();
  82  |   await page.getByRole('button', { name: 'Управление', exact: true }).click();
  83  |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  84  |   await expect(page.locator('#management-focus-heading')).toHaveText('Личное развитие');
  85  |   await page
  86  |     .locator('.overview-focus')
  87  |     .getByRole('button', { name: 'Открыть направление', exact: true })
  88  |     .click();
  89  |   await expect(
  90  |     page.getByRole('heading', { level: 1, name: 'Личное развитие', exact: true }),
  91  |   ).toBeVisible();
  92  |   await page
  93  |     .locator('.direction-focus')
  94  |     .getByRole('button', { name: 'Создать цель', exact: true })
  95  |     .click();
  96  |   await page.locator('#direction-project-title').fill('Отменённый выбор');
  97  |   await page.locator('label[for="direction-project-main"]').click();
  98  |   await expect(page.locator('#direction-project-main')).toBeChecked();
  99  |   await page
  100 |     .locator('.direction-project-form')
  101 |     .getByRole('button', { name: 'Отмена', exact: true })
  102 |     .click();
  103 |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  104 |   await expect(page.locator('#management-focus-heading')).toHaveText('Личное развитие');
  105 |   await page
  106 |     .locator('.overview-focus')
  107 |     .getByRole('button', { name: 'Открыть направление', exact: true })
  108 |     .click();
  109 |   await page
  110 |     .locator('.direction-focus')
  111 |     .getByRole('button', { name: 'Создать цель', exact: true })
  112 |     .click();
  113 |   const title = 'Развивать_LifeOS_и_сохранять_длинные_названия_целей_без_обрезания';
  114 |   await page.locator('#direction-project-title').fill(title);
  115 |   await page.locator('label[for="direction-project-main"]').click();
  116 |   await expect(page.locator('#direction-project-main')).toBeChecked();
  117 |   await page
  118 |     .locator('.direction-project-form')
  119 |     .getByRole('button', { name: 'Создать цель', exact: true })
  120 |     .click();
  121 |   await expect(
  122 |     page.getByText('Цель создана в текущем направлении.', { exact: true }),
  123 |   ).toBeVisible();
  124 |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  125 |   await expect(page.locator('#management-focus-heading')).toHaveText(title);
  126 |   await page.reload();
  127 |   await page.getByRole('button', { name: 'Управление', exact: true }).click();
  128 |   await page.getByRole('tab', { name: 'Обзор', exact: true }).click();
  129 |   await expect(page.locator('#management-focus-heading')).toHaveText(title);
  130 |   await page
  131 |     .locator('.overview-focus')
```
