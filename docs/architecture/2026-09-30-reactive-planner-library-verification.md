# Реактивное чтение библиотеки: проверка первого этапа

Дата: 30.09.2026. Первый этап завершён; общий verify прошёл, exit 0.

## Результат

`PlannerLibraryWorkspace` использует сессию чтения, подписанную на успешные commits существующей
базы через application-порт. Инвалидация выборочная, серии событий объединяются, поздние ответы
закрытой сессии отбрасываются. Фоновое обновление сохраняет формы и фильтры; read error сохраняет
последние данные и допускает retry. Сохранённая команда не становится неуспешной из-за ошибки чтения.

Фабрика в application хранит только активные sessions. При уходе с экрана снимок очищается;
remount после account purge начинает свежую загрузку. Источником предметного состояния остаются
существующие repositories и команды. Миграций, зависимостей, изменений CSS и нового UI нет.

## Измерения

Одинаковая browser fixture, 100/1000 действий, Chrome 1440×900 и 390×844. Данные созданы
application-командами в изолированных browser contexts. Измерения до подключения hook и после
сохранены в scratch workspace этой задачи: `browser-before` и `browser-after`.

| Операция                  | Library readers до | После | Какие readers остаются |
| ------------------------- | -----------------: | ----: | ---------------------- |
| Завершить действие        |                  7 |     2 | actions, focus         |
| Сохранить доступное время |                  8 |     1 | timeCapacity           |

Эти значения одинаковы во всех четырёх size/project samples. Application unit tests дополнительно
проверяют все 13 коллекций, coalescing и сохранение ссылок незатронутых срезов.

Время от клика до наблюдаемого результата, мс, включая Playwright ожидания и UI:

| Действий / проект | Action до → после | Capacity до → после |
| ----------------- | ----------------: | ------------------: |
| 100 / desktop     |         209 → 172 |           430 → 356 |
| 100 / mobile      |         201 → 165 |           411 → 307 |
| 1000 / desktop    |         447 → 333 |          1401 → 816 |
| 1000 / mobile     |         394 → 366 |          1448 → 856 |

Это одиночные диагностические замеры, не CI-порог и не обещание процента ускорения всего приложения.
JSON также содержит отдельные счётчики физических `IDBObjectStore.getAll`. Они включают команды,
focus и `PlanningProvider`; не включают все разновидности DB requests. Root Today loader отсутствует
в benchmark fixture. Реальный root отдельно проверен пользовательским browser flow.

## Проверки

| Проверка                                                                  | Результат            |
| ------------------------------------------------------------------------- | -------------------- |
| IndexedDbPlannerChangeSource targeted                                     | 2/2                  |
| PlannerLibraryReadModel targeted                                          | 21/21                |
| Новая composition integration и существующие InboxFocus/createApplication | 12/12                |
| PlannerLibrary SSR                                                        | 10/10                |
| PlannerNavigation SSR                                                     | 9/9                  |
| `npm run test:fast`                                                       | 1000/1000            |
| Новый library E2E: app flow, benchmark, draft/focus, retry, date race     | 14/14 desktop/mobile |
| Дополнительный library E2E: linked goal counters и scroll                 | 2/2 desktop/mobile   |
| Time planning: original version формы и calendar scheduling/capacity      | 4/4 desktop/mobile   |
| Work time: обновление второй вкладки и защита от второго timer            | 2/2 desktop/mobile   |
| `npm run verify`                                                          | PASS                 |

Первый verify выявил два navigation SSR failures: прежние test fixtures не содержали обязательного
`libraryReads`. Неполные type assertions заменены типизированными сервисами реального application
с изолированной fake IndexedDB. Чтение библиотеки и подписка при SSR запрещены тестовой фабрикой;
исходный набор навигации без опциональной памяти сохранён. Targeted: 9/9. Production-код после
browser/review проверок не менялся. Повторный verify прошёл после исправления fixtures: 1868 unit/integration tests, 60 infra tests, 1 alpha test; typecheck, lint, build, format и Git hygiene — PASS. Один предсуществующий тест пропущен. Остались 4 предсуществующих lint warnings и предупреждение build о размере chunks.

RED перед реализацией: отсутствовали adapter/model API; composition дала 4 ошибки отсутствующего
factory. Два browser regression-теста на старом loader воспроизвели отсутствие фоновой записи
и read-error feedback. После подключения модели оба проходят. При первом запуске baseline
форматирование вызвало HMR и повторный seed; этот sample исключён, стабильный baseline повторён — 6/6.

Сценарии UI проверяют настоящий `PlannerLibraryWorkspace`, `PlanningProvider` и команды, включая
StrictMode. Фикстурные controls, задержки, fault injection и счётчики остаются только в tests.
Реальный app flow: входящие → capture → conversion → actions → completion. Desktop/mobile снимки
actions/inbox до и после просмотрены; расположение, controls и типографика сохранены, видны лишь
различия переходных hover/focus эффектов. Console/page errors в основных flows не обнаружены.
Новые error/empty-first-load состояния и смена недели проверены browser assertions.

## Среда, scope и review

- Baseline: ветка `codex/motion-release-1.0.19`, HEAD `e0adc18`, 167 предсуществующих status entries.
  Четыре изменённых production-файла сохранены перед работой и проверены относительно этих копий.
- Windows исключает TCP-порты 4161–4260, включая стандартный E2E 4173. Для scoped browser checks
  временно заменены только port literals runner/config на 5181. Использован штатный bounded
  `npm run test:e2e`, без CLI config overrides, изменения deadlines или retries.
  Оригинальные runner/config восстановлены byte-for-byte после проверок.
- Managed cleanup сообщил отказ Windows tree termination, затем подтвердил fallback cleanup
  конкретного owned server и освобождение 5181. Чужие процессы и системные reservations не менялись.
- Read-only final reviewer не обнаружил production-дефектов. Отмеченный пробел evidence для
  связанной цели/прокрутки закрыт дополнительными 2/2 browser-проверками.
- Полный E2E не запускался: общий storage/startup/routing контракт не изменён; затронутые риски
  покрыты unit/integration и 22 scoped browser cases. Выпуск релиза не входит в задачу.

Проверки относятся к browser desktop/mobile viewport; установка на физический телефон в этот
этап не входит. `PlanningContext`, root Today loader, recurrence materialization и резервный
опрос страницы времени каждые 5000 мс сохранены. Межвкладочная мгновенная доставка и application-wide
cache требуют следующего отдельного этапа. Commit/push/release не выполнялись.

Документы: [план](../superpowers/plans/2026-09-30-reactive-planner-library.md),
[спецификация](../superpowers/specs/2026-09-30-reactive-planner-library-design.md).
