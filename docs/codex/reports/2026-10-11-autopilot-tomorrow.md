# Автопилот: план на завтра

Дата: 11.10.2026. Проверенный исходный baseline: `271bb276d8aaa8ccfa504c43aec56df9476c177a` (1.0.45), рабочее дерево до задачи чистое.

## Причина и исправление

В 1.0.45 отдельная страница автопилота всегда получала текущую дату. Application-сервис уже поддерживал будущую дату, но UI не предоставлял её выбор. Добавлены «Сегодня / Завтра», явная дата и кнопка «Собрать план на завтра». Маршрут `#/v2/routine/day?day=tomorrow` сохраняет выбор после reload; сегодняшний URL совместим.

Карточка перемонтируется при смене даты: чужой preview сбрасывается, дневной черновик читается для выбранного дня. Существующий preview/apply сохраняет задачи только на свою дату; сегодняшние действия остаются прежними. Контекст помощника также получает tomorrow. Алгоритм подбора, схема хранения, зависимости и native-код не изменены.

## Проверки

Evidence относительно корня LifeOS: `../artifacts/autopilot-tomorrow-qa/`.

- RED: `navigation-red.log` — воспроизведён пропуск day; `browser-red.log` — desktop/mobile не находили переключатель.
- Targeted GREEN: `targeted-green.log`, 33 теста / 4 файла PASS, exit 0.
- Scoped E2E: `browser-valid-form.log`, 2/2 PASS, exit 0. Desktop 1440×900 и mobile 390×844: keyboard, дата, preview, разделение дневных пожеланий, применение, reload и фактические записи IndexedDB. Нет horizontal overflow, page/console errors.
- `verify-final.log`: полный `npm run verify` PASS, exit 0, 139.52 с. Typecheck PASS; lint PASS (0 errors, 13 прежних warnings); unit/integration 2467 PASS, один прежний необязательный local Supabase test SKIP; infra 68 PASS; alpha 1 PASS; production Vite build PASS; format PASS; Git whitespace PASS.
- После verify уточнена только TypeScript-аннотация `HTMLElement` в E2E измерении offsetHeight. Runtime теста не изменился; изменённые файлы дополнительно проверяются локальным formatter и TypeScript.
- Первый GREEN browser-запуск обнаружил неполные данные нового теста: не заданы обязательные end/walk time. Исправлена fixture по сообщениям native validation. Сравнение высоты кнопки использует offsetHeight вместо дробного animated bounding box. Валидация продукта и её assertions не ослаблены.
- Единственный итоговый read-only review `autopilot_tomorrow_final_review`: Critical/Important/Minor findings нет.

Полный browser suite NOT RUN: дельта ограничена выбором даты автопилота и покрыта scoped flow для обеих платформ; общий route type проверен полным unit/integration verify. Номер выпуска не является основанием повторять несвязанные сценарии по AGENTS.md.

## Визуальная проверка

Reference: текущая страница 1.0.45, сохранённая в `../artifacts/autopilot-tomorrow-qa/baseline/`, и существующий переключатель Today. Переиспользованы graphite/jade tokens, heading и day-switch. CSS cascade и computed styles зафиксированы browser-тестом. Отдельный новый макет для стандартных controls не требуется по AGENTS.md; approved baselines не обновлялись.

Снимки в `../artifacts/autopilot-tomorrow-qa/screenshots/`:

- `current.autopilot-tomorrow-a4259--save-only-the-selected-day-desktop-chrome-tomorrow-preview.png`
- `current.autopilot-tomorrow-a4259--save-only-the-selected-day-mobile-chrome-tomorrow-preview.png`
- `current.autopilot-tomorrow-a4259--save-only-the-selected-day-desktop-chrome-tomorrow-saved.png`
- `current.autopilot-tomorrow-a4259--save-only-the-selected-day-mobile-chrome-tomorrow-saved.png`

Rendered comparison выполнен: дата и кнопка видны, текущая композиция сохранена, mobile controls переносятся без overflow. В пределах изменения checklist Правила №38 выполнен: общая оболочка/палитра/tokens, основной центр, состояния, mobile, keyboard/pressed state, application ownership. Проверен React checklist: derived date, lazy legacy state, существующий async generation guard; новые dependencies и параллельный источник состояния не добавлены.

## Границы и выпуск

Не добавлены автосохранение пожеланий до «Собрать», произвольный календарь или новый планировщик. Отмена уже отправленной команды apply при уходе со страницы не менялась: она остаётся командой исходной даты.

Исправление входит в ранее разрешённый совместный выпуск 1.0.46 Windows/Android. Свежие пакеты, подписи, embedded assets и публичные update feeds проверяются отдельно. Release evidence: `../artifacts/autopilot-tomorrow-release-qa/`; итоговая публичная проверка: `../artifacts/published-release-1.0.46.json`. Этот продуктовый отчёт сам по себе не означает публикацию или установку обновления.

Физический Android, ручной вход/синхронизация личных данных и установка на пользовательские устройства NOT RUN: native-код и account flags не изменены; browser QA не подменяет эти действия.
