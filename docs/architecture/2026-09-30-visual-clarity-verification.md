# Проверка обновления «Визуальная ясность»

Дата: 30.09.2026. Область: оформление и порядок двух вторичных блоков на «Сегодня»; общие
типографические роли, дневник и память. Предсуществующие изменения выполнения действия и панели
управления сохранены. Commit, push и публикация не выполнялись.

## Результат

- План и первое действие находятся перед фокусом месяца и сценарием в DOM и на mobile. Desktop
  показывает фокус месяца в обзорной колонке. Tab-порядок следует DOM.
- План выделен как главный визуальный центр; первое действие начинается на 475 px при 1440×900 и
  613 px при 390×844 в контрольном состоянии. Утверждённый пилот: 474/611 px; прежний baseline:
  778/977 px.
- Появились общие роли page/focus/detail/section/item/body/meta/reading, применённые в текущих
  владельцах стилей. Дневник получил реальный интервал 24 px вместо неработавшего `--space-5`;
  подтверждение панели — радиус 16 px вместо неработавшего `--radius-lg`.
- Рабочие карточки дневника без декоративной тени; заголовки Diary/Memory и текст записей
  согласованы с общими ролями. Палитра, предметные состояния, данные и application-команды не менялись.

## Browser QA

Локальный Chrome/Playwright с изолированными browser contexts: Today, Actions, Diary, Memory на
1440×900, 390×844, 360×800, 320×700, 760×800 и 1280×480. На всех проверенных сочетаниях
`scrollWidth == viewportWidth`, ошибок page/console нет. На 320×700 длинное действие начинается
ниже первого экрана (755 px), но доступно прокруткой; критерий первого экрана задан для 390×844.
Контрольные [снимки «до», пилота и реализации](../design/references/2026-09-30-visual-clarity/README.md)
зафиксированы вместе с состоянием.

Чек-лист Правила №38 применён к актуальному jade-направлению: главный центр и визуальный порядок
различимы в монохроме; постоянного glow нет, смысл выбора/выполнения сохраняют текст и форма;
сетки перестраиваются без горизонтального переполнения; disabled-кнопка создания нейтральна.
Контраст ключевых пар palette tokens: primary text на surface-1 16.01:1, secondary 9.48:1,
muted 7.01:1, текст на jade-кнопке 8.86:1. Focus-visible существующих controls сохраняется;
browser E2E подтвердил keyboard/menu/guard и mobile touch-сценарии. `prefers-reduced-motion: reduce`
использован при ручных снимках. Полная нативная Android-проверка в эту задачу не входит.

## Автоматические проверки

- `npm run test:target -- src/presentation/planner-v2/PlannerToday.test.tsx src/presentation/planner-v2/PlannerScenariosPanel.test.tsx src/presentation/planner-v2/PlannerActionList.test.tsx src/presentation/planner-v2/PlannerForms.test.tsx` — 4 файла, 18 тестов прошли.
- `npm run test:e2e -- tests/e2e/current.visual-clarity.spec.ts` — 6/6 desktop/mobile.
- `npm run test:e2e -- tests/e2e/current.action-panel.spec.ts --grep 'editing the title|failed title save|action menu'` — 6/6.
- `npm run test:e2e -- tests/e2e/current.sheet-resize.spec.ts tests/e2e/current.daily-workflow.spec.ts` — 14 passed, 2 ожидаемых viewport skips.
- `npm run test:e2e -- tests/e2e/current.diary.spec.ts tests/e2e/current.memory.spec.ts --grep 'daily diary saves|weekly and monthly diary|memory reads an empty|failed photo and browser back'` — 8/8.
- `npm run test:e2e -- tests/e2e/current-workspace.screens.spec.ts tests/e2e/current.recurrence-badge.spec.ts tests/e2e/current.ui-refinement.spec.ts` — 11 passed, 1 устаревшее ожидание прежнего порядка mobile. Ожидание приведено к утверждённому порядку; повторный узкий прогон `--grep 'keeps navigation stable'` — 2/2.
- `npm run test:e2e -- tests/e2e/current.master.spec.ts --grep 'responsive populated'` — 28/28.
- `npm run test:e2e -- tests/e2e/current.scenarios.spec.ts` — 10/10.
- `npm run test:e2e -- tests/e2e/current.motion.spec.ts` — 6/6, включая reduced motion.
- `npm run verify` — прошёл: typecheck, lint (0 ошибок, 6 существующих предупреждений),
  1912 unit/integration-тестов (1 skip), 60 infra-тестов, 1 alpha-тест, production build,
  Prettier и `git diff --check`.

Полный E2E не запускался: изменены локальная композиция Today и оформление; выбранные scoped
сценарии покрывают затронутые разделы и размеры. Нативные Android-экраны и другие браузерные
движки не проверялись.
