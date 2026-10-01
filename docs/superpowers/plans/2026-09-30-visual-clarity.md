# Визуальная ясность LifeOS — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Главный агент — единственный автор изменений; независимое исследование и review — read-only согласно AGENTS.md. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** согласовать визуальную иерархию, поверхности и детали LifeOS, чтобы главное читалось сразу на desktop/mobile.

**Architecture:** действующие page archetypes и shared UI сохраняются. На Today два вторичных
блока переходят ниже главного действия в реальном JSX/DOM: фокус месяца — в обзорную колонку,
сценарий — после списка/выполненного. Семантические CSS-роли определяются в tokens и потребляются
существующими владельцами правил; новый глобальный слой override не добавляется.
Application/Domain/persistence и владельцы маршрутов/черновиков не меняются.

**Tech Stack:** текущие React/TypeScript/CSS, AppIcon, native dialog, Vitest и Playwright; без новых зависимостей.

**Spec:** [Визуальная ясность LifeOS](../../design/features/2026-09-30-visual-clarity.md).

Статус: план подготовлен 30.09.2026. Свежий browser baseline и пилот «Сегодня + панель
действия» [подготовлены](../../design/references/2026-09-30-visual-clarity/README.md) и
утверждены пользователем для реализации 30.09.2026. UI-реализация и проверки завершены;
[отчёт с фактическими результатами](../../architecture/2026-09-30-visual-clarity-verification.md).
Предсуществующий dirty baseline: reliable-action-completion и action-control-panel. Он сохраняется.

## Global Constraints

- Работать в активном `D:/LifeOS-App`; перед записью проверять Git root/status.
- Сохранять graphite/jade, gold priority, success/error. Исторический forest/glass не возвращать.
- Первый UI-патч следует только после browser baseline и утверждения конкретного пилота.
- При изменении пилотом значений сначала обновить Spec; не назначать значения в разделах независимо.
- Единственный источник предметного состояния — текущие application services. CSS не меняет статусы.
- Переиспользовать PlannerSheet, PlannerDisclosureCard, AppIcon, Voice Input и существующие классы.
- Не заменять native dialogs, focus/guard/resize/scroll-lock и навигацию ради оформления.
- Порядок Tab должен совпасть с новой композицией; не использовать CSS `order` для переноса
  фокуса месяца или сценария. Selected scenario и все его controls сохраняются.
- Контрольные размеры: 1440×900 и 390×844; расширенная матрица указана в Spec.
- Touch ≥44 px; text contrast ≥4.5:1; large text/focus/significant boundaries ≥3:1; reduced motion.
- Новые тесты проверяют наблюдаемую геометрию/доступность, а не совпадение CSS-текста.
- Commit/push, публикация, изменения native alarm и новые зависимости не входят в запрос плана.

## Review Focus

1. Feature CSS и общие правила перекрываются: проверить фактический import order и computed
   values на Diary/Memory/panel; не предполагать одинаковый порядок для всех разделов.
2. Длинный русский текст и узкий экран: перенос не перекрывает controls; проверка в задачах 3–4.
3. Native top layer: ошибки, меню, confirm и focus остаются доступными; проверка в задаче 3.
4. Shared token влияет на соседние архетипы: не ухудшить контраст, плотность и disabled; задача 4.
5. Визуальный порядок и keyboard order: CSS не создаёт противоречие; задачи 3–5.

## Задача 1. Browser baseline и утверждённый пилот

**Files:** создавать доказательства в `.superpowers/sdd/2026-09-30-visual-clarity/`;
reference и manifest — `docs/design/references/2026-09-30-visual-clarity/README.md`, изображения
и `pilot-overlay.css`;
при необходимости обновить Spec/этот план. Product files пока не менять.

**Interfaces:** результат — manifest с route, viewport, состоянием/данными, CSS source order,
computed styles и ссылкой на конкретный утверждённый пилот. В history/URL не сохранять тестовые
данные или пользовательские секреты.

- [x] Открыть текущую локальную сборку активного worktree. Встроенный browser tool недоступен из-за
      kernel-assets error; использован локальный Chrome/Playwright с изолированными данными.
- [ ] Снять Today, Actions, action panel, Diary, Memory на 1440×900 и 390×844. Использовать
      изолированные QA-данные: пусто, populated, длинное название, completed, error, раскрытый блок.
      Не менять пользовательскую базу для подготовки макета.
- [ ] Зафиксировать порядок реально подключённого CSS и computed font/gap/radius/surface/contrast
      для заголовка, строки, поля, кнопки, панели и feedback. Подтвердить отсутствующие токены
      из Spec и составить короткую таблицу before → proposed role.
- [x] Подготовить переработанный пилот «Сегодня + панель действия» на desktop/mobile, опираясь
      на текущие DOM/shared styles. План и первое действие видны раньше; показать поля, кнопки,
      расположение фокуса месяца и подтверждение несохранённых изменений.
      Макет не является product implementation или visual approval.
- [ ] Показать пользователю конкретные before/after. Зафиксировать выбранный результат как
      reference только после явного утверждения. При корректировке значений обновить таблицу Spec.

**Deliverable:** утверждённое визуальное изменение с измерениями и границами, пригодное для реализации.

## Задача 2. Единый словарь оформления

**Files:** `src/presentation/styles/tokens.css`, `src/presentation/planner-v2/planner-master.css`,
`planner-premium.css`, `planner-v2.css` — только правила с установленным владельцем;
`diary/diary.css`, `planner-action-panel.css` — только замены отсутствующих токенов.
Browser regression: новый `tests/e2e/current.visual-clarity.spec.ts`.

**Interfaces:** токены `--planner-type-title`, `--planner-type-focus-title`,
`--planner-type-detail-title`,
`--planner-type-section/item/body/meta/reading` со значениями Spec. Палитра и control/motion tokens
существующие. `--planner-font-body/meta` при необходимости ссылаются на новые role tokens.
Новый глобальный CSS-файл или общий Button/Card framework не создавать.

- [ ] В новом scoped browser-файле подготовить изолированные данные через существующие E2E
      helpers/patterns. Проверять результат: gap Diary 24 px, radius panel confirm 16 px,
      доступные controls ≥44 px и отсутствие overflow. Подтвердить исходный failure только
      для наблюдаемого дефекта; не добавлять тест, который просто ищет строку токена в CSS.
- [ ] Внести role tokens и подключить к существующим общим селекторам. Сохранять текущий
      цветовой смысл; для empty/error/success заменить согласованные hardcoded значения
      семантическими tokens в исходном владельце.
- [ ] Заменить все `--space-5` в Diary на `--space-6`, а `--radius-lg` в panel confirm —
      на `--radius-large`. Отдельную композицию этих экранов пока не менять.
- [ ] Проверить в браузере реально применившиеся значения. Не маскировать конфликт новым
      `!important` или очередным финальным override; убрать лишь конкретное конфликтующее правило.
- [ ] Запустить `npm run test:e2e -- tests/e2e/current.visual-clarity.spec.ts`.
      Ожидание: проходят обе viewport-конфигурации, computed geometry соответствует reference.

**Deliverable:** общий словарь иерархии и поверхностей с проверенным применением.

## Задача 3. Пилотные экраны: Today и управление действием

**Files:** `PlannerToday.tsx`, `PlannerScenariosPanel.tsx`, `planner-premium.css`,
`planner-action-panel.css`; при подтверждённой необходимости `PlannerActionList.tsx`,
`PlannerDisclosureCard.tsx`, `PlannerSheet.tsx` — только порядок и семантические классы/разметка,
без переписывания поведения.

**Interfaces:** прежние props/callbacks. Сохраняются base route, id панели, root completion,
scoped guards, focus return, time/summary dialog и currentDate.

- [ ] Внести approved hierarchy: план первым, фокус месяца в sidebar/после плана mobile,
      сценарий после действий/выполненного; главный рабочий блок, спокойные metadata,
      согласованные границы и интервалы. Не скрывать возможности ради чистого макета.
- [ ] Проверить согласованный в задаче 2 confirm внутри активного native dialog.
      Не менять portal/guard ради стилей.
- [ ] Проверить populated/empty/completed/error и selected scenario; длинный title и раскрытые
      подробности, panel narrow/wide, keyboard/Tab order, nested summary/time. В контрольном
      состоянии верх действия ≤500 px desktop и ≤650 px mobile, строка в первом viewport;
      фокус месяца остаётся доступен после плана mobile. Сравнить с пилотом в одинаковых состояниях.
- [ ] Перед JSX-правкой добавить наблюдаемый тест порядка блоков и сценариев, получить RED, затем
      выполнить `npm run test:target -- src/presentation/planner-v2/PlannerToday.test.tsx src/presentation/planner-v2/PlannerScenariosPanel.test.tsx src/presentation/planner-v2/PlannerActionList.test.tsx src/presentation/planner-v2/PlannerForms.test.tsx`.
- [ ] Browser scope:
      `npm run test:e2e -- tests/e2e/current.action-panel.spec.ts --grep 'editing the title|failed title save|action menu'`
      и `npm run test:e2e -- tests/e2e/current.sheet-resize.spec.ts tests/e2e/current.daily-workflow.spec.ts`.
      Ожидание: размеры, управление и ошибки доступны на desktop/mobile; viewport skips объяснены.

**Deliverable:** видимый утверждённый результат на основном ежедневном сценарии.

## Задача 4. Перенести роли на остальные архетипы

**Files:** `planner-premium.css`, `planner-library.css`, `planner-views.css`, `diary/diary.css`,
`memory/memory.css`. Только при измеренном расхождении: `balance/balance.css`, `account-sync.css`
и владеющий стилями Sleep файл, найденный через текущий импорт `SleepPreparationPage.tsx`.
JSX разделов меняется только при отсутствии подходящего семантического hook.

**Interfaces:** каталог выделяет список/объект, Diary — запись, Memory — событие/текст/фото,
settings — рабочую группу. Роли общие, композиции различны. Периоды, filters, commands, autosave,
native availability и semantics прогресса сохраняются.

- [ ] Actions/Goals: применить title/body/meta, ритм toolbar/list/detail, геометрию controls;
      проверить длинные recurrence labels и контекстные меню.
- [ ] Diary: после исправления spacing в задаче 2 согласовать заголовки/поверхности;
      сохранить focus письма, календарь/период и reading typography.
- [ ] Memory: согласовать аналогичные роли, сохранив размер/соотношение фото, смысл временной
      шкалы и собственную композицию. Не унифицировать разные архетипы одним card grid.
- [ ] Проверить сферы/направления, calendar/kanban/tree, Sleep и Account на наследование токенов.
      Править только подтверждённые конфликты. Записать changed/checked без изменений по каждому.
- [ ] Проверить 320/360/390 px, переход 730–760 px и низкое окно 1280×480: длинные строки,
      формы, ошибки и actions видимы, DOM/keyboard order соответствует visual order.
- [ ] Scoped browser:
      `npm run test:e2e -- tests/e2e/current-workspace.screens.spec.ts tests/e2e/current.recurrence-badge.spec.ts tests/e2e/current.ui-refinement.spec.ts`;
      `npm run test:e2e -- tests/e2e/current.master.spec.ts --grep 'responsive populated'`.
- [ ] Для затронутых Diary/Memory выполнить
      `npm run test:e2e -- tests/e2e/current.diary.spec.ts tests/e2e/current.memory.spec.ts --grep 'daily diary saves|weekly and monthly diary|memory reads an empty|failed photo and browser back'`.
      Memory flag должен быть включён/не задан; unexpected skips не считать проверкой.
      При JSX-правках добавить существующие targeted render tests соответствующих компонентов.

**Deliverable:** все выбранные архетипы используют один визуальный стандарт, без потери своей функции.

## Задача 5. Приёмка и handoff

**Files:** дополнить Spec и reference manifest; создать
`docs/architecture/2026-09-30-visual-clarity-verification.md` после фактической реализации.

- [ ] Сравнить before/after рядом с approved pilot: иерархия, плотность, метаданные, состояния,
      desktop/mobile. Проверить монохром, отсутствие glow и отключённое движение по Правилу №38.
- [ ] Выполнить `npm run test:e2e -- tests/e2e/current.motion.spec.ts`, если менялись transition/
      animation/focus styles; сохранить отзывчивость controls и reduced motion.
- [ ] После стабилизации один `npm run verify`. Зелёные scoped прогоны выше сохраняют силу,
      пока последующие изменения не затрагивают их контракт; повторять только изменённый scope.
- [ ] Независимый read-only review: соответствие reference, CSS ownership, отсутствие потери
      поведения/состояний, coverage архетипов и реальные ограничения. Главный агент вносит правки.
- [ ] `git diff --check`, просмотр diff, `git status --short`; отделить новые изменения от baseline.
      Записать фактические команды, результаты, routes/viewports, снимки и непроверенные платформы.

Полный E2E по умолчанию не требуется: оформление общих компонентов покрывается несколькими
архетипами и scoped flows. Если выяснится изменение shell/navigation поведения или неизвестная
межсценарная регрессия, сначала локализовать её и обосновать расширение по AGENTS.md.
Установщик, релиз и нативная проверка будильника не следуют из завершения визуального патча.

## Проверка этого документационного этапа

Изменяются только Spec и план. Проверить реальные paths и npm-команды, ссылки, локальный
Prettier этих файлов и `git diff --check`; runtime tests и `verify` ради документов не повторять.
Итоговый verdict визуальной реализации и ограничения зафиксированы в отчёте выше. Пилот утверждён;
финальный результат ожидает просмотра пользователем, поэтому статус `LOCKED` не присвоен.
