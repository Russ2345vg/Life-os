# LifeOS V2 — Входящие, Фокус, списки и фильтры

Дата: 2026-09-13. Baseline: ветка `v2-current-baseline`, HEAD `24560fd`.
Реализация подготовлена к отдельному commit, без push. Предсуществующие изменения документов,
навыков и настроек сохранены и исключены из списка и статистики ниже.

## Реализовано

- Входящие: захват по одному названию, необязательная заметка, существующие голосовые поля;
  преобразование в обычную Goal либо самостоятельный LifeAction с исходным текстом;
  «Оставить во входящих», архив, доступ к результатам преобразования.
- Преобразование: источник, результат и sync outbox записываются одной локальной транзакцией.
  Повтор возвращает сохранённую связь; детерминированный ID результата предотвращает вторую
  сущность при повторе той же операции. Ошибка записи откатывает всю транзакцию.
- Цели → Список: поиск по названию и текстовому контексту, одна раскрываемая панель фильтров,
  только активные фильтры показаны рядом с результатом. Поддержаны статусы, отсутствие
  направления/срока, сфера, направление, намерение, горизонт и нахождение в фокусе.
- Цели → Фокус: период текущей недели (понедельник–воскресенье), до пяти ссылок на существующие
  цели, одна главная и поддерживающие, переключение и удаление из фокуса без изменения Goal.status.
  Крупная выбранная цель, контекст, результат, этап при наличии, следующий шаг, «После этого»,
  свёрнутые цели вне фокуса и переход в существующую полную карточку.
- Действия: открытые, сегодня, ближайшие семь дней после сегодня, без даты, без цели,
  выполненные, поиск; выполнение галочкой, детальная форма даты и привязки/отвязки Goal.
  Поздняя классификация сохраняет completedAt и не создаёт второй completion event.
- Навигация: Сегодня / Цели / Действия / Входящие; внутри целей только Список / Фокус.
  Существующие Today, формы и выход «Старая версия» сохранены.
- Две новые коллекции IndexedDB (версия 23), регистрации sync, связи и recovery fixtures.
  Серверная схема, транспорт шифрования, secure storage и зависимости не менялись.

## Переиспользовано

Goal, LifeAction, EntityId, DayDate и их авторитетные репозитории. Выполнение — CompleteLifeAction
и существующий Journal; дата — SetLifeActionPlan; поздняя классификация — SetLifeActionGoal.
Новые InboxIdea и FocusPeriod содержат собственное состояние захвата и выбора периода,
не копии целей и действий. UI использует VoiceField, VoiceTextInput, VoiceTextArea, AppIcon,
существующие V2 формы, классы кнопок/галочек, токены и маршрут полной карточки Goal.
Синхронизация использует текущие mutation capture, outbox, registry adapters и recovery.

## Проверки

| Проверка                                     | Фактический результат                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Финальный targeted-прогон                    | PASS: 19 файлов, 119 тестов                                              |
| Первый npm run verify                        | **FAIL, exit 1** на lint временного tmp/v2-check.mjs: process / no-undef |
| Свежий npm run verify после удаления скрипта | **PASS, exit 0**                                                         |
| Typecheck и lint внутри свежего verify       | PASS; 15 существовавших предупреждений, новых в файлах блока нет         |
| npm run test                                 | PASS: 394 файла, 3385 тестов                                             |
| npm run test:infra                           | PASS: 6 файлов, 55 тестов                                                |
| npm run test:alpha                           | PASS: 1 тест                                                             |
| npm run build                                | PASS: TypeScript и Vite; предупреждение о крупных chunks                 |
| npm run format:check                         | PASS                                                                     |
| git diff --check                             | PASS                                                                     |
| Независимый read-only review                 | Блокирующие замечания исправлены и перепроверены                         |
| Полный Playwright/E2E                        | Не запускался по прямому запрету пользователя                            |

После первого сбоя служебный скрипт вынесен за пределы репозитория. По новому запросу
пользователя выполнен свежий `npm run verify`, завершившийся с кодом 0. После него менялись
только план и этот отчёт; их формат и ссылки проверены отдельно.

Целевые тесты покрывают title-only capture, обе конверсии, повтор/конкурентные локальные команды,
rollback при ошибке target/outbox, сохранность старых данных при upgrade, роли фокуса и отсутствие
копирования Goal, фильтры и поиск, неизменность completion при поздней связи, независимые
черновики полей при обновлении данных, маршруты и render-состояния. Включены соседние проверки
Today/Forms, существующего V2 core, Goal unification, sync apply и recovery.

В ходе review исправлены: чтение ссылок FocusPeriod из wire-записи без version; сохранение isNext
при изменении даты; устаревшие черновики формы после sync; лишний аргумент schema test.

## Ручная browser QA

Проверено в изолированном локальном origin на тестовых записях, без пользовательских данных:

- Desktop 1440×900; mobile 390×844 и 360×800.
- Ввод только названия → Goal; ввод с заметкой → standalone action; поиск, архив и ссылка
  на результат, сохранение введённого текста после ошибки валидации.
- Поиск целей/действий, раскрытие и сброс фильтров, empty/no-results, mobile-доступность панели.
- Добавление двух целей в Фокус, primary/supporting и смена главной; длинное название и outcome
  в крупной области; следующий шаг без фиктивного процента.
- Назначение даты через реальный ввод, link Goal, completion из Фокуса, unlink выполненного
  действия, сохранение результата после перезагрузки.
- Горизонтального переполнения страницы на 360 px нет; прокручивается только лента целей.
- Свежая загрузка Фокуса после стабилизации кода: ошибок и предупреждений консоли нет.
  Во время форматирования открытая dev-вкладка получала временные ошибки HMR; на новой загрузке
  они не воспроизвелись, production build прошёл.

По Правилу №38 проверены визуальная иерархия, семантический текст ролей и статусов, отсутствие
лишних карточек и свечения, loading/empty/error/success, мобильная компоновка и скролл.
Палитра чёрный/белый/зелёный следует явному запросу V2. Новая анимация не добавлена.
Полный аудит screen reader, контраста всех состояний и всех путей keyboard focus не проводился.
Тестовый сервер остановлен, временные вкладки закрыты и размеры браузера сброшены.

## Ограничения и оставшаяся ручная QA

- В текущей Goal нет отдельного точного срока. «Без срока» поэтому включает все цели;
  горизонт не преобразуется в вымышленную дату. Отдельная важность также отсутствует:
  используется intentionLevel (Хочу / Планирую / Обязуюсь), обозначенный «Важность / намерение».
- Период Фокуса — текущая неделя. История периода хранится, но нет выбора/планирования прошлых
  или будущих периодов и автоматического переноса целей в следующую неделю.
- Реальный обмен новыми сущностями между двумя обновлёнными Windows/Android-клиентами не
  проверен. Оба клиента нужно обновить для новых типов inbox_idea и focus_period.
- Локальная атомарность и idempotence проверены. Одновременное offline-преобразование одной идеи
  в разные типы на двух устройствах остаётся риском стандартного разрешения sync-конфликтов;
  распределённой транзакции между устройствами нет.
- Legacy V1 UI доступен в обновлённом приложении. Откат к старому бинарному приложению,
  открывающему предыдущую версию IndexedDB, этим блоком не обеспечивается.
- На физических Windows/Android ещё проверить новые экраны, диктовку с разрешениями микрофона,
  экранную клавиатуру и safe areas, а также перенос/завершение/позднюю связь после реального sync.
  Браузерная мобильная проверка не заменяет эти проверки.
- Итоговая визуальная приёмка пользователя ещё не проведена; новые экраны не помечены APPROVED/LOCKED.

## Сознательно вне блока

Канбан, Календарь, Древо, планирование недели/30 дней/квартала/года, аналитика, ритуалы,
дневник, геймификация, редизайн Tauri shell, Supabase migrations, изменения криптографии
и secure storage, удаление Decision/Project/ActionSession, новые TaskV2/GoalV2.
Hard-delete входящих не добавлен: используется архив согласно текущей политике.
Commit, push и публикация не выполнялись.

## Файлы текущего блока

Изменено 17 существующих файлов:

- [src/app/composition/LifeOsApplication.ts](D:/LifeOS-App/src/app/composition/LifeOsApplication.ts)
- [src/app/composition/createLifeOsApplication.ts](D:/LifeOS-App/src/app/composition/createLifeOsApplication.ts)
- [src/application/sync/SyncRegistry.ts](D:/LifeOS-App/src/application/sync/SyncRegistry.ts)
- [src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts](D:/LifeOS-App/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts)
- [src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts](D:/LifeOS-App/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts)
- [src/infrastructure/sync/LifeOsSyncRegistry.test.ts](D:/LifeOS-App/src/infrastructure/sync/LifeOsSyncRegistry.test.ts)
- [src/infrastructure/sync/LifeOsSyncRegistry.ts](D:/LifeOS-App/src/infrastructure/sync/LifeOsSyncRegistry.ts)
- [src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts](D:/LifeOS-App/src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts)
- [src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts](D:/LifeOS-App/src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts)
- [src/infrastructure/sync/pilot/StructuredSyncApply.test.ts](D:/LifeOS-App/src/infrastructure/sync/pilot/StructuredSyncApply.test.ts)
- [src/infrastructure/sync/pilot/StructuredSyncFixtures.ts](D:/LifeOS-App/src/infrastructure/sync/pilot/StructuredSyncFixtures.ts)
- [src/infrastructure/sync/recovery/IndexedDbRecoveryStore.test.ts](D:/LifeOS-App/src/infrastructure/sync/recovery/IndexedDbRecoveryStore.test.ts)
- [src/presentation/planner-v2/PlannerV2Navigation.test.ts](D:/LifeOS-App/src/presentation/planner-v2/PlannerV2Navigation.test.ts)
- [src/presentation/planner-v2/PlannerV2Navigation.ts](D:/LifeOS-App/src/presentation/planner-v2/PlannerV2Navigation.ts)
- [src/presentation/planner-v2/PlannerV2Workspace.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerV2Workspace.tsx)
- [src/presentation/planner-v2/planner-v2.css](D:/LifeOS-App/src/presentation/planner-v2/planner-v2.css)
- [src/presentation/planner-v2/plannerTodayCommands.ts](D:/LifeOS-App/src/presentation/planner-v2/plannerTodayCommands.ts)

Создано 24 файла реализации, тестов и контрактов:

- [src/app/composition/PlannerInboxFocus.integration.test.ts](D:/LifeOS-App/src/app/composition/PlannerInboxFocus.integration.test.ts)
- [src/application/planner/PlannerCatalog.ts](D:/LifeOS-App/src/application/planner/PlannerCatalog.ts)
- [src/application/planner/PlannerFocus.ts](D:/LifeOS-App/src/application/planner/PlannerFocus.ts)
- [src/application/planner/PlannerInbox.ts](D:/LifeOS-App/src/application/planner/PlannerInbox.ts)
- [src/application/ports/PlannerRepository.ts](D:/LifeOS-App/src/application/ports/PlannerRepository.ts)
- [src/domain/planner/FocusPeriod.ts](D:/LifeOS-App/src/domain/planner/FocusPeriod.ts)
- [src/domain/planner/InboxIdea.ts](D:/LifeOS-App/src/domain/planner/InboxIdea.ts)
- [src/domain/planner/PlannerState.test.ts](D:/LifeOS-App/src/domain/planner/PlannerState.test.ts)
- [src/infrastructure/persistence/IndexedDbPlannerRepository.ts](D:/LifeOS-App/src/infrastructure/persistence/IndexedDbPlannerRepository.ts)
- [src/infrastructure/persistence/PlannerDurability.test.ts](D:/LifeOS-App/src/infrastructure/persistence/PlannerDurability.test.ts)
- [src/infrastructure/persistence/PlannerRecordMappers.ts](D:/LifeOS-App/src/infrastructure/persistence/PlannerRecordMappers.ts)
- [src/presentation/planner-v2/PlannerActionList.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerActionList.tsx)
- [src/presentation/planner-v2/PlannerFocus.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerFocus.tsx)
- [src/presentation/planner-v2/PlannerGoalList.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerGoalList.tsx)
- [src/presentation/planner-v2/PlannerInbox.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerInbox.tsx)
- [src/presentation/planner-v2/PlannerLibrary.test.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerLibrary.test.tsx)
- [src/presentation/planner-v2/PlannerLibraryWorkspace.tsx](D:/LifeOS-App/src/presentation/planner-v2/PlannerLibraryWorkspace.tsx)
- [src/presentation/planner-v2/planner-library.css](D:/LifeOS-App/src/presentation/planner-v2/planner-library.css)
- [src/presentation/planner-v2/plannerActionDraft.test.ts](D:/LifeOS-App/src/presentation/planner-v2/plannerActionDraft.test.ts)
- [src/presentation/planner-v2/plannerActionDraft.ts](D:/LifeOS-App/src/presentation/planner-v2/plannerActionDraft.ts)
- [src/presentation/planner-v2/plannerCatalogModel.test.ts](D:/LifeOS-App/src/presentation/planner-v2/plannerCatalogModel.test.ts)
- [src/presentation/planner-v2/plannerCatalogModel.ts](D:/LifeOS-App/src/presentation/planner-v2/plannerCatalogModel.ts)
- [docs/design/features/2026-09-13-v2-inbox-focus-lists.md](D:/LifeOS-App/docs/design/features/2026-09-13-v2-inbox-focus-lists.md)
- [docs/superpowers/plans/2026-09-13-v2-inbox-focus-lists.md](D:/LifeOS-App/docs/superpowers/plans/2026-09-13-v2-inbox-focus-lists.md)

Дополнительно создан этот отчёт:
[docs/codex/2026-09-13-v2-inbox-focus-lists-report.md](D:/LifeOS-App/docs/codex/2026-09-13-v2-inbox-focus-lists-report.md).
Итого 42 файла, включая отчёт.

## git diff --stat текущего блока

Ниже вывод git diff --no-index --stat по снимкам HEAD/текущего содержимого только перечисленных
41 файлов. Так учтены новые untracked-файлы без staging и исключены чужие dirty-изменения.
Сам этот отчёт в статистику не включён.

```text
 .../docs/design/features/2026-09-13-v2-inbox-focus-lists.md                 |  47 ++++++
 .../docs/superpowers/plans/2026-09-13-v2-inbox-focus-lists.md               |  28 ++++
 .../src/app/composition/LifeOsApplication.ts                                |  12 ++
 .../src/app/composition/PlannerInboxFocus.integration.test.ts               | 149 +++++++++++++++++++
 .../src/app/composition/createLifeOsApplication.ts                          |  11 ++
 /dev/null => block-stat-after/src/application/planner/PlannerCatalog.ts     |  11 ++
 /dev/null => block-stat-after/src/application/planner/PlannerFocus.ts       |  44 ++++++
 /dev/null => block-stat-after/src/application/planner/PlannerInbox.ts       |  96 ++++++++++++
 /dev/null => block-stat-after/src/application/ports/PlannerRepository.ts    |  19 +++
 .../src/application/sync/SyncRegistry.ts                                    |   4 +
 /dev/null => block-stat-after/src/domain/planner/FocusPeriod.ts             |  68 +++++++++
 /dev/null => block-stat-after/src/domain/planner/InboxIdea.ts               |  45 ++++++
 /dev/null => block-stat-after/src/domain/planner/PlannerState.test.ts       |  44 ++++++
 .../src/infrastructure/persistence/IndexedDbPlannerRepository.ts            | 116 +++++++++++++++
 .../src/infrastructure/persistence/PlannerDurability.test.ts                |  72 +++++++++
 .../src/infrastructure/persistence/PlannerRecordMappers.ts                  |  17 +++
 .../src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts       |   4 +-
 .../src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts            |  10 +-
 .../src/infrastructure/sync/LifeOsSyncRegistry.test.ts                      |   6 +-
 .../src/infrastructure/sync/LifeOsSyncRegistry.ts                           |   8 +
 .../src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts         |  21 ++-
 .../src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts              |  16 ++
 .../src/infrastructure/sync/pilot/StructuredSyncApply.test.ts               |   6 +-
 .../src/infrastructure/sync/pilot/StructuredSyncFixtures.ts                 |  21 +++
 .../src/infrastructure/sync/recovery/IndexedDbRecoveryStore.test.ts         |   2 +-
 .../src/presentation/planner-v2/PlannerActionList.tsx                       | 289 ++++++++++++++++++++++++++++++++++++
 /dev/null => block-stat-after/src/presentation/planner-v2/PlannerFocus.tsx  | 210 ++++++++++++++++++++++++++
 .../src/presentation/planner-v2/PlannerGoalList.tsx                         | 277 ++++++++++++++++++++++++++++++++++
 /dev/null => block-stat-after/src/presentation/planner-v2/PlannerInbox.tsx  | 167 +++++++++++++++++++++
 .../src/presentation/planner-v2/PlannerLibrary.test.tsx                     | 104 +++++++++++++
 .../src/presentation/planner-v2/PlannerLibraryWorkspace.tsx                 | 251 +++++++++++++++++++++++++++++++
 .../src/presentation/planner-v2/PlannerV2Navigation.test.ts                 |  18 ++-
 .../src/presentation/planner-v2/PlannerV2Navigation.ts                      |  22 +++
 .../src/presentation/planner-v2/PlannerV2Workspace.tsx                      |  32 +++-
 .../src/presentation/planner-v2/planner-library.css                         | 236 +++++++++++++++++++++++++++++
 .../src/presentation/planner-v2/planner-v2.css                              |   2 +-
 .../src/presentation/planner-v2/plannerActionDraft.test.ts                  |  14 ++
 .../src/presentation/planner-v2/plannerActionDraft.ts                       |  17 +++
 .../src/presentation/planner-v2/plannerCatalogModel.test.ts                 |  54 +++++++
 .../src/presentation/planner-v2/plannerCatalogModel.ts                      | 145 ++++++++++++++++++
 .../src/presentation/planner-v2/plannerTodayCommands.ts                     |   6 +-
 41 files changed, 2699 insertions(+), 22 deletions(-)
```
