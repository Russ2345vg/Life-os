# Модульный каркас: API и Memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Главный агент — единственный автор; независимый reviewer работает read-only.
> Реализация разрешена пользователем 30.09.2026; первый этап выполнен и проверен.

**Goal:** отделить публичный API от UI и подключить Memory через самостоятельную App-фабрику,
сохранив существующие данные, команды, сценарии и lifecycle.

**Architecture:** application-owned interfaces → concrete module factory в App → текущие
Infrastructure adapters. Существующие root, database, sync и публичная форма объекта приложения сохраняются.

**Tech Stack:** текущие TypeScript/React/IndexedDB, ESLint, Vitest/Playwright; без новых зависимостей.

**Spec:** [Модульный каркас LifeOS](../specs/2026-09-30-modular-lifeos-design.md).

## Global Constraints

- Один database, Clock, CurrentDateProvider и IdGenerator на application instance.
- Memory-фабрика синхронная; не вызывает database.open/close и не запускает lifecycle.
- Порядок startup/close и account/sync wiring не меняется.
- Database version, stores, IDs, record/wire/snapshot formats и миграции не меняются.
- `memoryEnabled ?? (VITE_LIFEOS_MEMORY_ENABLED === 'true')` вычисляется в root; default writes=false.
- Старые воспоминания доступны для чтения при writes=false; флаг не исключает данные из sync/backup.
- UI/service methods и optional поля сохраняются; текущие type imports совместимы через re-exports.
- Главный агент пишет изменения в активном worktree, сохраняя текущий dirty baseline. Commit/push/release не входят.

## Review Focus

- Type-only UI зависимость не возвращается через старые aliases; покрыть Task 1 lint fixtures.
- UI fixtures с отсутствующими optional services продолжают компилироваться и работать; Task 1 existing render tests.
- Memory и Diary используют общий database и заданное время; Task 2 composition round-trip.
- После reopen с writes=false данные читаются, mutation отклоняется; Task 2 existing restart regression.
- Фабрика не создаёт второго подключения и не меняет startup/cleanup; Task 2 existing composition/reopen tests + review root diff.

## Task 1: Application владеет публичными интерфейсами

**Files:**

- Create: `src/application/planner/PlannerLibraryServices.ts`.
- Create: `src/application/planner/PlannerServices.ts`.
- Modify: `src/presentation/planner-v2/PlannerLibraryWorkspace.tsx`, `PlannerWorkspace.tsx`, `PlannerScenariosPanel.tsx`.
- Modify: `src/app/composition/LifeOsApplication.ts`, `eslint.config.js`.
- Test: new `scripts/module-boundaries.test.mjs`; existing `PlannerToday.test.tsx`, `PlannerLibrary.test.tsx`.

**Interfaces:**

- Перенести `PlannerLibraryServices` без изменения members/optional markers из PlannerLibraryWorkspace.
- Перенести `PlannerServices extends PlannerLibraryServices` без изменения members из PlannerWorkspace.
- `ScenarioService = Pick<PlannerScenarios, 'list' | 'create' | 'update' | 'addAction' | 'removeAction' | 'archive'>`
  объявить в новом application PlannerServices; UI импортирует и type-only re-exports для совместимости.
- `LifeOsApplication` импортирует PlannerServices из Application; `memory: MemoryServices` использует
  существующий application контракт. Остальные текущие обязательные overrides сохраняются.

- [x] Добавить две ESLint regression fixtures через установленный `ESLint.lintText`:
      presentation type import в `LifeOsApplication.ts` и в `src/app/composition/modules/createMemoryModule.ts`
      выдаёт `no-restricted-imports`; обычный Application type import разрешён. Использовать синтаксически
      корректный `import type ...; export type Probe = ...`, чтобы не смешивать unused-variable ошибки.
- [x] Запустить `npm run test:infra -- scripts/module-boundaries.test.mjs`: до нового правила запрещённые
      fixture imports не распознаются; зафиксировать этот RED.
- [x] Перенести интерфейсы с прямыми application/domain imports. Старые presentation файлы только
      импортируют/re-export типы, дубликаты деклараций удалить. Не менять JSX и обработчики.
- [x] Добавить targeted no-restricted-imports для `src/app/composition/LifeOsApplication.ts` и
      production `src/app/composition/modules/**/*.ts`. Исключить `*.test.ts`: текущие интеграционные
      тесты вправе использовать presentation helpers. Существующие правила слоёв сохранить.
- [x] GREEN: повторить новый infra файл, затем
      `npm run test:target -- src/presentation/planner-v2/PlannerToday.test.tsx src/presentation/planner-v2/PlannerLibrary.test.tsx`.
      Type compatibility окончательно проверяется общим verify в Task 3.

## Task 2: Memory как первый подключаемый модуль

**Files:**

- Create: `src/app/composition/modules/createMemoryModule.ts`.
- Modify: `src/app/composition/createLifeOsApplication.ts`.
- Test: `src/app/composition/MemoryComposition.integration.test.ts`.
- Reuse: `MemoryServices`, `MemoryApplicationService`, `MemoryQueries`, `MemoryDiaryImport`,
  `MemoryContextResolver` из `src/application/memory/MemoryContext.ts`, `IndexedDbMemoryRepository`.

**Interfaces:**

`createMemoryModule(dependencies: MemoryModuleDependencies): MemoryServices`, где readonly dependencies:

| Поле                | Тип                                   |
| ------------------- | ------------------------------------- |
| database            | LifeOsIndexedDb                       |
| clock               | Clock                                 |
| currentDateProvider | CurrentDateProvider                   |
| idGenerator         | IdGenerator                           |
| writesEnabled       | boolean                               |
| diary               | DiaryRepository                       |
| spheres             | Pick<SphereRepository, 'findById'>    |
| directions          | Pick<DirectionRepository, 'findById'> |
| goals               | Pick<GoalRepository, 'findById'>      |
| photoReader         | MemoryPhotoReader                     |

`diary` использует существующий port без изменения MemoryDiaryImport в этом этапе.
BrowserMemoryPhotoReader выбирается root и передаётся фабрике. Factory создаёт только
IndexedDbMemoryRepository и текущие Memory-сервисы, возвращая commands/queries/diaryImport/photoReader.

- [x] До переноса выполнить существующие composition тесты как baseline. Расширить MemoryComposition
      одним сценарием: сохранить day diary с непустым worldBetter через app.diary, подготовить импорт
      через app.memory.diaryImport, сохранить его, закрыть и снова открыть приложение на том же IDBFactory.
      Проверить текст/diarySource/id и сохранённую дату, полученную из injected CurrentDateProvider.
      Использовать существующую форму payload из MemoryDiaryImport.integration.test.ts.
- [x] Проверить characterization сценарий на текущей композиции. Для рефакторинга он должен пройти
      до и после переноса; искусственного RED на неизменном поведении не требуется.
- [x] Выделить factory с указанным контрактом; заменить Memory-блок в root одним вызовом, используя
      те же экземпляры repositories/clock/ids и прежнее значение флага. Environment читать только в root.
- [x] Выполнить
      `npm run test:target -- src/app/composition/MemoryComposition.integration.test.ts src/app/composition/createLifeOsApplication.test.ts src/infrastructure/persistence/MemoryDiaryImport.integration.test.ts src/infrastructure/persistence/MemoryCommands.integration.test.ts`.
      Убедиться, что restart/default-off тест выполняется, а не пропускается.
- [x] Изучить diff: повторного database/sync/lifecycle нет; startup order и `close()` прежние;
      storage/migration/native файлы не затронуты.

## Task 3: Приёмка первого этапа

**Files:** документация текущего этапа и небольшой verification report в `docs/architecture/`;
только реальные исправления по review в файлах Tasks 1–2.

- [x] После стабилизации выполнить `npm run test:fast`, затем один `npm run verify`.
- [x] Scoped E2E с временным process env `VITE_LIFEOS_MEMORY_ENABLED=false` для default-off сборки:
      `npm run test:e2e -- tests/e2e/current.memory.spec.ts tests/e2e/current.daily-workflow.spec.ts --grep 'memory reads an empty|memory compatibility reads|Today opens the action body'`.
      Запускать desktop/mobile проекты по текущему конфигу. Сохранить прежнее значение env и
      восстановить в finally, не редактировать `.env`; оба compatibility сценария должны выполниться.
- [x] Scoped E2E с временным process env `VITE_LIFEOS_MEMORY_ENABLED=true`:
      `npm run test:e2e -- tests/e2e/current.memory.spec.ts --grep 'memory photo survives'`.
      Сохранить прежнее значение env и восстановить в finally, не редактировать `.env`.
      Ожидание: сценарий реально выполнен в обоих проектах, отсутствие skip по writes flag.
- [x] Read-only review проверяет dependency direction, единичность runtime, flag semantics,
      совместимость публичных методов и сохранность предсуществующих изменений.
- [x] Обновить checklist/report фактическими результатами. `git diff --check`, scoped formatter,
      `git status --short`; cleanup только owned test processes. Commit/push/release не выполнять.

Полный E2E не нужен для этого извлечения при сохранённом startup/routing/data contract.
Если реализация выйдет за эти границы, сначала пересмотреть scope и выбрать gate по TEST_MATRIX.
Следующий этап durable registration описан в spec и не должен незаметно войти в этот патч.

## Проверка самого плана

План проверяется по реальным файлам/контрактам и package.json; локальные ссылки и Markdown проходят
formatter/diff review. Реализация и фактические product checks зафиксированы в [отчёте приёмки](../../architecture/2026-09-30-modular-lifeos-phase-1-verification.md).
