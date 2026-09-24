# Сценарии задач — отчёт реализации

Дата: 2026-09-24. Активный worktree: `D:/LifeOS-App`.

На странице «Сегодня» добавлены именованные наборы из существующих задач: добавление
по одной до трёх, переключение, поиск, замена ссылок, переименование и удаление набора.
Набор можно оставить на выбранный день или сохранять на следующие дни. Состояние
выполнения общее с исходными задачами; удаление набора не удаляет задачи.

## Границы реализации

- Domain/Application: TaskScenario и PlannerScenarios; лимит и уникальность ссылок
  проверяются внутри транзакции, в том числе при конкурентном добавлении.
- Persistence: IndexedDB v27, отдельный store, mapper, upgrade с v26, совместимость
  старых snapshots, sync registry/adapter/fixtures и автоматический outbox capture.
- UI: PlannerScenariosPanel внутри Today, существующие строки задач и design tokens.
- Соседняя правка EntityContextMenu устраняет закрытие только что открытого меню от
  отложенного scroll. Причина подтверждена trace и падающей desktop/mobile регрессией.
- После успешной записи ID сохраняется до повторного чтения: сбой чтения и повтор
  сохранения не создают дубликат. Регрессия также проверена RED → GREEN.

## Проверки

| Проверка                                             | Результат                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Targeted domain/composition/persistence/sync         | 65 PASS                                                                |
| Render: сценарии и Today                             | 5 PASS                                                                 |
| `npm run test:fast`                                  | 70 файлов, 790 PASS                                                    |
| Дополнительные persistence/recovery/render           | 16 PASS                                                                |
| Targeted browser: повтор после сбоя чтения           | 2 PASS                                                                 |
| Targeted browser: меню, reopen, longpress и keyboard | 6 PASS                                                                 |
| Финальный `npm run verify`: typecheck/lint           | PASS; существующее предупреждение fast refresh в voice fixture         |
| Финальный `npm run verify`: unit/integration         | 178 файлов PASS, 1 skipped; 1400 тестов PASS, 1 skipped                |
| Финальный `npm run verify`: infrastructure/alpha     | 55 PASS / 1 PASS                                                       |
| Финальный `npm run verify`: production build         | PASS; предупреждение размера bundle                                    |
| Финальный `npm run verify`: format                   | FAIL в восьми предсуществующих файлах, перечисленных ниже              |
| Финальный полный `npm run test:e2e`                  | PASS, 435.87 s; 88 PASS, 2 условных skips; все 10 scenario checks PASS |
| Scoped Prettier: все файлы задачи и документация     | PASS                                                                   |
| `git diff --check`                                   | PASS                                                                   |

Оба пропуска — desktop/mobile варианты проверки изменения ширины панели, которые
неприменимы к противоположному проекту. После E2E owned server завершён и порт 4173
освобождён; Windows cleanup использовал предусмотренное восстановление после Access denied.

Общий `verify` завершился с кодом 1 из-за форматирования ранее изменённых файлов вне
scope сценариев:

- `src/application/sleep/SleepScheduleService.ts`
- `src/application/sleep/WakeAlarmGateway.ts`
- `src/domain/sleep/SleepSchedule.ts`
- `src/infrastructure/alarm/TauriAndroidWakeAlarmGateway.ts`
- `src/presentation/planner-v2/planner-v2.css`
- `src/presentation/planner-v2/PlannerToday.test.tsx`
- `src/presentation/planner-v2/SleepPreparationPage.test.tsx`
- `src/presentation/planner-v2/SleepPreparationPage.tsx`

Эти файлы не форматировались в рамках задачи. Предсуществующие изменения сна,
обновлений Windows и других элементов planner сохранены. В общем dirty diff они
присутствуют вместе с изменениями сценариев.

## Review и ограничения

Независимый read-only review финальной реализации и правки меню не выявил замечаний.
Desktop 1440×900 и mobile 390×844 проверены в Chromium: состояния, отсутствие
горизонтального overflow, focus, touch targets, reduced motion и console errors.
Подробности и снимки: [UI QA](../design/references/2026-09-24-task-scenarios/QA.md).

Реальный Android и синхронизация между двумя физическими устройствами не проверялись.
Для нового sync entity type оба клиента должны быть обновлены. Автоматический повтор
выполненных задач не добавлен. Выбор активного набора временный; сами наборы сохраняются.
Функция включена в подписанный Windows-выпуск 1.0.17. Commit/push исходников не выполнялись.

[Дизайн-контракт](../design/features/2026-09-24-task-scenarios.md) ·
[План и решения](../superpowers/plans/2026-09-24-task-scenarios.md).
