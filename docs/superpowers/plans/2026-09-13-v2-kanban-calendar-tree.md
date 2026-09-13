# LifeOS V2 views implementation plan

**Goal:** Канбан, Календарь и Древо над существующими Goal/LifeAction.

**Architecture:** Текущий PlannerLibraryWorkspace и application services; чистые
индексированные presentation-проекции, никакого нового хранилища или sync-поля.

**Tech Stack:** React, TypeScript, существующие CSS tokens, Vitest, IndexedDB.

**Spec:** [Дизайн-контракт](../../design/features/2026-09-13-v2-kanban-calendar-tree.md).

Главный агент — единственный автор. Независимое исследование и review read-only.
Текущий запрос и утверждённый PDF задают scope; повторное согласование не требуется.

- [x] Проверить регрессионным тестом SetLifeActionPlan для completed, reload,
      отсутствие повторного Journal event, сохранность legacy и главного действия.
      Минимально расширить существующие Domain/Application методы.
- [x] Создать plannerViewsModel и тесты группировки, дат, неполной иерархии и объёма.
- [x] Добавить PlannerKanban, PlannerCalendar, PlannerTree и общие компактные
      карточки/порционную выдачу. Использовать существующие команды и строки.
- [x] Интегрировать маршруты и компактный переключатель в существующие разделы.
      Проверить round-trip, loading, empty, completed, длинные строки и ошибки.
- [x] Проверить targeted integration и render tests, browser desktop/mobile,
      keyboard/focus/console. Исправить только проблемы текущего блока.
- [x] Независимый review, один npm run verify, diff/check/status, отдельный commit
      `feat: add LifeOS V2 kanban calendar and tree`, итоговый отчёт. Без полного E2E/push.

Проверки: targeted 123 теста, browser desktop/mobile, один verify exit 0.
Подробности — [итоговый отчёт](../../codex/2026-09-13-v2-kanban-calendar-tree-report.md).
