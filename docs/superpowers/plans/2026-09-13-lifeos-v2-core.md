# План реализации ядра LifeOS V2

**Цель:** выполнить согласованный [контракт ядра](../../design/features/2026-09-13-lifeos-v2-core.md)
в текущей задаче без изменения UI и Compatibility Bridge.

**Архитектура:** правила переходов в LifeAction; команды используют существующие repositories
и JournalUnitOfWork. Новая связь хранится в подготовленном goalId. Стек — TypeScript, Vitest,
существующий IndexedDB; зависимости не добавляются.

- [x] Зафиксировать тестом уже существующее создание только по title в LifeActionCommands.test.ts.
- [x] Добавить падающие проверки завершения draft/ready/in_progress с необязательной заметкой,
      идемпотентности и восстановления в LifeAction.test.ts, LifeActionRehydrate.test.ts,
      LifeActionLifecycleCommands.test.ts и LifeActionV2Core.test.ts.
- [x] Минимально изменить LifeAction.complete, LifeActionCompleted, CompleteLifeAction и
      createLifeActionJournalEntries. Сохранить legacy-сессии; проверить атомарность Journal.
- [x] Добавить падающие тесты SetLifeActionGoal для завершённого standalone-действия, снятия
      связи, неизменности completion, отсутствующей цели и конфликтов записи. Добавить domain
      setter, application-команду и подключение к composition.
- [x] В GoalCommands.test.ts сначала воспроизвести запрет создания и активации без Direction,
      проверить редактирование, позднее назначение и снятие связи с сохранением id.
      Удалить только ограничение обязательности из goalCommandSupport и лишнее исключение UpdateGoal.
- [x] Запустить целевые тесты затронутых модулей, проверить diff и независимый read-only review.
- [x] Один раз выполнить npm run verify, записать результат, diff stat и реальные риски.

На каждом этапе: тест → ожидаемое падение → минимальный код → зелёный целевой прогон.
Уже работающее поведение не переделывается ради искусственного падения. Полный E2E не запускать.
Commit, push и переход к UI этим планом не предусмотрены.

Результат: целевые прогоны 115/115 и 67/67 успешны (177 уникальных тестов в 12 файлах).
Единственный `npm run verify` завершился с кодом 0: 3332 unit/integration, 55 infrastructure,
1 alpha, typecheck, lint, build, format и Git hygiene. Lint: 15 предупреждений в незатронутых
файлах; build: предупреждение о chunk больше 500 kB. Playwright/E2E не запускались.
Read-only review не выявил блокирующих дефектов. Границы legacy-сессий и конструктора без UoW
описаны в контракте. Изменений UI, миграций, протокола и crypto нет.
