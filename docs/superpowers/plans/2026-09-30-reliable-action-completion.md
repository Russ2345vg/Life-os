# Надёжное завершение действия — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Главный агент — единственный автор файлов; субагенты исследуют и проверяют read-only согласно AGENTS.md. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** завершение действия сохраняется один раз; ошибки обновления экрана и доставки восстанавливаются независимо от локального выполнения.

**Architecture:** существующий CompleteLifeAction и JournalUnitOfWork сохраняют предметное состояние. Узкий presentation controller разделяет commit и обновление представлений. Существующий outbox/coordinator выполняет доставку независимо от UI.

**Tech Stack:** TypeScript, React 19, IndexedDB, Vitest/fake-indexeddb, Playwright; новых зависимостей нет.

**Spec:** [контракт сценария](../../design/features/2026-09-30-reliable-action-completion.md).

Статус: реализовано 30.09.2026 после команды пользователя «Приступай к реализации».
Исходный dirty baseline реализации — только этот план и design specification.
`verify` и scoped E2E (44/44, desktop/mobile) прошли; независимый code review завершён.
Доказательства, уточнения плана и границы ручной QA: [отчёт](../../architecture/2026-09-30-reliable-action-completion-verification.md).

## Global Constraints

- UI → Presentation → Application → Domain; Infrastructure реализует application-порты.
- Новых зависимостей, persistent operation store, схемы IndexedDB и event bus нет.
- Авторитетный источник состояния — существующая база и application-команды; receipt временный.
- Новый параметр expectedCompletionKey необязателен для старых callers, обязателен для двух UI-входов.
- Повтор обновления не вызывает CompleteLifeAction; синхронизация не ждёт обновления экрана.
- Существующие правила contributions, completedOn, actual result и reopen сохраняются.
- Никаких push/публикаций; промежуточные коммиты только в согласованном Git-процессе.
- Не расширять патч на другие команды, общую реактивность Today или чистоту всех loaders.

## Review Focus

1. Reopen после старого клика: старый completionKey не завершает новый цикл — задача 1.
2. Loader падает или создаёт поздний commit: retry учитывает зависимые чтения и ждёт актуального
   refresh вместо вытесненного — задачи 2 и 4.
3. Ошибка уведомления после commit: очередь цела, нет ложного failure/unhandled rejection — задача 3.
4. Navigation/unmount и поздний ответ: нет prompt/ошибки на другом маршруте — задачи 2 и 4.
5. Полночь, необязательный итог и actual contribution: дата/поколение сохраняются, неизвестное
   значение не заменяется выдуманным результатом — задачи 1 и 5.

## Подготовка перед реализацией

- [x] Проверить `git rev-parse --show-toplevel`, `git status --short`; отделить новые чужие изменения.
- [x] Прочитать Spec и актуальный `docs/codex/TEST_MATRIX.md`; использовать активный worktree.
- [x] До UI-изменений открыть `/#/v2/today`, `/#/v2/actions` и форму итога в
      активной сборке; сохранить baseline 1440×900 и 390×844, route и computed styles feedback.
      Использовать изолированные тестовые данные. Не изменять пользовательскую базу.
- [x] Проверить фактический cascade: global/tokens → planner-v2 → planner-master →
      planner-premium с локальными planner-library/planner-views overrides. Переиспользовать
      текущие notice/error/button/PlannerSheet. Отсутствующий baseline явно отметить до UI-review.
- [x] Показать краткий дизайн-контракт из Spec. Для стандартной обратной связи отдельного
      макета не требуется; реализация начата после отдельного разрешения пользователя.

## Карта файлов

| Область           | Файлы                                                                                                        | Ответственность                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Команда           | `src/application/commands/CompleteLifeAction.ts`                                                             | ключ поколения и reconciliation concurrent winner                    |
| Ошибка транзакции | `src/infrastructure/persistence/IndexedDbJournalUnitOfWork.ts`                                               | сохранить типизированный version conflict                            |
| Controller        | новые `src/presentation/planner-v2/PlannerActionCompletion.ts`, `usePlannerActionCompletion.ts`              | commit receipt, refresh outcomes, retry, lifecycle                   |
| Чтение planning   | `src/presentation/planner-v2/PlanningContext.tsx`, новый `usePlanningState.ts`                               | доступный родителю результат refresh без смены предметного владельца |
| Adapter чтения    | `src/presentation/planner-v2/usePlannerLibraryReadModel.ts`                                                  | проверить snapshot после whenSettled/refresh                         |
| UI-входы          | `src/presentation/planner-v2/PlannerWorkspace.tsx`, `PlannerLibraryWorkspace.tsx`, `plannerTodayCommands.ts` | подключение одного сценария; существующие feedback/prompt            |
| Sync notification | `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.ts`                                            | небросающее post-commit уведомление                                  |
| Проверки          | точные existing/new test paths указаны в задачах                                                             | наблюдаемое поведение, а не совпадение реализации                    |

## Задача 1. Безопасное завершение одного поколения

**Files:** modify `CompleteLifeAction.ts`, `IndexedDbJournalUnitOfWork.ts`; create
`src/application/commands/CompleteLifeAction.test.ts` и
`src/infrastructure/persistence/CompleteLifeAction.integration.test.ts`; reuse
`src/app/composition/PlannerUiFlows.integration.test.ts` и
`src/infrastructure/persistence/planning-tests/GoalContributions.test.ts`.

**Interfaces:** сохранить `execute(input): Promise<Result<LifeAction, DomainError>>`;
добавить `readonly expectedCompletionKey?: string` в `CompleteLifeActionInput`.
Новый код ошибки — `action.completion_changed`; текст из Spec.

- [x] Добавить тесты: несовпадающий ключ до mutation; sequential duplicate без новых записей;
      две конкурентные команды одного поколения; version conflict после reopen; удаление
      между попыткой и reconciliation; обычный storage failure не считается успехом.
- [x] Проверить настоящее количество Journal/contributions/outbox, а не только status.
      Outbox сравнивать с baseline после создания action: одно выполнение создаёт несколько
      events разных entity types, поэтому общий размер очереди не обязан равняться одному.
      Конкурентное чтение организовать barrier/deferred, без sleep.
- [x] Запустить `npm run test:target -- src/application/commands/CompleteLifeAction.test.ts`
      и убедиться, что новые проверки падают по ожидаемому отсутствующему поведению.
- [x] В UoW сохранить код `persistence.version_conflict` в `transactionFailed`;
      rollback для pre-commit ошибки оставить прежним. В CompleteLifeAction сравнить ожидаемый
      ключ до domain complete; запомнить исходный ключ. При этом коде ошибки ровно один раз
      перечитать action, вернуть success только для completed с тем же ключом. Не делать retry save.
- [x] Добавить failure injection в существующий путь outbox/contribution записи: commit abort
      оставляет все четыре набора данных прежними; явная новая попытка создаёт один комплект.
      `findById` failure и failure reconciliation сохраняют понятную ошибку, без ложного success.
- [x] Выполнить targeted tests трёх затронутых файлов. Для совместимости нового кода ошибки
      включить `src/infrastructure/persistence/SetLifeActionTime.integration.test.ts` и
      `src/infrastructure/persistence/LifeActionDateUndo.test.ts`.

**Deliverable:** два конкурирующих запроса того же поколения сходятся к сохранённому результату;
старый ключ после reopen не выполняет новый цикл. Без изменений schema/domain calculations.

## Задача 2. Controller с раздельным commit и refresh

**Files:** create `src/presentation/planner-v2/PlannerActionCompletion.ts` и
`src/presentation/planner-v2/PlannerActionCompletion.test.ts`.

**Interfaces:**

```ts
type CompletionTarget = { readonly actionId: string; readonly completionKey: string };
type CompletionRefreshKey = 'workspace' | 'library' | 'planning';
type CompletionRefreshTask = {
  readonly key: CompletionRefreshKey;
  readonly run: () => Promise<void>;
};
type CompletionReceipt = CompletionTarget & { readonly action: LifeAction };
type CompletionRefreshIssue = { readonly key: CompletionRefreshKey; readonly error: Error };
type CompletionSnapshot =
  | { readonly phase: 'idle' }
  | { readonly phase: 'saving'; readonly target: CompletionTarget }
  | { readonly phase: 'not_saved'; readonly target: CompletionTarget; readonly error: Error }
  | {
      readonly phase: 'saved';
      readonly receipt: CompletionReceipt;
      readonly refresh: 'pending' | 'ready' | 'failed';
      readonly issues: readonly CompletionRefreshIssue[];
    };
```

Класс `PlannerActionCompletion` принимает `Pick<CompleteLifeAction, 'execute'>` и список
`CompletionRefreshTask`. Публичные методы: стабильные `subscribe(listener): unsubscribe`,
`getSnapshot(): CompletionSnapshot`, `complete(target): Promise<void>`,
`retryRefresh(): Promise<void>`, `close(): void`. `subscribe` пригоден для useSyncExternalStore.

- [x] Тесты: commit failure не запускает refresh; success публикует receipt до завершения
      deferred refresh; partial failure сохраняет receipt; retry не вызывает execute и успешные
      предшествующие tasks, но повторяет зависимые последующие; серия retry объединяется;
      close подавляет позднюю публикацию, но не отменяет commit.
- [x] Зафиксировать concurrency: пока complete/refresh pending, второе complete того же target
      возвращает текущую работу; другой target не запускается (UI busy). После failed refresh
      повтор того же saved target вызывает только retryRefresh. Разные поколения различаются.
- [x] Запустить `npm run test:target -- src/presentation/planner-v2/PlannerActionCompletion.test.ts`
      и подтвердить ожидаемый RED.
- [x] Реализовать state machine без React, DOM, storage и сетевых зависимостей. Выполнять
      refresh tasks последовательно в переданном порядке, ловить ошибку каждого и продолжать
      следующие. Retry начинает с первого failed task и выполняет оставшийся суффикс списка;
      это фиксированная последовательность сценария, без универсального workflow engine. Unknown failure
      преобразовывать в Error с понятным fallback. Observer failure не меняет saved receipt.
- [x] Повторить targeted test; ожидаются PASS, один execute на сохранённое выполнение,
      отсутствие timers и запросов после close. Прямого вызова sync в controller нет.

## Задача 3. Изоляция post-commit уведомления

**Files:** modify `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.ts`;
новые проверки в `src/infrastructure/persistence/CompleteLifeAction.integration.test.ts`;
reuse `src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts`.

**Interfaces:** `notifyCommitted(recorded: boolean): void` остаётся синхронным, небросающим
уведомлением. `recordUpsert`/`recordTombstone` сохраняют ошибки записи и rollback-семантику.

- [x] Добавить тест, где notify callback бросает после успешной записи completion; команда
      успешна, action/Journal/contributions/outbox сохранены, unhandled rejection отсутствует.
      Отдельно проверить `recorded=false` и сохранение pre-commit failure/rollback.
- [x] Запустить `npm run test:target -- src/infrastructure/persistence/CompleteLifeAction.integration.test.ts src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts`;
      подтвердить failure нового случая до правки.
- [x] Изолировать callback в `notifyCommitted`. Не ловить ошибки самой записи и не менять
      состояние очереди. Существующий lifecycle остаётся резервным запуском.
- [x] Повторить targeted test и существующие
      `src/application/sync/pilot/PilotSyncCoordinator.test.ts`,
      `src/app/lifecycle/PilotSyncLifecycle.test.ts`.

**Deliverable:** сбой сигнала запуска не превращает сохранённую операцию в неуспех.
Общий notification-контракт меняется узко; schema, протокол и scheduling не изменяются.

## Задача 4. Подключение «Сегодня» и библиотеки

**Files:** файлы Presentation из карты, новые tests
`src/presentation/planner-v2/plannerCompletionRefresh.test.ts` и
`tests/e2e/current.action-completion-recovery.spec.ts`.

**Interfaces:**

- `completePlannerAction(command, id, expectedCompletionKey?)` сохраняет возврат LifeAction.
- `PlanningContextValue` сохраняет `refresh(): Promise<void>` для текущих consumers и получает
  `refreshWithOutcome(): Promise<PlanningRefreshOutcome>`, где outcome —
  `{status:'ready'}` / `{status:'failed', error:Error}` / `{status:'superseded'}`.
  Вытеснение другим refresh внутри той же сессии присоединяет ожидание к последнему in-flight
  запросу; вернуть его ready/failed. Superseded относится только к смене scope/cleanup и не
  превращается adapter в ready активного controller. Аналогичное ожидание актуальной загрузки
  требуется root loader, чей sequence guard сейчас может молча завершить старый запрос.
- Вынести существующее владение state/effects из PlanningProvider в
  `usePlanningState(services, today, refreshToken): PlanningContextValue | null`.
  Вызывать hook в PlannerWorkspaceContent; `PlanningProvider` принимает готовый `value`.
  Это один владелец state, без второй подписки или копии planning snapshot.
- Adapter library использует настоящий `model.getSnapshot()` после `whenSettled()`;
  нельзя читать замкнутый React snapshot предыдущего render и считать resolved Promise успехом.
- `usePlannerActionCompletion` связывает controller с useSyncExternalStore, сохраняет его в
  пределах route/date/services и закрывает старый controller. StrictMode setup/cleanup должен
  создавать работоспособную сессию, а не повторно активировать навсегда closed instance.

- [x] Добавить unit tests adapters: PlanningContext swallowed error становится failed outcome;
      library snapshot.error после resolved whenSettled виден controller; superseded результат
      не публикует ошибку на новую дату/маршрут. Refresh A вытеснен B в той же сессии, B падает:
      controller получает failed, а не ready после A. Pure adapters разместить рядом с controller
      в новом `plannerCompletionRefresh.ts`; hook tests без нового DOM test dependency не требуются.
- [x] Запустить `npm run test:target -- src/presentation/planner-v2/plannerCompletionRefresh.test.ts`;
      подтвердить ожидаемый RED, затем реализовать adapters и извлечение usePlanningState.
      Существующие `refresh()` consumers сохраняют прежнюю Promise<void> семантику.
- [x] Today использует порядок workspace → planning; library — planning → library.
      Library task ждёт `whenSettled()` после завершения planning, включая failure planning,
      и проверяет актуальный snapshot. При retry после собственного failed snapshot явно вызывает
      refresh; после retry planning также ждёт чтения, вызванного его новыми commits. Если новых
      commits нет и library уже успешна, whenSettled не инвалидирует её заново. Другие mutation
      handlers сохраняют прежний run. Today использует существующий loader, без новой reactive модели.
- [x] Добавить тест deferred materialization: planning поздно пишет occurrence, library
      перечитывает данные и падает. Controller остаётся saved + failed; следующий retry
      восстанавливает library. Повтор planning не может завершить controller раньше чтения
      вызванных им commits, даже если первое library settlement ранее уже завершалось.
      Проверка размещена в `src/app/composition/PlannerActionCompletion.integration.test.ts`.
- [x] Заменить зависимость `refreshToken` от объекта `data` на отдельный счётчик успешных
      загрузок плюс существующий quick-access revision. Сигнатура root loader:
      `load(options?: { readonly refreshPlanning?: boolean }): Promise<void>`; default — true.
      Успешная актуальная загрузка увеличивает счётчик только при true. Workspace task controller
      вызывает `load({ refreshPlanning: false })`, поскольку planning task выполняется явно.
      Другие callers вызывают прежний `load()`; sync/effect callbacks оборачивают вызов без
      аргументов, чтобы DOM event не стал options. Проверить счётчики запросов и отсутствие
      лишнего planning refresh от completion; unrelated refresh сохраняет прежнее поведение.
- [x] Брать expectedCompletionKey из action текущего snapshot. Если action отсутствует,
      показать ошибку с повтором загрузки; не выполнять команду без ключа через этот UI-путь.
- [x] На saved receipt показать существующий notice и вызвать promptForResult один раз на ключ.
      Для refresh failure использовать существующий error/retry с текстом Spec. Старый receipt
      и его prompt не пересоздавать при retry; UI busy/quick-access guard учитывают controller.
- [x] В retry обработать все failed tasks, включая planning; существующая кнопка library refresh
      не должна оставлять planning.error незамеченной. Не скрывать stale planning progress как актуальный.
- [x] Проверить navigation/unmount/StrictMode и draft: новые маршруты не получают старую ошибку,
      prompt draft не очищается от фонового refresh, keyboard focus остаётся управляемым.
- [x] Выполнить targeted controller/adapters tests и существующие
      `src/app/composition/PlannerLibraryReadModel.integration.test.ts`,
      `src/presentation/planner-v2/PlannerLibrary.test.tsx`.

**Deliverable:** одинаковая семантика сохранения/retry в обоих входах, без переноса business
mutations в React и без ожидания сети. Layout/CSS менять только если baseline выявит реальную
проблему размещения новых состояний в пределах этого сценария.

## Задача 5. Приёмка сценария и итоговая проверка

**Files:** reuse `tests/e2e/current.completion-summary.spec.ts`, новый recovery spec из задачи 4;
использовать существующие `current.library-reactive.spec.ts` и `current.daily-workflow.spec.ts`.
Результаты сохранить в `docs/architecture/2026-09-30-reliable-action-completion-verification.md`.

- [x] В recovery E2E использовать одноразовый сбой application-чтения после реального completion
      commit в изолированной IndexedDB. Не ломать запись транзакции и не добавлять production debug API.
      Перехватить test-only module boundary, восстановить чтение после одного failure; без fixed sleeps.
- [x] Проверить Today и library: действие durable; показывается saved + refresh error;
      retry восстанавливает экран; после reload completionKey/Journal/contributions прежние.
      Двойной вызов и stale generation проверить в controller/command tests;
      reopen, navigation и отсутствие pageerror — также в browser flows.
- [x] В completion-summary проверить optional skip/save и сохранность текста при refresh failure.
      В targeted integration добавить смену clock через полночь: retry не меняет completedOn/
      effectiveDate; actual contribution остаётся pending, если значение не вводили.
- [x] Проверить sync отдельно integration-тестом с существующим fake transport/installation:
      offline → queued → разрешённый trigger → доставка; paused/unauthorized не передают;
      повтор trigger не создаёт локальных completion artifacts. Использовать
      `src/infrastructure/sync/pilot/PilotSyncFoundation.integration.test.ts` и
      `src/application/sync/account/SyncTransferGate.test.ts`. Browser web build сам по себе
      не доказывает работу native sync, которая недоступна вне Tauri.
- [x] После стабилизации command/notification contracts выполнить `npm run test:fast`,
      затем один `npm run verify`. Не дублировать отдельные typecheck/lint/build после зелёного gate.
- [x] Выполнить scoped browser suite в обоих настроенных проектах (`desktop-chrome`,
      `mobile-chrome`; без project selector запускаются оба):

```bash
npm run test:e2e -- tests/e2e/current.action-completion-recovery.spec.ts tests/e2e/current.completion-summary.spec.ts tests/e2e/current.library-reactive.spec.ts tests/e2e/current.daily-workflow.spec.ts
```

- [x] Сравнить baseline/результат 1440×900 и 390×844, keyboard/focus, console, states и
      применимые пункты Правила №38. Ручную native sync QA отметить отдельно, если отсутствует
      тестовая Tauri-среда; не выдавать fake transport за проверку двух реальных устройств.
- [x] Выполнить `git diff --check`, прочитать diff и `git status --short`; дать независимому
      read-only reviewer проверить границы commit/retry, типы ошибок и выполненные сценарии.
- [x] В verification report указать команды/exit codes, оставшиеся ограничения и ручную QA.

Полный E2E по этому плану не требуется: схема хранения, routing, startup и протокол sync
не меняются; риски локализованы completion и post-commit notification. Если диагностика обнаружит
межсценарную регрессию с неясными границами, сначала объяснить новое основание и применить AGENTS.md.

## Проверка самого плана

На этапе планирования были проверены ссылки/пути, соответствие npm-команд package.json,
локальный Prettier двух Markdown и `git diff --check`. После разрешения реализации выполнены
product gate и scoped browser QA; итоговые результаты приведены в verification report.
