# WALK-07 — сохраняемое «Возвращение» после прогулки

## Контекст и цель

WALK-04 уже реализовал короткое завершение прогулки, сохранение `afterState`, влияния
`better/same/worse`, необязательного текста результата и первый presentation-only экран «Что
дальше?». Поэтому предусмотренный исходным планом WALK-06 `WalkOutcome` считается выполненным в
составе принятого WALK-04 и не реализуется повторно.

Цель WALK-07 — сделать существующее «Возвращение» надёжным предметным продолжением завершённой
прогулки: один раз определить одно следующее действие, сохранить его вместе с прогулкой,
восстановить после reload и явно завершить либо закрыть без продолжения.

WALK-07 не должен блокировать остальные сценарии LifeOS и не выполняет скрытых изменений Routine,
Decision, Goal, Project, LifeAction или Today.

## Выбранная архитектура

`Walk` остаётся единственным aggregate прогулочной сессии. Reentry хранится как nullable value
state внутри существующего `Walk` и сохраняется через тот же `WalkRepository`.

Направление зависимостей сохраняется:

`UI → Presentation → Application → Domain`

Application использует чистую policy для выбора действия, Domain проверяет lifecycle и хранит
результат выбора, Infrastructure расширяет только существующие record/mapper/repository, а App
связывает запросы и команды. Новый aggregate, object store, repository, session engine или
localStorage-источник состояния не создаётся.

Отклонены альтернативы:

1. Отдельный `WalkReentry` aggregate и repository — создают второй persistence lifecycle без
   необходимости WALK-07.
2. React/localStorage-флаг — теряется предметная целостность и появляется второй источник истины.

## Доменная модель Reentry

В `Walk` добавляется nullable `reentry` со следующими данными:

- `status`: `pending | completed | closedWithoutContinuation`;
- `action`: рассчитанное стабильное действие;
- `preparedAt`: момент подготовки возвращения;
- `resolvedAt`: `null` для pending и timestamp для двух терминальных состояний.

Типы действия:

- `recovery` — сначала коротко восстановиться;
- `reviewResult` — вручную обработать полученный результат в связанном контексте;
- `resumeContext` — продолжить исходный процесс из `returnContext`;
- `today` — безопасно вернуться на экран «Сегодня».

Действие хранит предметные идентификаторы, а не UI-текст: `kind`, destination на основе
`WalkReturnOrigin`, optional связанную сущность и optional `nextStep`. Presentation отвечает за
русские подписи и существующее сопоставление origin с разделом приложения.

Инварианты:

1. Reentry допустим только для `completed` Walk с уже сохранённым outcome.
2. Новый outcome создаёт Reentry сразу в состоянии `pending`.
3. `pending` имеет `resolvedAt = null`; терминальные состояния обязаны иметь `resolvedAt`.
4. Pending Reentry разрешается ровно один раз в `completed` либо
   `closedWithoutContinuation`.
5. Разрешение Reentry не меняет `endedAt`, outcome, интервалы пауз или elapsed duration.
6. Фактическое изменение увеличивает `version` и обновляет `updatedAt`.
7. Старые Walk без поля `reentry` rehydrate-ятся с `null` и не становятся pending автоматически.

## Политика одного следующего действия

Application policy рассчитывает действие один раз при сохранении outcome. Приоритеты:

1. `impact = worse` → `recovery`, destination `today`.
2. Есть непустой результат и связанный Decision, Goal или Project → `reviewResult` с безопасным
   возвратом в соответствующий раздел.
3. Есть `returnContext` → `resumeContext` с его origin, entity и `nextStep`.
4. Контекста нет → `today`.

Произвольный текст результата не анализируется, не классифицируется и не отправляется во внешние
сервисы. `reviewResult` выбирается только по наличию текста и явной связи с поддерживаемым
контекстом. Policy не загружает и не изменяет внешний aggregate.

Если связанная сущность позднее удалена или недоступна, WALK-07 не разыменовывает её id и не
показывает id пользователю. Навигация остаётся безопасной: открыть соответствующий раздел, а при
невозможности — «Сегодня».

## Запись outcome и Reentry

Существующий `CompleteWalk` остаётся единственным переходом active Walk в `completed` и источником
`endedAt`.

`RecordWalkOutcome`:

1. загружает completed Walk;
2. передаёт его и outcome в чистую policy;
3. вызывает доменный переход, который одновременно записывает outcome и `reentry_pending`;
4. выполняет один `updateIfVersionMatches`.

Таким образом, состояния «outcome сохранён, но Reentry потерян» не возникает. При version conflict
команда возвращает стандартную ошибку без скрытого retry.

Существующие completed Walk, у которых outcome был сохранён до WALK-07, сохраняют `reentry = null`.
Это намеренная обратная совместимость: обновление приложения не должно создавать ложные напоминания
для всей старой истории.

## Application API

### `GetPendingWalkReentry`

Запрос использует существующий `WalkRepository.findAll()`, выбирает самый новый Walk с Reentry по
`preparedAt` и возвращает его только если статус этого самого нового Reentry равен `pending`.
Разрешённый более новый Reentry не позволяет старому pending внезапно появиться снова. Отдельная
очередь возвращений и новый индекс IndexedDB в WALK-07 не создаются.

### `CompleteWalkReentry`

Команда загружает Walk, переводит pending Reentry в `completed`, ставит `resolvedAt/updatedAt` по
application `Clock` и сохраняет через optimistic version check. Presentation выполняет навигацию
только после успешного результата команды.

### `CloseWalkReentry`

Команда тем же способом переводит pending Reentry в `closedWithoutContinuation`. Она не выполняет
навигацию и не меняет соседние сущности.

Обе команды возвращают стандартные ошибки `not_found`, `reentry_not_pending` и
`version_conflict`; неизвестные ошибки пробрасываются по существующему контракту.

## Persistence и обратная совместимость

`WalkRecord` получает optional nullable объект `reentry`. Текущая schema version сохраняется,
поскольку поле optional и не требует нового store или индекса.

Mapper:

- записывает полную Reentry-модель;
- читает отсутствие поля как `null`;
- проверяет известные status/action kind/origin;
- проверяет timestamps и комбинацию `status/resolvedAt` через Domain;
- отклоняет повреждённые или неизвестные значения;
- не меняет существующие outcome, session timestamps и reflection data.

IndexedDB и InMemory adapters продолжают реализовывать один `WalkRepository`.

## Startup и восстановление

Pending Reentry не меняет активный раздел автоматически. Существующие приоритеты startup остаются:

1. active/paused Walk восстанавливается и открывает Walks;
2. Routine deep link сохраняется;
3. Evening startup сохраняется;
4. обычный idle startup сохраняется.

Application Shell независимо загружает `GetPendingWalkReentry` и хранит состояние неблокирующего
уведомления. Ошибка этого запроса не переводит всё приложение в storage-error.

Если pending найден и сейчас нет active Walk, shell показывает компактное уведомление «Завершить
возвращение». CTA только открывает раздел Walks. `WalksPage` сам выполняет application query и
показывает восстановленный Reentry screen, не получая предметное состояние через React-дубликат.

Если одновременно существует active Walk и более старый pending Reentry, active Walk имеет
визуальный приоритет; напоминание не перекрывает активную сессию.

## Reentry UI

Существующий `WalkReentryPanel` переиспользуется и становится persistence-aware. Он показывает:

- подтверждение завершённой прогулки;
- компактный результат/изменение состояния, если доступно;
- причину предлагаемого действия;
- optional `nextStep`;
- одну основную CTA;
- вторичную команду «Закрыть без продолжения».

После outcome экран появляется сразу. После reload тот же экран восстанавливается из
`GetPendingWalkReentry`.

Основная CTA сначала вызывает `CompleteWalkReentry` и только затем переходит в рассчитанный раздел.
Для destination `walks` пользователь возвращается в Walk Center. Вторичная команда вызывает
`CloseWalkReentry` и возвращает в Walk Center без внешнего действия. Пользователь может уйти через
обычную навигацию, оставив Reentry pending для неблокирующего напоминания.

Визуальный язык сохраняет принятый LifeOS baseline: графитовая основа, зелёный для подтверждённого
завершения, золото для основной CTA, красный только для ошибок. Никакого постоянного фиолетового
акцента.

Desktop проверяется при 1366×768, mobile — при 390×844 и 360×800. Touch targets не меньше 44 px,
нет horizontal overflow или перекрытия нижней навигацией, keyboard focus предсказуем, ошибки имеют
`role="alert"`, а статус восстановления — корректный `aria-live`.

## Ошибки и конкурентность

- Ошибка чтения pending Reentry показывает локальную повторную попытку и не блокирует другие
  разделы.
- Ошибка `CompleteWalkReentry` или `CloseWalkReentry` оставляет экран открытым и не выполняет
  навигацию.
- Двойная отправка блокируется существующим submission guard.
- Version conflict показывается пользователю без автоматического retry.
- Повторное разрешение терминального Reentry отклоняется доменным инвариантом.
- Missing/deleted external entity не приводит к внешней записи или broken deep link.

## TDD и проверки

RED → GREEN покрывает:

1. доменные Reentry value types, инварианты и переходы;
2. создание `pending` вместе с outcome одним изменением Walk;
3. приоритеты policy: worse, result+linked context, returnContext, Today fallback;
4. complete/close timestamps и запрет повторного разрешения;
5. optimistic conflict без скрытого retry;
6. mapper/repository round-trip pending/completed/closed;
7. чтение legacy Walk без Reentry как `null`;
8. reload `reentry_pending` и детерминированный выбор самого нового состояния;
9. startup notice без перехвата active Walk, Routine deep link или Evening;
10. восстановленный Reentry screen и навигацию только после успешного сохранения;
11. отсутствие записей в Routine, Decision, Goal, Project, LifeAction и Today;
12. desktop/mobile layout, keyboard focus, console errors и horizontal overflow.

Browser QA проходит сценарии:

1. завершить Walk и сохранить outcome;
2. увидеть рассчитанное действие;
3. reload на pending Reentry;
4. убедиться, что приложение не блокируется и показывает напоминание;
5. открыть восстановленный экран и выполнить основную CTA;
6. отдельно проверить `closedWithoutContinuation`;
7. повторить ключевой поток на desktop и mobile.

Финальный gate: целевые domain/application/persistence/presentation tests, Walk composition
integration, startup regression, применимый полный quality gate из `docs/codex/TEST_MATRIX.md`,
browser QA и `git diff --check`.

## Явные non-goals WALK-07

- второй Walk/Reentry aggregate, repository, store или engine;
- автоматическое изменение Routine, Decision, Goal, Project, LifeAction или Today;
- создание действия, заметки или решения из результата;
- глубокий переход к конкретному удалённому/существующему entity;
- очередь или history UI для нескольких Reentry;
- WalkCapture, Inbox, голос, фото, GPS, карты или погода;
- аналитика, recommendation engine или анализ текста;
- WALK-08 и последующие интеграции.
