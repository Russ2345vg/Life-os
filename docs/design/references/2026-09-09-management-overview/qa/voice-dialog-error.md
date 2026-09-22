# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: voice-commands.acceptance.spec.ts >> unsupported microphone keeps manual commands usable with focus and responsive layouts
- Location: tests\e2e\voice-commands.acceptance.spec.ts:39:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 720
Received:    731.5
```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - main [ref=e76]:
            - region "Навигация по датам" [ref=e77]:
                - generic [ref=e78]:
                    - button "Открыть предыдущий день" [ref=e79] [cursor=pointer]: ←
                    - button "Открыть следующий день" [ref=e80] [cursor=pointer]: →
                    - button "Сегодня" [disabled] [ref=e81]
                - generic [ref=e82]:
                    - button "Планировать 10 сентября" [ref=e83] [cursor=pointer]
                    - generic "Выбрать дату" [ref=e84] [cursor=pointer]:
                        - textbox "Выбрать дату" [ref=e90]: 2026-09-09
            - generic [ref=e92]:
                - paragraph [ref=e93]: План дня
                - heading "Сегодня" [level=1] [ref=e94]
                - paragraph [ref=e95]: Среда · 9 сентября 2026 г.
            - generic "Сводка дня" [ref=e96]:
                - generic [ref=e102]:
                    - term [ref=e103]: Решения
                    - definition [ref=e104]:
                        - generic [ref=e105]: 0 / 0
                    - generic [ref=e106]: выполнено
                - generic [ref=e111]:
                    - term [ref=e112]: Действия
                    - definition [ref=e113]:
                        - generic [ref=e114]: 0 / 0
                    - generic [ref=e115]: выполнено
                - generic [ref=e121]:
                    - term [ref=e122]: Время действия
                    - definition [ref=e123]:
                        - generic [ref=e124]: —
                    - generic [ref=e125]: Нет сессий
                - generic [ref=e132]:
                    - term [ref=e133]: Статус дня
                    - definition [ref=e134]:
                        - generic [ref=e135]: День не начат
                    - generic [ref=e136]: Готов к старту
            - generic "Рабочая панель дня" [ref=e137]:
                - generic [ref=e138]:
                    - generic [ref=e139]:
                        - region [ref=e140]:
                            - generic [ref=e141]:
                                - generic [ref=e142]:
                                    - paragraph [ref=e143]: Фокус дня
                                    - heading "Главные решения" [level=2] [ref=e144]
                                - generic [ref=e145]: 0 из 3
                            - button "Добавить главное решение" [ref=e147] [cursor=pointer]
                        - region [ref=e151]:
                            - generic [ref=e152]:
                                - generic [ref=e153]:
                                    - paragraph [ref=e154]: Поддержка плана
                                    - heading "Дополнительные решения" [level=2] [ref=e155]
                                - generic [ref=e156]: '0'
                            - generic [ref=e157]:
                                - strong [ref=e161]: Пока дополнительных решений нет
                                - paragraph [ref=e162]: Добавьте вспомогательные решения для выполнения плана.
                                - button "Добавить решение" [ref=e163] [cursor=pointer]
                    - region [ref=e166]:
                        - generic [ref=e167]:
                            - generic [ref=e168]:
                                - paragraph [ref=e169]: Ритм дня
                                - heading "Распорядок дня" [level=2] [ref=e170]
                            - button "Открыть" [ref=e171] [cursor=pointer]
                        - generic [ref=e172]:
                            - strong [ref=e173]: Блоки дня пока не заданы
                            - paragraph [ref=e174]: Настройте распорядок, чтобы видеть ритм дня на одной панели.
                - complementary "Панель дня" [ref=e175]:
                    - region [ref=e176]:
                        - generic [ref=e178]:
                            - paragraph [ref=e179]: Подготовка
                            - heading "Сначала создайте главное Решение" [level=2] [ref=e180]
                            - paragraph [ref=e181]: Оно определит направление дня и откроет возможность начать рабочий цикл.
                        - generic [ref=e182]:
                            - generic [ref=e183]:
                                - generic [ref=e184]: Подготовка плана
                                - strong [ref=e185]: 0 из 3 главных Решений
                            - 'progressbar "Подготовка плана: 0 из 3" [ref=e186]'
                        - button "Создать Решение →" [ref=e187] [cursor=pointer]
                    - region [ref=e188]:
                        - heading "Быстрые действия" [level=2] [ref=e189]
                        - generic [ref=e190]:
                            - button "Открыть распорядок дня" [ref=e191] [cursor=pointer]:
                                - generic [ref=e196]: ›
                            - button "Задать фокус" [ref=e197] [cursor=pointer]:
                                - generic [ref=e202]: ›
                            - button "Добавить действие" [ref=e203] [cursor=pointer]:
                                - generic [ref=e207]: ›
                    - region [ref=e208]:
                        - heading "Напоминания" [level=2] [ref=e210]
                        - generic [ref=e211]:
                            - strong [ref=e212]: Нет активных напоминаний
                            - paragraph [ref=e213]: Вы молодец, всё под контролем.
                    - region [ref=e214]:
                        - heading "Фокус сегодня" [level=2] [ref=e215]
                        - generic [ref=e216]:
                            - strong [ref=e217]: Фокус не задан
                            - paragraph [ref=e218]: Определите главный акцент дня.
                            - button "Задать фокус" [ref=e219] [cursor=pointer]
    - dialog [ref=e220]:
        - banner [ref=e221]:
            - generic [ref=e225]:
                - paragraph [ref=e226]: LifeOS · быстрые действия
                - heading "Голосовые команды" [level=2] [ref=e227]
        - status [ref=e228]: Команда понятна. Проверьте данные перед подтверждением.
        - generic [ref=e229]:
            - button "Голосовой ввод недоступен" [disabled] [active] [ref=e230]
            - generic [ref=e234]: Голосовой ввод недоступен
        - paragraph [ref=e235]: Голосовой ввод недоступен в этом браузере. Введите команду вручную.
        - generic [ref=e236]: Текст команды
        - textbox "Текст команды" [ref=e239]:
            - /placeholder: Добавь задачу купить продукты завтра
            - text: Добавь задачу проверить мобильную версию завтра
        - region "Предпросмотр команды" [ref=e240]:
            - heading "Создать задачу?" [level=3] [ref=e241]
            - paragraph [ref=e242]: проверить мобильную версию
            - paragraph [ref=e243]: 'Дата: завтра · 2026-09-10'
            - paragraph [ref=e244]: Дополнительное решение · обычный приоритет
        - paragraph [ref=e245]: Проверьте услышанный текст. Его можно исправить выше и разобрать заново.
        - contentinfo [ref=e246]:
            - button "Отмена" [ref=e247] [cursor=pointer]
            - button "Создать" [ref=e248] [cursor=pointer]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { installSpeech, speech } from './helpers/voiceFake';
  3   |
  4   | async function openPalette(page: Page) {
  5   |   await page.getByRole('button', { name: 'Голосовые команды', exact: true }).click();
  6   |   return page.getByRole('dialog', { name: 'Голосовые команды' });
  7   | }
  8   | test('global speech creates a task only after preview confirmation and shows the persisted result', async ({
  9   |   page,
  10  | }, info) => {
  11  |   const errors: string[] = [];
  12  |   page.on('pageerror', (error) => errors.push(error.message));
  13  |   await installSpeech(page);
  14  |   await page.goto('/');
  15  |   const dialog = await openPalette(page);
  16  |   await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  17  |   await expect(dialog.getByRole('status')).toContainText('Слушаю');
  18  |   await speech(page, 'result', 0, 'Добавь задачу купить продукты завтра');
  19  |   await dialog.getByRole('button', { name: 'Остановить голосовой ввод' }).click();
  20  |   await expect(dialog.getByRole('status')).toContainText('Обрабатываю');
  21  |   await speech(page, 'end', 0);
  22  |   await expect(dialog.getByRole('heading', { name: 'Создать задачу?' })).toBeVisible();
  23  |   await expect(dialog.getByLabel('Текст команды')).toHaveValue(
  24  |     'Добавь задачу купить продукты завтра',
  25  |   );
  26  |   await expect(dialog).toContainText('завтра');
  27  |   await dialog.screenshot({ path: info.outputPath('voice-task-preview.png') });
  28  |   await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  29  |   await expect(dialog).toContainText('Задача создана');
  30  |   await dialog.screenshot({ path: info.outputPath('voice-success.png') });
  31  |   await dialog.getByRole('button', { name: 'Открыть задачу' }).click();
  32  |   await expect(dialog).not.toBeVisible();
  33  |   await expect(page.getByText('купить продукты', { exact: true }).first()).toBeVisible();
  34  |   await page.reload();
  35  |   // The command persisted; navigating to tomorrow through the UI is covered by the result action above.
  36  |   expect(errors).toEqual([]);
  37  | });
  38  |
  39  | test('unsupported microphone keeps manual commands usable with focus and responsive layouts', async ({
  40  |   page,
  41  | }, info) => {
  42  |   const errors: string[] = [];
  43  |   page.on('pageerror', (error) => errors.push(error.message));
  44  |   page.on('console', (message) => {
  45  |     if (message.type() === 'error') errors.push(message.text());
  46  |   });
  47  |   await installSpeech(page, false);
  48  |   await page.emulateMedia({ reducedMotion: 'reduce' });
  49  |   await page.goto('/');
  50  |   const dialog = await openPalette(page);
  51  |   await expect(dialog).toContainText('Введите команду вручную');
  52  |   await dialog.getByLabel('Текст команды').fill('Сделай что-нибудь');
  53  |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  54  |   await expect(dialog.getByRole('alert')).toContainText('Не удалось понять команду');
  55  |   await dialog.getByLabel('Текст команды').fill('Добавь задачу проверить мобильную версию завтра');
  56  |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  57  |   await expect(dialog.getByRole('heading', { name: 'Создать задачу?' })).toBeVisible();
  58  |   await dialog.getByRole('button', { name: 'Создать', exact: true }).focus();
  59  |   await page.keyboard.press('Tab');
  60  |   expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  61  |   for (const [width, height] of [
  62  |     [1600, 900],
  63  |     [1280, 720],
  64  |     [390, 844],
  65  |     [360, 800],
  66  |   ]) {
  67  |     await page.setViewportSize({ width: width!, height: height! });
  68  |     const bounds = await dialog.boundingBox();
  69  |     expect(bounds!.x).toBeGreaterThanOrEqual(0);
  70  |     expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width!);
> 71  |     expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height!);
      |                                        ^ Error: expect(received).toBeLessThanOrEqual(expected)
  72  |     expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  73  |     const create = dialog.getByRole('button', { name: 'Создать', exact: true });
  74  |     await create.scrollIntoViewIfNeeded();
  75  |     const target = await create.boundingBox();
  76  |     expect(target!.height).toBeGreaterThanOrEqual(44);
  77  |     expect(target!.width).toBeGreaterThanOrEqual(44);
  78  |     await page.screenshot({ path: info.outputPath(`voice-layout-${width}.png`) });
  79  |   }
  80  |   await page.keyboard.press('Escape');
  81  |   await expect(dialog).not.toBeVisible();
  82  |   expect(errors).toEqual([]);
  83  | });
  84  |
  85  | test('goal cancellation, correction, creation, navigation and unsupported commands', async ({
  86  |   page,
  87  | }, info) => {
  88  |   await installSpeech(page);
  89  |   await page.goto('/#/goals');
  90  |   let dialog = await openPalette(page);
  91  |   await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  92  |   await speech(page, 'result', 0, 'Создай цель выучить английский');
  93  |   await speech(page, 'end', 0);
  94  |   await expect(dialog).toContainText('Создать цель?');
  95  |   await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  96  |   await expect(page.getByText('выучить английский', { exact: true })).toHaveCount(0);
  97  |   dialog = await openPalette(page);
  98  |   await dialog.getByLabel('Текст команды').fill('Создай цель выучить английский');
  99  |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  100 |   await expect(dialog).toContainText('Создать цель?');
  101 |   await dialog.getByLabel('Текст команды').fill('Создай цель отпуск завтра');
  102 |   await expect(dialog.getByRole('button', { name: 'Создать', exact: true })).toHaveCount(0);
  103 |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  104 |   await expect(dialog.getByRole('region', { name: 'Уточнение команды' })).toContainText(
  105 |     'Точный срок цели',
  106 |   );
  107 |   await dialog.screenshot({ path: info.outputPath('voice-error.png') });
  108 |   await dialog.getByLabel('Текст команды').fill('Создай цель выучить английский');
  109 |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  110 |   await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  111 |   await expect(dialog).toContainText('Цель создана');
  112 |   await dialog.getByRole('button', { name: 'Открыть цель' }).click();
  113 |   await expect(page.getByRole('heading', { name: 'выучить английский' })).toBeVisible();
  114 |   await page.reload();
  115 |   await expect(page.getByRole('heading', { name: 'выучить английский' })).toBeVisible();
  116 |   dialog = await openPalette(page);
  117 |   await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  118 |   await speech(page, 'result', 0, 'Открой дневник');
  119 |   await speech(page, 'end', 0);
  120 |   await expect(dialog).toContainText('Открыт раздел «Дневник»');
  121 |   await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  122 |   await expect(page.getByRole('heading', { name: 'История', exact: true })).toBeVisible();
  123 | });
  124 |
  125 | test('microphone errors, stale speech, keyboard focus and mobile bounds', async ({
  126 |   page,
  127 | }, info) => {
  128 |   await installSpeech(page);
  129 |   await page.goto('/');
  130 |   const dialog = await openPalette(page);
  131 |   await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  132 |   await speech(page, 'error', 0);
  133 |   await expect(dialog.getByRole('alert')).toContainText('Доступ к микрофону');
  134 |   await dialog.getByRole('button', { name: 'Начать голосовой ввод' }).click();
  135 |   await page.keyboard.press('Escape');
  136 |   await expect(dialog).not.toBeVisible();
  137 |   await expect(page.getByRole('button', { name: 'Голосовые команды', exact: true })).toBeFocused();
  138 |   await speech(page, 'result', 1, 'Создай цель поздняя команда');
  139 |   await speech(page, 'end', 1);
  140 |   await openPalette(page);
  141 |   await expect(dialog.getByLabel('Текст команды')).toHaveValue('');
  142 |   await dialog.screenshot({ path: info.outputPath('voice-idle.png') });
  143 |   const box = await dialog.boundingBox();
  144 |   const viewport = page.viewportSize()!;
  145 |   expect(box!.x).toBeGreaterThanOrEqual(0);
  146 |   expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  147 |   expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  148 | });
  149 |
  150 | test('closing a successful command refreshes the visible list without dropping a goal draft', async ({
  151 |   page,
  152 | }) => {
  153 |   await installSpeech(page);
  154 |   await page.goto('/#/goals/new');
  155 |   await page.locator('#goal-title').fill('Несохранённый черновик');
  156 |   let dialog = await openPalette(page);
  157 |   await dialog.getByLabel('Текст команды').fill('Добавь задачу свежая задача сегодня');
  158 |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  159 |   await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
  160 |   await expect(dialog).toContainText('Задача создана');
  161 |   await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  162 |   await expect(page.locator('#goal-title')).toHaveValue('Несохранённый черновик');
  163 |   dialog = await openPalette(page);
  164 |   await dialog.getByLabel('Текст команды').fill('Открой задачи');
  165 |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  166 |   await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  167 |   await expect(page.getByText('свежая задача', { exact: true }).first()).toBeVisible();
  168 |   dialog = await openPalette(page);
  169 |   await dialog.getByLabel('Текст команды').fill('Добавь задачу ещё одна задача сегодня');
  170 |   await dialog.getByRole('button', { name: 'Разобрать команду' }).click();
  171 |   await dialog.getByRole('button', { name: 'Создать', exact: true }).click();
```
