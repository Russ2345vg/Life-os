# Plan Import Implementation Plan

> Execution: главный агент, inline по executing-plans; независимый read-only final review.

**Goal:** импортировать готовый план через штатные application-команды.

**Architecture:** строгий parser + application orchestrator + стандартная UI-панель.
Стабильные ID и create-only команды обеспечивают возобновление без перезаписи.

**Tech Stack:** существующие TypeScript, React, IndexedDB, Vitest, Playwright.

**Spec:** [Контракт](../../design/features/2026-10-01-plan-import.md).

## Ограничения и риски

Без новых зависимостей, миграции, публикации и личных данных в tracked files.
Проверить неверные ссылки/даты до записи, повтор после редактирования, deleted parent,
частичный сбой, двойной submit и invalid file после valid preview.

## Задачи

- [x] Написать `src/app/composition/PlanImport.integration.test.ts` и получить red:
      отсутствует сервис импорта. Preview не пишет; повтор не создаёт дубли; reopen сохраняет связи.
- [x] Реализовать `src/application/plan-import/PlanFile.ts` и `PlanImport.ts`:
      preview(text), execute(text), parsePlanFile(text); связать в composition и PlannerLibraryServices.
- [x] Targeted test, дополнить проверки invalid/deleted/conflicting/partial/concurrent.
- [x] Добавить `PlannerPlanImport.tsx` через существующий PlannerSheet на странице Цели.
      Scoped E2E `tests/e2e/current.plan-import.spec.ts` проверяет файл и повтор.
- [x] Подготовить отдельный личный JSON-план на октябрь 2026 — сентябрь 2027:
      6 направлений, не меньше 3 целей в каждом, датированные шаги с постепенной нагрузкой.
- [x] Targeted → scoped E2E → npm run verify; desktop/mobile visual check и правило №38.
- [x] Независимый review, локальная Windows-сборка и пользовательский файл; без push/publish.

## Журнал

- Исходный worktree чистый. Авторитетный источник — текущие IndexedDB repositories.
- Application research подтвердил create-only конфликты и sync side effects существующих команд.
- Повторное согласование стандартной формы не требуется по AGENTS.md; цель уже разрешена.
- Личный файл хранится вне Git: 6 направлений, 18 целей, 60 действий, 4 активных цели.
  Проверен production parser и importer в изолированной in-memory базе; повтор добавил 0 записей.
- После review добавлена защита исходной связи сферы; regression воспроизведён до исправления.
- Итоговые проверки и реальные ограничения записаны в design specification.
- Windows build --no-bundle: PASS (128.41 s). Установленный exe заменён после штатного закрытия,
  прежний файл сохранён вне Git. SHA-256 установленного файла совпадает со сборкой.
  Приложение запущено, AX подтверждает штатную страницу «Сегодня».
- Нативное управление WebView2 остаётся недоступным: Tab/F6 не переводят фокус внутрь документа,
  screenshot helper несовместим с текущей ОС. Личный план НЕ внесён в рабочую базу:
  пользователю остаётся выбрать подготовленный JSON через новую форму и нажать «Добавить план».
