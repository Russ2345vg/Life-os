# Управление действием на месте — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Главный агент — единственный автор изменений; независимые исследования и review — read-only согласно AGENTS.md. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** изменить и выполнить действие из Today, библиотеки или поиска, сохранив исходный экран и место пользователя.

**Architecture:** ApplicationShell владеет location с необязательной action panel. Background получает прежний PlannerRoute и остаётся mounted. Общий detail body, одна root library read session и один completion owner переиспользуют существующие application-команды.

**Tech Stack:** текущие TypeScript/React, native dialog, IndexedDB, Vitest и Playwright; без новых зависимостей.

**Spec:** [дизайн-контракт](../../design/features/2026-09-30-action-control-panel.md).

Статус: реализация и техническая проверка завершены 30.09.2026. Чекбоксы ниже сохраняют исходную
последовательность работ, а фактический состав и проверки приведены в
[отчёте о проверке](../../architecture/2026-09-30-action-control-panel-verification.md).
Предсуществующий dirty baseline — завершённое обновление reliable-action-completion и его документы.

## Global Constraints

- Работать в активном LifeOS worktree; сохранять baseline. Commit/push/release не входят в запрос.
- UI → Presentation → Application → Domain; никакого `any` и прямых storage mutations из компонентов.
- Один location owner в ApplicationShell; URL-параметр панели — `action`, не занятый `actionId`.
- `#/v2/actions/:id` остаётся standalone; исходный `location.page` не меняется от открытия панели.
- Нет новой схемы данных, зависимостей, persisted draft store, общего modal framework или новых sync rules.
- Root library subscription после первой активации живёт до смены services/base route/date.
- Panel close не закрывает completion controller и не является dismiss сохранённого receipt.
- Guard панели видит только её subtree; настоящий page leave сохраняет текущие diary/memory guards.
- Название/описание сохраняются явно; текущие field-conflict и expectedVersion/completionKey контракты сохраняются.
- Общая Premium тема и PlannerSheet переиспользуются; отдельный visual approval не требуется в рамках Spec.
- Vitest работает в Node: unit tests проверяют pure helpers/controllers и SSR-разметку.
  Реальные React mount/unmount, StrictMode, DOM focus и native dialogs проверяются scoped E2E;
  SSR не считается доказательством этих сценариев. Новые DOM-test зависимости не добавлять.

## Review Focus

1. Отказ dirty/busy при Back не переписывает чужую history entry и не меняет panel draft — задача 1.
2. Close между commit и refresh не отписывает read model и не даёт ложный ready — задача 2.
3. Внешняя смена даты не теряет dirty title; удалённый opener не ломает focus — задачи 3–4.
4. Поиск над account/sleep сохраняет исходные поля; Cancel handoff не закрывает поиск — задача 5.
5. Native dialog top layer: меню/confirm доступны, Escape не закрывает сразу два уровня,
   итог не попадает в другое поколение/action — задачи 4 и 6.

## Подготовка

- [ ] Прочитать Spec, `AGENTS.md`, актуальную `docs/codex/TEST_MATRIX.md`.
- [ ] Проверить Git root/status и отделить baseline предыдущего completion обновления.
- [ ] Показать краткий дизайн-контракт Spec. Переиспользовать текущий PlannerSheet.
- [ ] Проверить актуальность сохранённых desktop/mobile baseline. Если UI изменился после
      их снятия, открыть активную сборку и обновить snapshots/computed styles до UI-правок.
- [ ] Зафиксировать маршрут, stylesheet cascade и состояния Today/actions/detail/search.
      Использовать изолированные тестовые данные; пользовательскую базу не менять.

## Карта модулей

| Область                 | Existing                                                                                                                                                   | New                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Location/history        | `ApplicationShell.tsx`, `ApplicationRoute.ts`, `BrowserApplicationRouteSync.ts`, `PlannerNavigation.ts`                                                    | `src/presentation/planner-v2/PlannerLocation.ts`, `src/app/lifecycle/PlannerLocationNavigation.ts`                |
| Shared reads/completion | `PlannerWorkspace.tsx`, `PlannerLibraryWorkspace.tsx`, `usePlannerLibraryReadModel.ts`, `usePlannerActionCompletion.ts`                                    | `src/presentation/planner-v2/usePlannerActionSurface.ts`                                                          |
| Detail/editor           | `PlannerActionList.tsx`, `PlanningActionDetails.tsx`, `plannerActionDraft.ts`                                                                              | `src/presentation/planner-v2/PlannerActionDetailsContent.tsx`, `PlannerActionEditor.tsx` в том же каталоге        |
| Action callbacks        | root/library action handlers, `plannerTodayCommands.ts`                                                                                                    | `src/presentation/planner-v2/plannerActionOperations.ts`                                                          |
| Panel/guards/focus      | `PlannerSheet.tsx`, `QuickAccessContext.tsx`, `RouteLeaveGuard.tsx`, `EntityContextMenu.tsx`                                                               | `src/presentation/planner-v2/PlannerActionPanel.tsx`, `PlannerActionPanelGuard.tsx`, `PlannerDialogScrollLock.ts` |
| Entrypoints             | `PlannerToday.tsx`, `PlannerActionList.tsx`, `PlannerViewParts.tsx`, `PlannerCalendar.tsx`, `PlannerKanban.tsx`, `PlannerTree.tsx`, `QuickAccessPanel.tsx` | новый scoped E2E `tests/e2e/current.action-panel.spec.ts`                                                         |

Все existing Presentation файлы в таблице находятся в `src/presentation/planner-v2/`, кроме
`src/presentation/navigation/ApplicationRoute.ts` и `src/presentation/navigation/RouteLeaveGuard.tsx`;
shell/lifecycle — в `src/app/`. Точные пути проверять до каждого патча, не создавать дубликаты.

## Задача 1. Location панели и корректная history

**Files:** создать `PlannerLocation.ts`, `PlannerLocation.test.ts`,
`src/app/lifecycle/PlannerLocationNavigation.ts`, `PlannerLocationNavigation.test.ts`;
изменить `src/app/ApplicationShell.tsx`, `src/app/lifecycle/BrowserApplicationRouteSync.ts` и его test,
`src/presentation/navigation/ApplicationRoute.ts` и его test.

**Interfaces:**

- `PlannerLocation` — точный тип из Spec; `parsePlannerLocation(hash): PlannerLocation | null`,
  `buildPlannerLocation(location): string`. Существующий PlannerRoute parser остаётся parser страницы.
- `PlannerLocationTransition = { from: PlannerLocation; to: PlannerLocation; reason:
'navigate' | 'open-action' | 'replace-action' | 'close-action' | 'history' }`.
- `PlannerLocationNavigation` предоставляет `navigate(page)`, `openAction(actionId)`, `closeAction()`:
  каждый возвращает `Promise<boolean>`. Его testable input ports: read current location, commit,
  browser push/replace/go/read-entry и `canTransition(transition): Promise<boolean>`.
- History entry metadata: `lifeosNavigation: { version: 1; sessionId: string; entryId: string;
index: number; sourceEntryId: string | null }`; другие поля state сохраняются.
  `sessionId` обозначает отслеживаемую цепочку: при unowned rebase создаётся новый id,
  старые source ids инвалидируются; delta разрешена только внутри одной цепочки.
  Нет DOM/browser API в location parser. Работа с window — только shell/lifecycle.

- [ ] RED: roundtrip Today/tomorrow/list/calendar/kanban/tree/time+action, encoded id,
      пустой/некорректный id, standalone action URL, неизвестные параметры.
- [ ] RED: push open → Back close → Forward open; replace A→B; close прямого overlay URL;
      два browser events дают один transition; queued event сохраняет captured hash+metadata.
- [ ] RED: dirty/busy отказ между managed entries восстанавливает позицию, повторное событие
      не запускает guard снова; несколько быстрых Back не коммитят вытесненное решение.
      Для unowned boundary проверить определённый Spec fallback без затирания чужой entry.
      Unknown → rebase → Back к старой managed entry не вычисляет delta по несовместимым индексам.
- [ ] Запустить targeted tests новых parser/coordinator + `BrowserApplicationRouteSync.test.ts`;
      подтвердить ожидаемый RED. Реализовать coordinator и поддержку в shell.
- [ ] Page open/close panel не вызывает page-leave flush; смена самой page вызывает существующий
      guard. Сохранить normalization diary date, неизвестных стартовых URL и beforeunload.
      `BrowserApplicationRouteSync` передаёт события одному coordinator; параллельного route owner нет.
- [ ] GREEN: те же tests плюс `src/app/ApplicationShell.test.tsx`,
      `src/presentation/planner-v2/PlannerNavigation.test.ts`, `ApplicationRoute.test.ts`,
      `src/presentation/navigation/RouteLeaveGuard.test.tsx`.

**Deliverable:** history/location отдельно проверены; старые standalone routes продолжают работать.

## Задача 2. Стабильный владелец чтений и выполнения

**Files:** `PlannerWorkspace.tsx`, `PlannerLibraryWorkspace.tsx`, `usePlannerLibraryReadModel.ts`,
новый `usePlannerActionSurface.ts`, `PlannerActionSurface.test.ts`;
existing completion controller/adapters/composition tests.

**Interfaces:**

- `usePlannerLibraryReadModel(factory, today, options?: { scope: string; enabled: boolean })`
  возвращает прежние model/snapshot/refresh/whenSettled. Root хранит activation latch:
  переданный `enabled` после первого `true` не становится `false` до смены scope.
- `PlannerActionSurface` предоставляет общие reads, `complete(target: CompletionTarget): Promise<void>`,
  completion snapshot/error/busy/retry/dismiss. Внутренний `usePlannerActionCompletion` остаётся прежним.
  Вынесенные правила выбора стабильного scope, активации и refresh tasks проверяются в
  `PlannerActionSurface.test.ts`; React subscription lifecycle проверяется в задаче 5 через браузер.
- `PlannerLibraryWorkspace` получает reads и completion callbacks от root; свои goal operations
  и обычные command errors сохраняет. Никакой callback-registration схемы между child и root.

- [ ] RED: сначала неактивная session не читает; первая panel подписывается; close/повторное open
      не делают last unsubscribe; base route/date/services change закрывает прежнюю session.
- [ ] RED: completion → deferred refresh → close → reopen → failure → retry: один execute,
      receipt не теряется, snapshot.error проверяется после актуального settlement.
      Controller/adapters проверяются unit; реальный close/reopen — scoped browser в задаче 5.
      Старый scope не публикует feedback.
- [ ] Запустить `npm run test:target -- src/presentation/planner-v2/PlannerActionSurface.test.ts`
      вместе с controller/adapters tests и подтвердить RED.
- [ ] Поднять read model в root; запоминать факт активации до смены base scope. Для background
      library сразу активировать, для других страниц — при первой panel.
- [ ] Поднять library completion в общий root owner. Tasks стабильны по base scope/model:
      Today workspace→planning→library; остальные planning→library. Неактивную модель не refresh-ить.
      Перед complete из panel дождаться её initial read; брать shown completionKey.
- [ ] Root feedback доступен после close. Внутри панели показывать receipt только её action/key;
      summary остаётся привязан к исходному target. Не менять успешный commit при failure чтений.
- [ ] GREEN: surface/controller/adapters tests плюс
      `src/app/composition/PlannerActionCompletion.integration.test.ts`,
      `src/app/composition/PlannerLibraryReadModel.integration.test.ts`.

**Deliverable:** одно выполнение и один read model переживают открытие/закрытие интерфейса.

## Задача 3. Общее содержимое карточки и частые операции

**Files:** новые `PlannerActionDetailsContent.tsx`, `PlannerActionEditor.tsx`,
`plannerActionOperations.ts`, `plannerActionOperations.test.ts`, `PlannerActionDetailsContent.test.tsx`;
`PlannerActionList.tsx`, `PlannerLibraryWorkspace.tsx`, `PlannerWorkspace.tsx`.

**Interfaces:**

- `PlannerActionDetailsContent` получает `action: LifeAction`, актуальные goals/directions/spheres,
  actions для parent/subactions, `today`, существующие `PlannerActionOperations`, `onSetTime`,
  `onNavigate` и `presentation: 'page' | 'panel'`. Не владеет router, read model или completion controller.
- `PlannerActionEditor` выделяется из private `PlannerActionEdit`, сохраняет field drafts;
  `compact` режим размещает title в частой зоне, описание/потребность под раскрытием.
- Тип `PlannerActionOperations` переносится из `PlannerActionList.tsx` в
  `plannerActionOperations.ts`; старый модуль временно re-export-ит тип для текущих consumers.
  Общая карточка не импортирует тип из компонента списка.
- `createPlannerActionOperations` — stateless dispatch существующих callbacks, возвращает
  `PlannerActionOperations` + `onSetTime: SetActionTime`. Вход: services, текущий action lookup,
  общий run/refresh, changeDate/undo и completion callback. Goal-specific operations сюда не переносятся.

- [ ] RED: page и panel дают одинаковые payloads edit/date/goal/time/complete/reopen.
      Draft/ready используют разные существующие text-команды; completed-date сохраняет прежнее правило.
- [ ] RED: изменение даты в фоне сохраняет dirty title; изменение title показывает conflict;
      ошибка save сохраняет ввод; архив/удаление выбранного action не оставляет активные mutations.
      Field state проверяется unit, ввод и доступность controls после обновления — browser в задаче 5.
- [ ] Запустить targeted новых tests и `plannerActionDraft.test.ts`, `PlannerActionList.test.tsx`.
- [ ] Извлечь содержимое без копирования логики. Standalone сохраняет «Все действия» как fallback;
      panel не показывает этот переход вместо Close. Родитель/поддействие внутри panel меняет id через openAction.
- [ ] Частые поля разместить по Spec; не менять recurrence/progress calculations и правила actual result.
      `PlanningActionDetails`, `CompletionResult` и time form переиспользуются.
- [ ] GREEN: targeted + `src/presentation/planner-v2/PlannerLibrary.test.tsx`.

**Deliverable:** карточка имеет одну реализацию команд и содержимого для page/panel.

## Задача 4. Panel shell, scoped guards и dialogs

**Files:** новые `PlannerActionPanel.tsx`, `PlannerActionPanelGuard.tsx`, `PlannerActionPanelGuard.test.ts`,
`PlannerDialogScrollLock.ts`, `PlannerDialogScrollLock.test.ts`; изменить `PlannerSheet.tsx`,
`QuickAccessContext.tsx`, `EntityContextMenu.tsx`, `PlannerActionTimeSheet.tsx`, `CompletionResult.tsx`;
локальные panel styles в новом `planner-action-panel.css`.

**Interfaces:**

- `PlannerActionPanel` получает selected action id из location, surface/operations, `onClose` и
  `onOpenAction` из shell; локального дублирующего selected id нет.
- Scoped guard registry расширяет текущий QuickAccess guard механизм: default root scope;
  `PlannerActionPanelGuard` оборачивает subtree, `inspect` агрегирует только его регистрации,
  `requestLeave(): Promise<boolean>` показывает local confirm. Child time/summary — дочерние scopes.
- `PlannerActionPanelLeaveGuard` имеет `requestLeave(): Promise<boolean>` и
  `shouldBlockUnload(): boolean`; shell передаёт
  `registerActionPanelGuard(guard: PlannerActionPanelLeaveGuard): () => void` с cleanup.
  Page transition сначала получает разрешение панели, затем вызывает текущий RouteLeaveGuard;
  panel-only transition не flush-ит background forms. `requestLeave` не удаляет drafts:
  cleanup происходит только после принятия всего перехода.
- Root summary target дополняется transient origin `source | { panelSessionId: string }`.
  Panel-origin `CompletionResultPrompt` получает тот же scope через provider явно, даже как
  sibling панели. Close снимает только summary этой session, не completion receipt.
- `PlannerSheet` получает optional initial/return focus callbacks и scroll-lock option с прежними
  defaults. `acquirePlannerDialogScrollLock(document): () => void` reference-counted, cleanup идемпотентен.

- [ ] RED: dirty Stay/Discard, busy отказ, pending refresh разрешает Close, beforeunload dirty/busy;
      background draft не влияет на panel close. Двойной leave request объединяется.
      Dirty summary → Back → Stay/Discard учитывает panel scope; после разрешения панели
      отказ background flush сохраняет её drafts. Busy выполнения — только snapshot.phase `saving`,
      не `completion.busy` с pending refresh.
- [ ] RED: reference-count scroll lock; закрытие верхнего dialog не разблокирует нижний;
      после удаления opener focus идёт в исходный heading с preventScroll.
- [ ] Реализовать native panel со знакомой оболочкой и exact copy из Spec. Начальный focus — heading.
      Не создавать отдельную палитру или общий modal framework.
- [ ] Time/summary имеют свой guarded close. Escape закрывает только topmost editor/menu;
      принятый parent close снимает дочерние dialogs. Итог другого completionKey не ретаргетится.
- [ ] Portal меню/confirm внутри panel направить в ближайший dialog; вне panel сохранить текущий
      target. Проверить Escape propagation и native top-layer доступность destructive confirmation.
- [ ] GREEN: targeted guard/scroll + существующие `PlannerSheetResize.test.ts`,
      `src/presentation/navigation/RouteLeaveGuard.test.tsx`. Top-layer меню проверить в новом
      `current.action-panel.spec.ts`; соседняя регрессия — существующий сценарий
      `entity menus support hold, cancel scroll gestures, keyboard and confirmed deletion at mobile widths`
      в `current.daily-workflow.spec.ts`.

**Deliverable:** panel close безопасен для ввода, background и вложенных форм.

## Задача 5. Три точки входа и сохранённый источник

**Files:** `PlannerWorkspace.tsx`, `PlannerToday.tsx`, `PlannerActionList.tsx`,
`PlannerViewParts.tsx`, `PlannerCalendar.tsx`, `PlannerKanban.tsx`, `PlannerTree.tsx`,
`QuickAccessPanel.tsx`, новый `tests/e2e/current.action-panel.spec.ts`.

**Interfaces:** `onOpenAction(actionId: string): Promise<boolean>` передаётся от shell.
Источники получают только base route; ordinary title click использует этот callback,
`href` для modified click остаётся `#/v2/actions/:id`.
QuickAccess сохраняет query/mode/draft в существующем владельце, ephemeral return target
`'source' | 'quick-access'` хранится shell по managed panel entry id до смены source/reload,
включая время между Back и Forward; он не сохраняется в history state.

- [ ] RED browser: Today/завтра → panel → rename/date → Close сохраняет день и scroll;
      actions с query/filter/sort/expanded item сохраняет их; calendar/kanban/tree сохраняют вид.
- [ ] RED browser: поиск над account/sleep открывает action без потери background draft;
      Close/Back возвращает query и focus результата; отменённый handoff не закрывает поиск.
      Поиск → action → Back → Forward → Close также возвращает тот же запрос и focus.
- [ ] RED browser: direct URL/reload, modified click, empty/deleted id, Back/Forward,
      dirty cancellation, source entry fallback и Escape только верхнего dialog.
- [ ] RED browser: close/reopen между commit и refresh не теряет receipt, retry не повторяет
      command; root subscription остаётся активной. Проверить cleanup/setup StrictMode в текущей
      dev-сборке и отсутствие позднего feedback прежнего scope.
- [ ] Подключить callbacks и source-only keys. Не вызывать root navigate cleanup до принятого
      перехода. При panel-only переходе не сбрасывать data/notice/drafts исходного экрана.
      Пронести `Promise<boolean>` от shell через workspace до QuickAccess, убрав прежнее
      отбрасывание результата через `void`; обычные link handlers могут не ожидать результат.
- [ ] Сохранить выбранный action после исчезновения строки из фильтра до явного Close;
      после реального удаления показать unavailable state. Background refresh сохраняет controls.
- [ ] Поиск закрывать после accepted action-open; убрать безусловный focus main для этого пути.
      Первичный search provenance возвращается только при закрытии в тот же source; A→B его не меняет.
- [ ] GREEN: `npm run test:e2e -- tests/e2e/current.action-panel.spec.ts` на обоих проектах.

**Deliverable:** один управляемый сценарий из Today, библиотеки и поиска, с сохранённым контекстом.

## Задача 6. Регрессия, visual QA и handoff

**Files:** дополнить `current.action-completion-recovery.spec.ts`, `current.completion-summary.spec.ts`,
`current.quick-access.spec.ts` по новым контрактам; создать
`docs/architecture/2026-09-30-action-control-panel-verification.md` после реализации.

- [ ] Проверить completion из panel: refresh failure → Close → reopen → retry не вызывает новый
      execute и не создаёт Journal/contribution; summary skip/save и draft работают с исходным key.
- [ ] Проверить смену дня/services, сохранённую дату через полночь, внешний commit и исчезнувший
      opener; time form сохраняет исходный expectedVersion, date undo и recurrence scope прежние.
- [ ] После targeted tests выполнить один актуальный `npm run verify`. `test:fast` добавлять,
      только если реализация затронула общий Application/Domain контракт сверх Presentation/App.
- [ ] Запустить основной scoped browser набор (обе viewport-конфигурации по умолчанию):

```bash
npm run test:e2e -- tests/e2e/current.action-panel.spec.ts tests/e2e/current.action-completion-recovery.spec.ts tests/e2e/current.completion-summary.spec.ts tests/e2e/current.quick-access.spec.ts tests/e2e/current.library-reactive.spec.ts tests/e2e/current.sheet-resize.spec.ts tests/e2e/current.time-planning.spec.ts tests/e2e/current.date-undo.spec.ts tests/e2e/current.daily-workflow.spec.ts
```

- [ ] Из-за общей history границы отдельно выполнить guard-навигацию существующих разделов:

```bash
npm run test:e2e -- tests/e2e/current.diary.spec.ts tests/e2e/current.memory.spec.ts --grep "daily diary saves|failed photo and browser back|memory save failure"
```

- [ ] Для этой выборки `VITE_LIFEOS_MEMORY_ENABLED` должен отсутствовать либо равняться `true`
      и для runner, и для тестовой сборки. При временном изменении env восстановить исходное значение.
      Ожидать 6 выполненных сценариев, 0 skipped; fixture flag для memory здесь отсутствует.
- [ ] Сравнить baseline/result 1440×900 и 390×844: hierarchy/цвет/spacing/controls, loading/empty/error/
      success, 44 px touch targets, keyboard/focus, scroll lock, safe-area, reduced motion, console.
      Пройти применимые пункты Правила №38. Результат не помечать новым visual approval.
- [ ] Независимый read-only review: история при отказе, lifetime readers/completion, scoped guards,
      nested dialogs, scope diff. Проверить `git diff --check`, прочитать diff, выполнить `git status --short`.
- [ ] Записать свежие команды/exit codes, screenshots и реальные ограничения в verification report.
      Повторять зелёный gate только после влияющего изменения или обнаруженного риска.

Полный E2E не назначается автоматически: parser/history covered targeted, panel/source transitions —
основным scoped набором, чужие autosave guards — выборкой diary/memory. Если изменение history
выйдет за этот контракт либо обнаружится межсценарная регрессия с неясными границами, сначала
объяснить, почему scoped-проверок недостаточно, затем применить полный gate по AGENTS.md.

## Реализованное отклонение от структуры плана

Общее содержимое полной страницы и панели размещено в существующем `PlannerActionList`, а общие
команды — в `plannerActionOperations.ts`. Отдельные `PlannerActionDetailsContent`,
`PlannerActionEditor` и `PlannerActionSurface` не понадобились: они добавили бы обёртки без
самостоятельного состояния или поведения. Контракты общего владельца чтений, выполнения и
навигации проверены unit/integration и браузерными сценариями из отчёта.
Реализацию выполнять следующим разрешённым этапом главным агентом с read-only review.
