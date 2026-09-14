# План реализации периодного планирования LifeOS V2

**Цель:** выполнить единый блок периодов, количественных целей, вкладов и повторений до одного проверенного commit.

**Архитектура:** существующие Goal/LifeAction и Journal, отдельные записи участия/вкладов/правил; application-команды и транзакционный порт, IndexedDB + текущий encrypted sync. React управляет только состоянием форм и представления.

**Стек:** существующие TypeScript, React, IndexedDB, Vitest. Новых зависимостей нет.

**Spec:** [согласованный контракт](../../design/features/2026-09-14-v2-period-planning.md). Макет утверждён пользователем. Главный агент — единственный автор; независимые агенты исследуют и проверяют read-only.

## Ограничения

Только активный worktree. Сохранить предсуществующие изменения. Обновить Windows и Android перед включением новой схемы. Crypto/server protocol неизменны. Во время разработки только targeted tests; один verify после стабилизации всего блока. Без полного E2E и push. Один commit `feat: add LifeOS V2 period planning goals and recurrence` после успешной проверки.

## 1. Доменные инварианты

- [ ] RED: `src/domain/planner/PlanningPeriod.test.ts`, `GoalMeasurement.test.ts`, `RecurrenceRule.test.ts`.
- [ ] Реализовать `PlanningPeriod.ts`, `GoalMeasurement.ts`, `ProgressContribution.ts`, `RecurrenceRule.ts`: deterministic dates/keys, focus warnings, математический прогресс, правила и bounded occurrence slots.
- [ ] GREEN: targeted тесты дат, направлений измерения, циклов, повторений и идемпотентности.

## 2. Существующие aggregates и persistence

- [ ] RED: расширить тесты Goal/LifeAction и mappers старых записей.
- [ ] Дополнить Goal измерением/dueDate, LifeAction priority/occurrence/completion identity/reopen без изменения обычного создания и completion.
- [ ] Добавить `PlanningRepository.ts`, `IndexedDbPlanningRepository.ts` и новые stores/mappers с локальной атомарностью и outbox.
- [ ] GREEN: reload, abort, concurrent writes, старые optional поля и сохранение неизвестного остатка.

## 3. Sync compatibility

- [ ] Расширить registry/bindings/dependencies, checkpoint bootstrap, recovery.
- [ ] Проверить старые payloads/outbox, immutable event IDs, новые записи после завершённого bootstrap, replay и snapshot/restore.
- [ ] Сохранить неизвестные поля в infrastructure; omitted не означает explicit null.

## 4. Application-команды и read models

- [ ] RED: `PeriodPlanning.test.ts`, `GoalContributions.test.ts`, `RecurringActions.test.ts`.
- [ ] `PeriodPlanning`: планы, fixed 30 days, membership, focus, outcome, carryover и legacy focus import.
- [ ] `GoalContributions`: конфигурация, fixed/actual/pending, adjustment, preview/backfill, correction/reopen.
- [ ] `RecurringActions`: настройки, pause/resume, bounded materialization, skip/reschedule, версия правила вперёд.
- [ ] Интегрировать completion через существующий `CompleteLifeAction`/JournalUnitOfWork; подключить сервисы в app composition.
- [ ] GREEN: integration с настоящим IndexedDB, idempotency и соседние V2 flows.

## 5. UI

- [ ] RED: scoped React тесты Planning и optional forms.
- [ ] Добавить Planning route, один nav item, шесть видов и approved desktop/mobile композицию.
- [ ] Измерение Goal, links/recurrence в Action, actual prompt после completion, backfill preview, history/carryover.
- [ ] Переиспользовать Voice Input, rows/tokens; связать старый Focus с общей моделью.
- [ ] GREEN: состояния loading/empty/error/success, title-only создание, 320/360/390 и desktop.

## 6. Проверка и commit

- [ ] Независимый read-only review архитектуры/тестов, устранить существенные замечания.
- [ ] Browser QA реального приложения: desktop/mobile, keyboard/focus, console; только controlled server, без полного E2E.
- [ ] Один `npm run verify` после стабилизации; failure диагностировать и не скрывать.
- [ ] Изучить свой diff, `git diff --check`, `git status --short`; stage только файлы блока.
- [ ] Один разрешённый commit, финальный отчёт по 16 пунктам запроса, затем остановиться.
