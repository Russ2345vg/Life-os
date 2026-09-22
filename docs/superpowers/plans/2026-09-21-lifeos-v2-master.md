# LifeOS V2 — Implementation Plan

**Goal:** реализовать все пять экранов утверждённого MASTER последовательно в текущем проекте.
**Architecture:** существующие application-команды и модели; изменения преимущественно presentation. Главный агент выполняет изменения, независимые агенты читают и проверяют.
**Tech Stack:** React 19, TypeScript, существующий CSS, Vitest, Playwright. Без новых зависимостей.
**Spec:** [дизайн-контракт](../../design/features/2026-09-21-lifeos-v2-master.md).

## Последовательность

- [x] Общая основа: scoped V2 tokens, поверхности, controls, навигация, общая контекстная панель. Файлы PlannerV2Workspace, planner-master.css и общие компоненты planner-v2. Проверка PlannerForms/Views/Navigation.
- [x] Сферы: BalanceWorkspace, BalanceWheel, BalanceEntityForm, balance.css. Названия на колесе, сегменты периодов, реальные дефициты, карточная сетка, описание и желаемый уровень. Проверка BalanceWheel/Workspace, создание и редактирование в браузере.
- [x] Направления: те же balance-компоненты. Группы по сферам, спокойные оценки, описание, следующий шаг перед целями, создание цели с контекстом. Проверка BalanceWorkspace и navigation.
- [x] Цели: PlannerGoalList/Form, PlanningGoalDetail/Progress, PlannerViewSwitcher. Приоритет названия и следующего шага, реальные периоды, компактный прогресс, вторичные обоснования. Проверка PlannerLibrary/Forms/GoalDetail/periodFilter.
- [x] Действия: PlannerActionList/Form, plannerCatalogModel. Полезные фильтры, даты, компактные кликабельные строки, расширенный фильтр, существующие повторения. Проверка PlannerActionList/catalogModel/Forms.
- [x] Сегодня: PlannerToday и Workspace. Список главный, компактное направление, один quick add, сворачиваемые группы, правая колонка с фактическим прогрессом и существующими переходами, временные toast. Проверка PlannerToday.
- [x] Browser QA: сквозное создание/изменение и связь всех уровней, представления и повторения; ширины 360/375/390/393/412/430/1024/1280/1366/1440/1600/1920, focus/Escape, console. MASTER 30/30 и V2 daily-workflow 10/10 PASS. Физическая Android/iOS keyboard QA остаётся ручной проверкой на устройстве.
- [x] Финальный gate выполнен: npm run verify, npm run test:e2e (изменяются desktop/mobile browser flows), независимый review, git diff --check/status. Продуктовые проверки и сборка PASS; общий gate не зелёный из-за предсуществующих format/E2E ошибок. Точные результаты и ограничения: [QA-отчёт](../../design/features/2026-09-21-lifeos-v2-master-qa.md).

## Контроль риска

Нулевая оценка отличается от отсутствующей. Следующее действие соответствует Goal.nextActionId.
Повторения выбираются существующим selector, без будущих дублей. Панели сохраняют текст при ошибке.
Длинные названия переносятся без перекрытия меню; новые формы не очищают скрытые поля существующих сущностей.

## Журнал

- Исходный worktree содержит чужие изменения. Снимок planner-v2 и baseline.diff сохранён в TEMP/lifeos-v2-master-20260921-baseline.
- До изменений продукта: test:fast — 164 файла / 1745 тестов PASS; build — PASS (существующее предупреждение о размере bundle).
- Решение: пользователь уже утвердил дизайн и автономное исполнение; повторное согласование между этапами не требуется. Commit/push не выполняются.
