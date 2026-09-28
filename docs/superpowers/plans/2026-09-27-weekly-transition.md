# Weekly transition implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** Подключить утверждённый недельный обзор к реальным данным и явному переносу дел.

**Architecture:** Чистая application-проекция читает существующий PlanningState;
Presentation использует PlanningProvider. Изменения проходят через SetLifeActionPlan.

**Tech Stack:** TypeScript, React, существующие tokens и managed Vitest/Playwright.

**Spec:** docs/design/features/2026-09-27-weekly-transition.md

## Constraints

Без зависимостей, миграций, второго источника состояния и автоматических изменений.
Пользователь утвердил reference 27.09 сообщением «ДАВАЙ». Без commit/push: серия локальных обновлений.

## Review focus

Невалидная/будущая неделя; пересечение года и локальная дата выполнения;
отменённые/повторно открытые вклады; pending/incomplete; сохранение выбранного main при переносе.

## Tasks

- [x] RED: GetWeeklyGoalReview.test.ts — календарь, completed/reopen, effective contributions,
      pending/incomplete, текущие активные цели, незавершённые дела без дубликатов.
- [x] GREEN: GetWeeklyGoalReview.ts — чистая проекция с каноническими reader/predicate.
- [x] RED/GREEN: PlannerNavigation.test.ts — review/week parse/build и switcher.
- [x] PlannerWeeklyReview.tsx и weekly-review.css — сводка, цели, перенос через reused controls.
      PlannerLibraryWorkspace связывает provider и команды; PlannerWorkspace принимает локальный маршрут.
- [x] Scoped E2E нового flow на desktop/mobile: seed, даты, перенос, reload/main, overflow/error logs.
- [x] Targeted → npm run verify; scoped E2E; visual QA; diff/status; обновить evidence.

Общий routing/storage не меняется, поэтому полный E2E не требуется.

## Решения и evidence

Inline execution, главный агент — единственный автор изменений; агенты исследовали/review read-only.
Ruling: date controls переиспользуются прямо в обзоре; карточка остаётся доступной для деталей.
Ruling: completedOn — канонический сохранённый локальный день; legacy семантика не переписывается.
Ruling: same-date подтверждение только refresh, без команды изменения main.
Targeted14, scoped weekly desktop/mobile + соседний goals desktop/mobile прошли.
Финальный npm run verify прошёл с exit 0; точное evidence хранится в feature spec.
