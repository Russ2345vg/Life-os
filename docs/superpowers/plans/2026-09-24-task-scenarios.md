# План реализации сценариев задач

**Goal:** вручную собирать и сохранять наборы до трёх существующих задач на странице «Сегодня».
**Architecture:** TaskScenario → PlannerScenarios → TaskScenarioRepository; IndexedDB adapter
и sync registry; интерфейс использует существующие команды задач.
**Tech Stack:** существующие TypeScript, React, IndexedDB, Vitest и Playwright, без зависимостей.
**Spec:** [Сценарии задач](../../design/features/2026-09-24-task-scenarios.md).

Главный агент вносит изменения в активном worktree, сохраняя dirty baseline. Исследование
архитектуры и финальный review — read-only. Git commit/push не входят в задачу.

## Этапы

- [x] Написать падающие domain/composition tests: последовательное и конкурентное добавление,
      лимит, повтор ссылки, переименование, дневной/постоянный набор, общий статус, удаление,
      reopen. Команда: `npm run test:target -- TaskScenario.test.ts PlannerScenarios.integration.test.ts`.
- [x] Реализовать `src/domain/planner/TaskScenario.ts`, application service/port,
      `IndexedDbTaskScenarioRepository.ts`, mapper, schema v27 и composition wiring.
- [x] Добавить sync registration/binding/fixture и snapshot backward compatibility;
      проверить миграцию v26, старый snapshot, auto-capture и входящие orphan-safe ссылки.
- [x] Добавить render/browser tests, затем `PlannerScenariosPanel.tsx` и подключение к
      PlannerToday/PlannerWorkspace. Использовать существующие строки задач и токены.
- [x] Проверить targeted tests, `npm run test:fast`, затем `npm run verify` (выполнен;
      общий gate блокирует предсуществующее форматирование восьми файлов вне scope).
- [x] Выполнить полный `npm run test:e2e`, desktop/mobile visual review и правило №38.
- [x] Независимый final review, diff/check/status и отчёт со свежими результатами.

## Review focus

1. Четвёртая задача и одновременные добавления: доменный лимит внутри readwrite transaction.
2. Выполненные/удалённые общие задачи: ссылки не создают копий и не сбрасывают статус.
3. Смена дня и reload: дневные наборы скрываются, сохранённые остаются.
4. Старые snapshots и база v26: добавление store без потери прежних данных.
5. Ошибки storage/sync: исходный набор сохраняется, ошибка видима и повтор доступен.

## Ledger

- Исходное дерево содержит изменения сна, обновлений Windows и planner UI; они не принадлежат
  этому патчу. Согласованный дизайн и разрешение реализации получены в диалоге.
- Ruling: отдельный repository сценариев сохраняет узкие существующие planner-контракты.
- Ruling: патч включает узкую правку EntityContextMenu — новая высота Today выявила
  закрытие меню от отложенной прокрутки до открытия. Сначала подтверждены trace и RED
  desktop/mobile regression; после правки targeted menu checks 6/6 PASS.
- Post-commit load failure: после успешной записи форма сразу сохраняет ID, поэтому повтор
  сохранения не создаёт второй набор; подтверждено RED → GREEN browser regression.
- Итог: полный E2E 88 PASS / 2 условных skips (435.87 s), включая 10 scenario checks.
  Проверки кода и сборка внутри verify прошли; format остановился на восьми baseline-файлах.
  Подробности: [отчёт](../../codex/2026-09-24-task-scenarios-report.md).
