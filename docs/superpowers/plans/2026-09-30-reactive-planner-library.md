# Реактивное обновление библиотеки — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
> Главный агент — единственный автор; независимые исследователи и reviewer работают read-only.
> Пользователь разрешил реализацию 30.09.2026. Первый этап завершён. Результаты: [verification report](../../architecture/2026-09-30-reactive-planner-library-verification.md).

**Goal:** библиотека планирования автоматически и выборочно обновляется после commit, сохраняя
ввод, фильтры и открытые формы.

**Architecture:** существующий IndexedDB commit source → application-порт → сессия чтения
открытого workspace → `useSyncExternalStore`. Root предоставляет фабрику без общего кэша снимков;
предметные команды и резервное обновление времени сохраняются.

**Tech Stack:** текущие TypeScript, React 19, IndexedDB, Vitest/fake-indexeddb и Playwright;
без новых зависимостей.

**Spec:** [Реактивное обновление данных LifeOS: первый этап](../specs/2026-09-30-reactive-planner-library-design.md).

## Global Constraints

- Один существующий database и набор application-команд; без новых зависимостей и `any`.
- Database version, stores, IDs, record/wire/snapshot formats и миграции не меняются.
- Account, purge, sync transport, routing и startup semantics не меняются.
- `PlanningContext`, root Today loader, recurrence materialization и `usePlannerWorkTime` не переписываются.
- Кэш существует только в активной сессии открытого `PlannerLibraryWorkspace`.
- Резервное обновление страницы времени каждые 5000 мс и по visibility/focus/pageshow сохраняется.
- Главный агент пишет изменения в активном worktree; предсуществующий dirty baseline сохраняется.
- Commit, push, релиз и изменения пользовательских данных не входят в этот этап.

## Review Focus

- Commit во время незавершённого чтения и отклонение старого Promise: старое состояние не возвращается — Task 2.
- Legacy focus пишет при первом чтении: очередь сходится, ошибки planning-коллекций восстанавливаются — Task 3.
- StrictMode и смена today: нет утечки подписок и публикации данных предыдущей сессии — Tasks 2, 4.
- Purge без пересоздания приложения: после remount нет снимка прежнего аккаунта — Task 3.
- Фоновая запись при открытой форме и запись из второй вкладки: ввод сохраняется, time fallback работает — Tasks 4, 5.

## Task 1: Порт подтверждённых изменений и исходные замеры

**Files:**

- Create: `src/application/ports/CommittedPlannerChanges.ts`.
- Create: `src/infrastructure/persistence/IndexedDbPlannerChangeSource.ts`.
- Test: new `src/infrastructure/persistence/IndexedDbPlannerChangeSource.test.ts`.
- Create: `tests/fixtures/library-reactive.html`, `tests/fixtures/library-reactive.tsx` — исходная
  fixture текущего workspace; в Task 4 она будет расширена для нового hook.
- Record: new `docs/architecture/2026-09-30-reactive-planner-library-verification.md`.
- Read/reuse: `LifeOsIndexedDb.subscribeCommits`, `IndexedDbSyncStatusSource.test.ts`, текущий library loader.

**Interfaces:**

- `PlannerDataCollection`: union из 13 коллекций таблицы спецификации; неизвестные stores в него не входят.
- `CommittedPlannerChanges.subscribe(listener: (collections: readonly PlannerDataCollection[]) => void): () => void`.
- `new IndexedDbPlannerChangeSource(database: LifeOsIndexedDb)` реализует этот порт, без отдельного lifecycle.

- [x] Проверить Git root/status и сохранить исходный scope в verification report. До изменения UI
      снять desktop/mobile baseline затронутых представлений на изолированных данных, зафиксировать
      маршрут, cascade, loading/error/retry, открытые формы и keyboard focus. Не трогать личную базу.
- [x] Создать fixture с текущим workspace и настоящим application на отдельной тестовой базе;
      seed через команды, configurable 100/1000 действий. В тестовом browser context изолировать
      origin storage от личного приложения. Обёртками семи query методов посчитать library reads
      при сохранении capacity и action из UI; сохранить числа и время до обновления
      в report. Отдельно отметить физические чтения focus и внешних providers. Fixture не сохраняет
      копию старого loader: baseline остаётся в report, дальнейшие замеры используют тот же harness.
- [x] Добавить failing tests адаптера: успешная транзакция с двумя stores даёт одно уведомление
      с их уникальными именами после complete; abort, readonly и sync-only transaction не уведомляют;
      unsubscribe исключает следующие события. Проверить все 13 mappings таблицей вход/выход.
- [x] RED: `npm run test:target -- src/infrastructure/persistence/IndexedDbPlannerChangeSource.test.ts`.
      Зафиксировать ожидаемое отсутствие нового адаптера, а не посторонний failure.
- [x] Реализовать порт и отображение существующих store names через `subscribeCommits`.
      Не менять код транзакций, sync status source и database schema.
- [x] GREEN: повторить тот же targeted test; проверить, что metadata-only событие даёт ноль callbacks.

## Task 2: Сессия выборочного чтения

**Files:**

- Create: `src/application/planner/PlannerLibraryReadModel.ts` — типы снимка и state machine сессии.
- Create: `src/application/planner/PlannerLibraryReadModels.ts` — фабрика и registry активных сессий.
- Test: new `src/application/planner/PlannerLibraryReadModel.test.ts`.

**Interfaces:**

- `PlannerLibrarySlice = 'goals' | 'directions' | 'spheres' | 'actions' | 'ideas' | 'focus' | 'timeCapacity'`.
- `PlannerLibraryReaders` предоставляет `getGoals(): Promise<readonly Goal[]>`,
  `getDirections(): Promise<readonly Direction[]>`, `getSpheres(): Promise<SpheresSnapshot>`,
  `getActions(): Promise<readonly LifeAction[]>`, `getIdeas(): Promise<readonly InboxIdea[]>`,
  `getFocus(today: string): Promise<FocusPeriod | null>`, `getTimeCapacity(): Promise<readonly (number | null)[]>`.
  Использовать существующие domain types и `SpheresSnapshot` из `application/queries/GetSpheres`.
- `PlannerLibraryData` содержит семь readonly полей перечисленных срезов; spheres — объединённый
  `readonly Sphere[]`, остальные соответствуют результатам readers.
- `PlannerLibrarySnapshot = { readonly data: PlannerLibraryData | null; readonly refreshing: boolean; readonly error: Error | null }`.
- `PlannerLibraryReadModel`: стабильные `getSnapshot(): PlannerLibrarySnapshot`,
  `subscribe(listener: () => void): () => void`, `refresh(slices?: readonly PlannerLibrarySlice[]): Promise<void>`,
  `whenSettled(): Promise<void>`, `dispose(): void`.
- `new PlannerLibraryReadModels(readers: PlannerLibraryReaders, changes: CommittedPlannerChanges)`;
  `create(today: string): PlannerLibraryReadModel`; `close(): void`.
  Session construction и factory registry связываются внутри этих двух файлов; наружу lifecycle callbacks не экспортируются.

- [x] Написать failing tests через fake change source, spies и управляемые deferred promises.
      Использовать публичную фабрику; `create`/`getSnapshot` до subscribe дают ноль readers/listeners;
      первый subscribe загружает все семь и публикует только полный snapshot.
- [x] Добавить assertions dependency matrix: directions → только directions; capacity → только capacity;
      lifeActions → actions+focus; все девять planning stores инвалидируют focus. После обновления
      capacity проверять `next.data.goals === previous.data.goals`. Повторный `getSnapshot` без изменения
      возвращает тот же объект. Синхронные три события одного store дают один вызов его reader.
- [x] Добавить race/error/lifecycle assertions: commit во время read не публикует устаревший batch;
      конечная серия даёт один trailing batch; reject одного reader дожидается остальных, сохраняет
      предыдущие data и не создаёт retry loop. `refresh()` повторяет все срезы; следующий commit
      повторяет dirty и затронутые срезы. `whenSettled()` сам ничего не инвалидирует и не отклоняется
      из-за read error. Проверить first-load error → retry → success.
- [x] Добавить dispose/resubscribe assertions: last unsubscribe отключает listener, очищает snapshot;
      поздние resolve/reject игнорируются; StrictMode-подобный subscribe/unsubscribe/subscribe снова
      загружает данные. `close` запрещает новые sessions и активацию созданной до close сессии;
      активные waiters завершаются, новых reads нет. Другая today получает только свой focus.
- [x] RED: `npm run test:target -- src/application/planner/PlannerLibraryReadModel.test.ts`.
- [x] Реализовать state machine по спецификации: dirty set, microtask batching, generation и версии
      срезов, один batch на активную generation, временный результат до публикации. Для завершения
      всех reads использовать all-settled семантику. Не добавлять sleep, query library и DB доступ.
      Фабрика держит только активные sessions; проверка closed действует и при поздней активации.
- [x] GREEN: повторить targeted test; проверить отсутствие unhandled rejection после unsubscribe.

## Task 3: Подключение к application и проверка lifecycle

**Files:**

- Modify: `src/application/planner/PlannerLibraryServices.ts`.
- Modify: `src/app/composition/createLifeOsApplication.ts`.
- Test: new `src/app/composition/PlannerLibraryReadModel.integration.test.ts`.
- Reuse without production edits: `IndexedDbAccountLocalData`, `PlannerFocus`, `IndexedDbPlanningRepository`.
- Inherited API: `PlannerServices` и `LifeOsApplication`; не дублировать новое поле в каждом интерфейсе.

**Interfaces:**

- Обязательное `PlannerLibraryServices.libraryReads: Pick<PlannerLibraryReadModels, 'create'>`.
- Root строит readers из уже созданных GetGoals/GetDirections/GetSpheres, plannerCatalog,
  plannerInbox, plannerFocus и timeCapacity. Query instances при необходимости вынести из return
  в локальные переменные и переиспользовать; второй набор repositories/database не создавать.
- В root `close()` сначала `libraryReads.close()`, затем текущие sync/database close. При ошибке
  composition освободить уже созданную фабрику, не меняя startup/recovery контракт.

- [x] Написать failing integration tests с реальным `LifeOsIndexedDb` и fake-indexeddb:
      при отключённом sync создать/изменить action и inbox через application API, дождаться
      `whenSettled` и увидеть новый snapshot без ручного `refresh`.
- [x] Покрыть legacy focus: первая загрузка импортирует legacy данные, источник сообщает commit,
      модель сходится; последующий refresh не пишет повторно. Повреждение одной planning carrier
      записи даёт read error; исправление записи через тот же database commit восстанавливает focus.
- [x] Покрыть account boundary на test database: unsubscribe library → выполнить существующий
      `IndexedDbAccountLocalData.purge()` с fake storage → новая сессия того же application.
      Старые action/inbox отсутствуют; отложенный результат прежней generation их не возвращает.
      Не вызывать реальный аккаунт и не изменять реализацию purge.
- [x] Покрыть root close с pending reader и повторный reopen: listener снят до database close,
      закрытая сессия не публикует результат; новый application читает сохранённые данные.
- [x] RED: `npm run test:target -- src/app/composition/PlannerLibraryReadModel.integration.test.ts`.
- [x] Подключить обязательный factory API и независимый от sync адаптер в root.
      Если typed test fixtures требуют новое поле, использовать настоящую фабрику с fake readers;
      не добавлять optional fallback к старому loader и не маскировать ошибки type cast.
- [x] GREEN: повторить новый test и выполнить
      `npm run test:target -- src/app/composition/PlannerInboxFocus.integration.test.ts src/app/composition/createLifeOsApplication.test.ts`.

## Task 4: React subscription и сохранение состояния форм

**Files:**

- Create: `src/presentation/planner-v2/usePlannerLibraryReadModel.ts`.
- Modify: `src/presentation/planner-v2/PlannerLibraryWorkspace.tsx`.
- Modify: `src/presentation/planner-v2/PlannerWorkspace.tsx` — только superseded library dateRevision wiring.
- Test/reuse: `src/presentation/planner-v2/PlannerLibrary.test.tsx` (существующий SSR, не эффектовые тесты).
- Modify: `tests/fixtures/library-reactive.html`, `tests/fixtures/library-reactive.tsx` из Task 1.
- Test: new `tests/e2e/current.library-reactive.spec.ts`.

**Interfaces:**

- `usePlannerLibraryReadModel(factory: Pick<PlannerLibraryReadModels, 'create'>, today: string):`
  `{ readonly snapshot: PlannerLibrarySnapshot; readonly refresh: PlannerLibraryReadModel['refresh']; readonly whenSettled: PlannerLibraryReadModel['whenSettled'] }`.
- Hook memoizes session по factory/today и вызывает `useSyncExternalStore` со стабильными
  subscribe/getSnapshot; для SSR возвращается тот же начальный снимок без I/O.
- Test fixture монтирует реальные `PlannerLibraryWorkspace` и `PlanningProvider` в StrictMode;
  изолированный database, seed через application-команды, существующий порядок CSS.
  Test-only controls вызывают внешнюю команду, переключают today и mount; счётчики и fault injection
  остаются в fixture, не попадают в product API. Main-app сценарий проверяется дополнительно.

- [x] Подготовить browser regression: в открытых входящих ввести несохранённый текст; внешней
      командой fixture изменить действие; новое значение видно, текст/открытая форма/фокус сохранены.
      Смена today во время задержанного focus read не возвращает прошлый день. StrictMode remount
      не дублирует активную подписку. В fixture передавать делегирующие readers для задержки/ошибки.
- [x] Добавить реальный app сценарий: изменение действия обновляет его строку и связанную цель,
      текущий фильтр сохраняется, viewport не прыгает на начало. Добавить fault fixture сценарий:
      refresh error сохраняет уже видимый список; retry возвращает актуальные данные.
- [x] RED: `npm run test:e2e -- tests/e2e/current.library-reactive.spec.ts`.
      До переключения UI feature tests должны показать конкретный отсутствующий контракт;
      существующие сохранные сценарии могут уже проходить. Не менять assertions ради RED.
- [x] Реализовать hook; заменить local data/timeCapacity/sequence/load на snapshot. Удалить library
      revision subscriptions и дополнительное прямое чтение capacity после сохранения. Удалить
      `dateRevision` prop и его четыре передачи; убрать parent state только если больше нигде не нужен.
      Корневой loader и остальные triggers родителя не менять.
- [x] Сохранить local command error, busy guard, notice и `planningContext.refresh()`. В `run`
      ожидать `whenSettled()` после существующего planning refresh; read error не отвергает
      успешную команду. Отображать command error перед snapshot error; retry вызывает refresh.
      Не заменять children на loading во время background refresh и не менять их keys.
- [x] Оставить time fallback effect с прежними событиями/5000 мс, направив его в `refresh()`.
      Не менять `usePlannerWorkTime`, clock tick и его revision как API других consumers.
- [x] GREEN: повторить новый E2E на обоих настроенных проектах и
      `npm run test:target -- src/presentation/planner-v2/PlannerLibrary.test.tsx`.
      Проверить отсутствие новых console errors, утечки слушателей и stale updates после unmount.

## Task 5: Замеры, соседние сценарии и handoff

**Files:**

- Update: `docs/architecture/2026-09-30-reactive-planner-library-verification.md`.
- Reuse: `tests/e2e/current.time-planning.spec.ts`, `tests/e2e/current.work-time.spec.ts`.

**Interfaces:** продуктовый API не расширяется; результат — фактические проверки и сравнение baseline.

- [x] Повторить одинаковые замеры 100/1000 действий. В report отделить library reader counts,
      физические DB reads focus и работу parent/PlanningContext. Приёмка: directions/capacity
      обновляются одним своим reader; action — actions+focus; unrelated events — ноль reads;
      burst не создаёт параллельных batches. Не задавать обещанный процент ускорения без измерений.
- [x] `npm run test:fast` после стабилизации application API, затем один `npm run verify`.
      Известные ошибки предсуществующего dirty baseline отделить от нового патча; не исправлять их
      вне scope и не выдавать частичный результат за зелёный verify.
- [x] Проверить соседние формы времени на desktop/mobile:
      `npm run test:e2e -- tests/e2e/current.time-planning.spec.ts --grep "an open time form|calendar schedules"`.
- [x] Проверить резервное межвкладочное обновление:
      `npm run test:e2e -- tests/e2e/current.work-time.spec.ts --grep "a second tab refreshes"`.
      Новый `current.library-reactive.spec.ts` из Task 4 повторять только при влияющих изменениях.
      Full E2E не запускать: storage/startup/navigation contracts не меняются, риски локализованы
      application и выбранными browser-сценариями. При обнаружении общего неизвестного риска сначала
      локализовать его и объяснить необходимость расширения scope.
- [x] Сравнить desktop/mobile baseline и результат: actions, goals, inbox, focus, calendar/time;
      проверить empty, first-load error/retry, background error, успешное сохранение и keyboard focus.
      Просмотреть diff на случай непреднамеренного изменения JSX/CSS или бизнес-команд.
- [x] Независимый read-only review проверяет commit mapping, focus bootstrap, race/error handling,
      cleanup и отсутствие общего кэша после account purge. Главный агент исправляет замечания
      и повторяет только затронутые проверки.
- [x] Выполнить `git diff --check`, изучить свой diff и `git status --short`; записать фактические
      команды/результаты, размеры fixture и ограничения в verification report. Не commit/push.

## Граница завершения

Первый этап готов, когда библиотека использует модель чтения и перечисленные проверки подтверждают
выборочное обновление, сохранность UI состояния и lifecycle. Today/PlanningContext, межвкладочный
транспорт и общий account-aware cache не являются незавершёнными задачами этого этапа: для них
нужен следующий отдельный план после оценки результата.
