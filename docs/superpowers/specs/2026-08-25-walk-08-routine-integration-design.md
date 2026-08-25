# WALK-08 — интеграция прогулки с распорядком

## Контекст и цель

WALK-01—07 уже дали LifeOS единственный aggregate `Walk`, надёжный lifecycle активной прогулки,
три намерения, короткое завершение, outcome и сохраняемый Reentry. В распорядке уже существуют
`RoutineBlock`, вычисляемый `EffectiveRoutineOccurrence` и отдельный факт выполнения
`RoutineOccurrenceExecution`. Assignment `walk` пока только открывает раздел «Прогулки» и не
связывает два lifecycle.

Цель WALK-08 — сделать один блок распорядка полноценной точкой запуска прогулки: сохранить точный
occurrence, начать Walk и факт выполнения согласованно, автоматически завершить или прервать
исходный occurrence вместе с Walk и после Reentry вернуть пользователя на правильную дату
распорядка к следующему шагу.

WALK-08 не меняет смысл обычных Walk или других назначений Routine и не начинает интеграции
Decision, Goal, Project, Today, Capture или Inbox.

## Пользовательский сценарий

1. Пользователь открывает текущую дату в «Распорядке» и видит блок с assignment `walk`.
2. Основная команда «Начать прогулку» открывает существующий flow подготовки Walk. До
   подтверждения подготовки предметные записи не создаются.
3. Подготовка показывает источник прогулки: название и время блока, а также краткую точку
   возврата «После прогулки».
4. После подтверждения LifeOS одной транзакцией создаёт active Walk и running
   `RoutineOccurrenceExecution` для точного occurrence.
5. Reload восстанавливает active Walk; running occurrence остаётся связанным с ним.
6. Нормальное завершение Walk одной транзакцией переводит Walk в `completed`, а occurrence — в
   `completed`. Прерывание Walk переводит оба объекта в `abandoned`.
7. Outcome и Reentry используют уже существующий WALK-07 lifecycle.
8. Основная CTA Reentry сначала завершает Reentry, затем открывает правильную дату Routine,
   подраздел «День», и фокусирует следующий occurrence, если он ещё существует.

## Выбранная архитектура

`Walk` и `RoutineOccurrenceExecution` остаются двумя существующими aggregates со своими
инвариантами. Для согласованной записи вводится application-порт `RoutineWalkUnitOfWork`,
реализованный одной IndexedDB-транзакцией над существующими stores `walks`,
`routineOccurrenceExecutions`, `routineBlocks` и `routineOccurrenceOverrides`.

Новый aggregate, repository, object store, session engine или React/localStorage-источник
предметного состояния не создаётся. Направление зависимостей сохраняется:

`UI → Presentation → Application → Domain`

Infrastructure реализует application-порт и использует существующие record mappers. Application
координирует два aggregates, а Presentation только запускает команды и отображает возвращённое
состояние.

### Отклонённые варианты

1. Последовательный вызов `StartRoutineOccurrence`, затем `CreateWalk`/`StartWalk` — сбой между
   записями оставляет running occurrence без Walk или Walk без источника.
2. Последовательные записи плюс startup reconciliation — добавляют второй recovery lifecycle и
   необходимость угадывать намерение пользователя после частичного сбоя.
3. Отдельный `RoutineWalkSession` aggregate/store — дублирует существующие Walk и Routine facts.

## Точная ссылка на occurrence

Одного `routineBlockId` и `Walk.date` недостаточно: у rescheduled occurrence исходная
`occurrenceDate` отличается от `effectiveDate`. Поэтому Domain получает value object:

```ts
export interface WalkRoutineOccurrenceReference {
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly effectiveDate: DayDate;
}

export interface WalkRoutineContext {
  readonly source: WalkRoutineOccurrenceReference;
  readonly sourceTitle: string;
  readonly next: WalkRoutineOccurrenceReference | null;
}
```

`WalkReturnContext` получает optional nullable поле `routineContext`. Для routine launch:

- `origin = routine`;
- `entity.type = routine`;
- `entity.id` совпадает с `routineContext.source.routineBlockId`;
- `nextStep` содержит snapshot безопасной подписи следующего блока либо `null`;
- `routineContext.source.effectiveDate` совпадает с датой запуска Walk;
- `routineContext.next`, если существует, относится к той же effective date.

`WalkReentryAction` получает optional nullable `routineContext` и сохраняет тот же snapshot при
выборе `resumeContext`. Это делает рассчитанное действие самодостаточным после reload. Другие
origin/action kinds обязаны иметь `routineContext = null`.

`sourceTitle` и `nextStep` — исторические presentation-safe snapshots. UI не разыменовывает и не
показывает raw ids. Фактическое состояние Routine при возврате всё равно перечитывается из
авторитетных repositories.

### Инварианты и обратная совместимость

- Routine context допустим только у Walk с return origin `routine` и routine linked entity.
- Все id и `DayDate` копируются защитно; `sourceTitle` нормализуется и не может быть пустым.
- Routine context не меняется после создания Walk.
- Outcome/Reentry resolution не изменяют source/next references.
- Старые Walk без новых полей rehydrate-ятся с `routineContext = null`.
- `WalkRecord.schemaVersion` остаётся `1`: поля optional и не требуют migration/store/index.

## Подготовка запуска

RoutinePage не создаёт aggregate при нажатии на карточку. Она передаёт в ApplicationShell
presentation request с идентичностью выбранного `EffectiveRoutineOccurrence` и открывает Walks.
Request не является предметным состоянием и может исчезнуть при reload до фактического старта.

WalksPage применяет приоритеты:

1. active/paused Walk;
2. pending Reentry;
3. routine launch request;
4. обычный Walk Center.

Если pending Reentry существует, request сохраняется в текущем UI-сеансе и открывает подготовку
после явного complete/close Reentry. Незавершённое возвращение не теряется из-за нового запуска.

Подготовка переиспользует существующий intent/preparation flow. Для routine request она добавляет
компактный read-only блок источника и точки возврата; пользователь по-прежнему сам выбирает intent,
длительность и допустимые поля режима.

## `StartRoutineWalk`

Новый application-сервис принимает точную reference выбранного occurrence и обычный draft
подготовки Walk. Перед созданием он:

1. повторно разрешает effective occurrence через существующие Routine block/override contracts;
2. проверяет current/open day, отсутствие skip и assignment `walk`;
3. вычисляет первый следующий нескрытый occurrence той же effective date и сохраняет его reference
   и title snapshot;
4. проверяет active Walk и running Routine;
5. одним значением `clock.now()` создаёт `RoutineOccurrenceExecution.start(...)`, затем
   `Walk.create(...).start(...)` с routine return context;
6. передаёт оба aggregates и ожидаемое состояние плана в `RoutineWalkUnitOfWork.start(...)`.

Транзакция повторно проверяет:

- version source `RoutineBlock`;
- ожидаемое наличие/отсутствие и version override;
- что effective occurrence всё ещё имеет assignment `walk` и не skipped;
- отсутствие другой active Walk;
- отсутствие другого running Routine occurrence;
- отсутствие terminal execution для выбранного occurrence.

Если тот же occurrence уже running, но active Walk отсутствует, execution переиспользуется и
транзакция добавляет только новый active Walk. Это поддерживает существующие данные и ручной старт
блока до обновления приложения. Если active Walk уже связан с тем же source occurrence, сервис
идемпотентно возвращает его. Любой другой active/running объект даёт предметную ошибку без записи.

В IndexedDB записывается сразу active Walk; промежуточный planned Walk не сохраняется. Доменный
`Walk.create().start()` остаётся источником всех Walk-инвариантов.

## Завершение и прерывание

Обычные Walk продолжают использовать существующий repository path. `CompleteWalk` и
`AbandonWalk` проверяют `walk.returnContext.routineContext`:

- если контекст отсутствует, поведение полностью прежнее;
- если контекст есть, application загружает точный execution, выполняет оба доменных перехода и
  вызывает `RoutineWalkUnitOfWork.finish(...)`.

### Normal complete

```text
Walk running/paused → completed
RoutineOccurrenceExecution running → completed
```

Оба перехода получают один `clock.now()`. Walk сохраняет свои pause intervals и elapsed duration;
Routine execution сохраняет собственный actual start и получает тот же actual end.

### Abandon

```text
Walk running/paused → abandoned
RoutineOccurrenceExecution running → abandoned
```

Abandon не создаёт Outcome или Reentry. Таким образом, source occurrence не остаётся скрыто
running после сознательного отказа от прогулки.

### Idempotency и terminal conflicts

- Если execution уже находится в том же ожидаемом terminal state, Walk разрешается сохранить без
  повторной мутации execution.
- Если execution находится в противоположном terminal state, команда возвращает
  `routine_walk.terminal_conflict` и не пишет ни один store.
- Missing execution, несовпадающие block/date references или version conflict дают локальную
  предметную ошибку без автоматического retry.
- Неизвестная ошибка IndexedDB отменяет всю транзакцию и преобразуется в
  `persistence.transaction_failed` с безопасным пользовательским сообщением.

## Reentry и возврат в Routine

`WalkReentryPolicy` для обычного routine outcome выбирает `resumeContext`, переносит
`routineContext` в action и сохраняет `nextStep`. При `impact = worse` существующий recovery
priority остаётся выше Routine: action ведёт на Today, а исходный occurrence уже технически
завершён.

Для routine action Presentation формирует destination request:

- дата — `next.effectiveDate`, если next существует, иначе `source.effectiveDate`;
- section — `ROUTINE_SECTION.day`;
- focus target — точная `next` reference либо `null`.

Primary CTA сначала успешно выполняет `CompleteWalkReentry`, обновляет shell reminder и только
затем навигирует. ApplicationShell устанавливает selected date, section и routine hash route.
RoutinePage после загрузки ищет точное совпадение block id + occurrence date + effective date,
переводит карточку в keyboard focus и добавляет неброскую return-target подсветку. Если target
удалён, rescheduled повторно или больше не видим, страница фокусирует заголовок списка и показывает
обычный план дня без error state.

Закрытие Reentry без продолжения не открывает Routine и не меняет уже завершённый source
occurrence.

## UI-контракт

### RoutinePage

Для not-started occurrence с assignment `walk` раздельные «Начать блок» и «Открыть прогулки»
заменяются одной основной командой «Начать прогулку». Generic execution controls для non-walk
assignments не меняются.

Для occurrence, связанного с active Walk, карточка показывает статус «Прогулка идёт» и CTA
«Вернуться к прогулке». Generic «Завершить блок»/«Прервать» скрываются, чтобы обходной UI не
разорвал атомарный lifecycle. Orphan running occurrence без active Walk остаётся доступным в
существующей manual recovery panel.

### Walk preparation и active screen

- Источник показан компактно: title, planned/effective time, «После прогулки».
- Active panel показывает одну строку «Из распорядка: {sourceTitle}».
- Длинный ввод, новые обязательные поля или отдельный routine-specific wizard не добавляются.
- При stale source подготовка остаётся открытой с `role="alert"`, retry и возвратом в Routine.

### Reentry

Существующая панель показывает `nextStep` и primary label «Вернуться к распорядку». Raw ids,
автоматический старт следующего блока и скрытая внешняя запись отсутствуют.

Все изменённые controls имеют высоту не меньше 44 px. Проверяются desktop 1366×768, mobile
390×844 и 360×800, keyboard focus, reduced motion, horizontal overflow и перекрытие нижней
навигацией.

## Startup и восстановление

- Active Walk остаётся высшим startup priority и открывает Walks, как в WALK-07.
- Связанный running Routine execution не запускает отдельную навигацию и восстанавливается через
  существующий repository.
- Routine deep link, Evening startup и pending Reentry priorities не меняются.
- Reload после atomic complete/abandon не может вернуть running source occurrence.
- Переход через полночь сохраняет исходные occurrence/effective dates; завершение восстановленного
  вчерашнего running execution разрешается существующим recovery-контрактом.

## Ошибки и пользовательские состояния

- `routine_walk.source_changed` — source plan/override изменился; перечитать Routine и повторить.
- `routine_walk.source_not_startable` — occurrence skipped, terminal или больше не assignment walk.
- `routine_walk.another_routine_running` — сначала разрешить текущий блок.
- `walk.running_exists` — вернуть пользователя к существующей Walk.
- `routine_walk.version_conflict` — данные изменились в другой вкладке; без скрытого retry.
- `routine_walk.terminal_conflict` — Walk и execution получили противоположные terminal intents;
  данные не изменены.
- `persistence.transaction_failed` — транзакция отменена полностью; разрешён явный retry.

Double submit блокируется существующими presentation guards и повторной транзакционной проверкой.
Ошибка integration query или focus target не блокирует остальные разделы приложения.

## TDD и проверки

### Domain

- value object reference/context и runtime guards;
- routine-only origin/entity/date invariants;
- defensive copying;
- legacy missing fields → `null`;
- сохранение context через start/pause/resume/complete/abandon/outcome/reentry.

### Application

- `StartRoutineWalk`: normal start, existing same execution, same active Walk, duplicate Walk,
  another running Routine, skipped/stale/rescheduled source;
- атомарные complete и abandon;
- same-terminal idempotency и opposite-terminal conflict;
- next occurrence selection и отсутствие next;
- обычные `CompleteWalk`/`AbandonWalk` не используют Routine UoW.

### Persistence

- одна IndexedDB transaction над существующими stores;
- rollback обеих записей при каждом validation/write failure;
- optimistic versions source Walk/execution/block/override;
- reopen active/completed/abandoned;
- legacy Walk mapper compatibility;
- schema/store/index list без изменений.

### Composition и regression

- Routine → preparation → active Walk → complete → Outcome → Reentry → next Routine occurrence;
- abandon path;
- rescheduled occurrence;
- reload active и переход через полночь;
- snapshots соседних Routine blocks/overrides и обычных Walk;
- unchanged non-walk Routine execution, Routine deep links, Today, Decision и WALK-07 reminder.

### Presentation и browser QA

- Routine CTA/disabled/error/restored states;
- source context в preparation/active screen;
- Reentry navigation только после persistence;
- focus/fallback behavior;
- Playwright desktop/mobile full flow, abandon, reload, console/page errors, overflow и touch targets.

Финальный gate: целевые domain/application/persistence/composition/presentation tests,
`npm run typecheck`, `npm run lint`, полный `npm run test`, `npm run test:alpha`, применимый
Playwright gate, `npm run build`, `npm run format:check`, `git diff --check`, diff review и точный
`git status --short`.

## Явные non-goals WALK-08

- WALK-09 Decision integration и изменения статуса Decision;
- WALK-10 Capture/Inbox, создание действий или заметок;
- автоматический запуск следующего Routine block;
- изменение Goal, Project, LifeAction, Today, Habit или Journal;
- отдельный RoutineWalk aggregate/repository/store/engine;
- новый router или persistence migration;
- notifications, GPS, маршруты, голос, фото, погода, рекомендации и аналитика;
- redesign Routine или Walks за пределами интеграционных состояний.
