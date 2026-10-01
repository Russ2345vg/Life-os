# Надёжное завершение действия — проверка реализации

Дата: 30.09.2026. Scope: завершение из «Сегодня» и библиотеки, локальная транзакция,
обновление представлений и post-commit уведомление существующего sync outbox.

Вердикт: готово в указанной области; native проверка двух устройств ниже отмечена отдельно.

## Результат

Реализован общий presentation controller, который разделяет сохранение и обновление экрана.
После commit ошибка чтения показывает «Действие выполнено. Не удалось обновить данные на экране.»
Кнопка «Повторить загрузку» повторяет неуспешный этап и зависимые чтения, сохраняя receipt,
необязательный итог и единственное выполнение команды. Ошибка до сохранения допускает новую
явную попытку после обновления списка.

`CompleteLifeAction` проверяет показанное пользователю поколение `completionKey`. При конфликте
версии один раз перечитывается победившая запись; успех возможен только для завершённого действия
того же поколения. Ошибка уведомления sync после commit не отменяет сохранённый результат.

Авторитетное состояние остаётся в существующей базе. Новых зависимостей, схемы хранения,
миграций, persistent operation store или протокола синхронизации нет. CSS и композиция экранов
не изменялись. Коммиты, push и публикация не выполнялись.

## Доказательства поведения

| Инвариант                                                                                                                                   | Проверка                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Старый ключ после reopen не завершает новый цикл; произвольная ошибка storage не маскируется                                                | `src/application/commands/CompleteLifeAction.test.ts`                                                                                                                          |
| Две конкурентные команды дают один Journal fact, один contribution на связь и один набор outbox events                                      | `src/infrastructure/persistence/CompleteLifeAction.integration.test.ts`, реальные транзакции fake-indexeddb и barrier конкурентного чтения                                     |
| Ошибка outbox до commit откатывает action/Journal/contributions/outbox; notification failure после commit сохраняет их                      | Тот же persistence integration test                                                                                                                                            |
| Retry после полуночи сохраняет дату/поколение; actual contribution без ввода остаётся pending                                               | Тот же persistence integration test                                                                                                                                            |
| Receipt появляется до завершения чтений; повторные вызовы объединяются; retry не вызывает execute                                           | `src/presentation/planner-v2/PlannerActionCompletion.test.ts`                                                                                                                  |
| Вытесненный refresh ждёт актуальный результат; cleanup подавляет старые результаты и отменяет ещё не начатое чтение                         | `src/presentation/planner-v2/plannerCompletionRefresh.test.ts`                                                                                                                 |
| Поздний materialize commit запускает реальное повторное чтение библиотеки; его failure остаётся видимым и восстанавливается отдельно        | `src/app/composition/PlannerActionCompletion.integration.test.ts`                                                                                                              |
| Offline сохраняет очередь, unauthorized/paused блокируют передачу, разрешённый trigger доставляет без новых локальных completion artifacts  | Реальные outbox/store/push engine/coordinator с fake transport в persistence integration test; соседние `PilotSyncFoundation.integration.test.ts` и `SyncTransferGate.test.ts` |
| Оба UI-входа восстанавливаются без второго execute, сохраняют текст итога и записи после reload; поздний ответ не попадает в другой маршрут | `tests/e2e/current.action-completion-recovery.spec.ts`                                                                                                                         |
| Итог можно пропустить, сохранить и изменить позднее; completion/reopen, реактивность, focus и прокрутка сохраняются                         | `current.completion-summary.spec.ts`, `current.daily-workflow.spec.ts`, `current.library-reactive.spec.ts`                                                                     |

## Команды и результаты

Все команды запускались в активном `D:/LifeOS-App`, ветка `codex/motion-release-1.0.19`.
Dirty baseline перед реализацией: только два документа — design specification и implementation plan.

| Проверка                                                            | Результат                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Targeted command/persistence/notification и соседние команды        | PASS, 9 файлов / 49 тестов, exit 0                                                                   |
| Targeted sync после добавления offline/authorization/pause сценария | PASS, 3 файла / 13 тестов, exit 0                                                                    |
| Последний targeted controller/adapters/composition/library          | PASS, 5 файлов / 26 тестов, exit 0                                                                   |
| `npm run test:fast`                                                 | PASS, 93 файла / 1008 тестов, exit 0                                                                 |
| `npm run verify`                                                    | PASS, exit 0: typecheck, lint, 1893 unit/integration, 60 infra, 1 alpha, build, format и Git hygiene |
| Scoped E2E, команда ниже                                            | PASS, 44/44, desktop-chrome + mobile-chrome, 238.62 с, exit 0                                        |

```bash
npm run test:target -- src/app/composition/PlannerActionCompletion.integration.test.ts src/presentation/planner-v2/plannerCompletionRefresh.test.ts src/presentation/planner-v2/PlannerActionCompletion.test.ts src/app/composition/PlannerLibraryReadModel.integration.test.ts src/presentation/planner-v2/PlannerLibrary.test.tsx
npm run test:e2e -- tests/e2e/current.action-completion-recovery.spec.ts tests/e2e/current.completion-summary.spec.ts tests/e2e/current.library-reactive.spec.ts tests/e2e/current.daily-workflow.spec.ts
```

До исправлений наблюдались ожидаемые RED для защиты поколения, concurrent winner,
post-commit notification, controller/adapters, browser recovery и отмены queued refresh.
При общем gate исправлены найденные lint/lifecycle ошибки и тип тестового deferred-read.
Линтер оставляет четыре предупреждения react-refresh в незатронутых файлах; build сообщает
о крупных chunks. В unit suite пропущен один opt-in тест локального Supabase round trip.
Managed E2E подтвердил освобождение порта 4173; fallback завершил owned server после отказа
Windows tree cleanup. Browser pageerror assertions прошли; runtime ошибок в проверенных flows нет.

Полный E2E не запускался: изменения локализованы completion/recovery, схема хранения,
routing/startup и протокол sync не менялись. Выбранные четыре файла покрывают затронутые
flows и соседние операции на обоих browser-проектах.

## Визуальная и browser-проверка

Baseline до изменения: `/#/v2/today`, `/#/v2/actions`, форма итога; 1440×900 и 390×844,
изолированная база. Зафиксированы route, computed styles и порядок stylesheet; сохранена
существующая цепочка tokens → planner-v2 → planner-master → planner-premium с локальными стилями.
После изменения проверена также карточка действия через completion-summary flow.

Сравнены состояния error/retry, recovered/empty, success и заполненный prompt на desktop/mobile.
Сохранены graphite/jade и семантика success/error; сообщение объясняет состояние текстом.
Повтор и поля не обрезаны, горизонтального переполнения нет. Prompt получает focus,
черновик сохраняется при ошибке чтения; соседний keyboard/menu flow проверяется E2E.
Управляющие элементы и состояния используют существующие компоненты. Применимые пункты
Правила №38 проверены по этой области; новый визуальный reference/approval не требовался.
Общий аудит контраста/reduced motion всех экранов этим патчем не заявляется.

Локальные снимки хранятся в `.superpowers/sdd/2026-09-30-reliable-action-completion/baseline/`
и `final/`; последний Playwright report — в `playwright-report/`. Эти каталоги игнорируются Git.

## Уточнения относительно плана

- Проверки атомарности и callback сосредоточены в новом `CompleteLifeAction.integration.test.ts`,
  существующие соседние tests использованы без дублирования fixtures.
- Browser failure вводится одноразово на application read boundary после настоящего commit
  через test-only module interception. Это позволяет не задеть startup и запись транзакции;
  production debug API отсутствует. Сохранение проверяется непосредственно чтением IndexedDB.
- Добавлены отмена queued refresh при cleanup и сброс feedback после ошибки до commit.
  Независимый final-reviewer подтвердил отсутствие незакрытых замечаний после этих исправлений.

## Ограничения

Синхронизация проверена интеграционно с fake transport, без двух реальных Tauri-устройств
и внешнего Supabase. Ручная QA на двух устройствах остаётся отдельной проверкой доставки.
Тесты не доказывают новое правило разрешения межустройственных конфликтов — оно не менялось.
Несохранённый текст итога после закрытия приложения этим этапом не восстанавливается.
