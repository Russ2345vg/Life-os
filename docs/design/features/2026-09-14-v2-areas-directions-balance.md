# LifeOS V2 — сферы, направления и колесо состояния

Дата: 14 сентября 2026. Макет утверждён пользователем ответом «да»; продукт реализован.
Источник требований — приложенный пользователем запрос
«LIFEOS V2 — СФЕРЫ + НАПРАВЛЕНИЯ + КОЛЕСО БАЛАНСА», разделы 0–37.

## Scope и исходная точка

Активный worktree: `D:/LifeOS-App`. Ветка: `v2-current-baseline`.
HEAD: `6db7f339c888b033d96a8e97a41482c55efcb3b2`.

Последние V2 commits:

- `6db7f33` — move V2 planning into goals;
- `81feeab` — period planning goals and recurrence;
- `bbc41ee` — goal drag and drop to V2 kanban;
- `c998791` — kanban calendar and tree;
- `a4418fb` — inbox focus lists and filters;
- `24560fd` — make V2 primary planner.

Исходники продукта при старте чистые. Предсуществующие изменения в AGENTS, Design Rules,
документации, `.agents`, `.codex`, README и неотслеживаемые старые design/report files принадлежат
другим задачам. Они не входят в этот блок. Полный исходный status сохранён в task-owned
`C:/Users/Руслан/.codex/visualizations/2026/09/14/01a09d98-8782-77f2-a84f-8067a93bb73c/baseline-status.txt`.

Запрещены полный E2E/Playwright suite без отдельного разрешения, push, переписывание V2 planning,
quantitative progress, recurrence, Kanban, Calendar и Tree, удаление V1, новая криптография,
checkpoint и большой Analytics dashboard. Один commit после успешного финального verify:
`feat: add LifeOS V2 areas directions and balance wheel`.

## Дизайн-контракт

```text
FEATURE: новый обзор Сферы V2, детализация сферы/направления, компонент колеса
→ USER GOAL: понять состояние частей жизни и осознанно распределить внимание
→ EXISTING LOGIC: Sphere, Direction, Goal, LifeAction, GoalMeasurement,
  createGoalProgressReader, PlanningPeriod, PeriodMembership, PeriodDecision, JournalEntry
→ PAGE/COMPONENT ARCHETYPE: аналитический обзор; рабочая карточка с детализацией
→ SECTION COLOR: существующий --planner-accent (#48df65), чёрная база V2
→ MAIN VISUAL CENTER: колесо состояния; в карточке — effective state
→ COMPONENTS TO REUSE: PlannerV2Workspace shell, AppIcon, VoiceField,
  VoiceTextInput, VoiceTextArea, PlanningProgress, стили controls/forms/details V2
→ MOBILE BEHAVIOR: одна колонка, вертикальные indicators, 44 px touch targets,
  короткие номера осей с полными названиями в списке, без горизонтального скролла
→ APPROVED REFERENCE: YES — интерактивный макет утверждён пользователем
→ TEST SCOPE: targeted domain/application/persistence/sync/UI;
  ручной browser QA desktop/390/360/320; один финальный npm run verify; без E2E
```

Design Rules v1.2 прочитаны полностью. Прямое указание пользователя о чёрно-зелёном V2 имеет
приоритет над общей природной сценой и тёплым акцентом. Атмосферный мотив — спокойная чёрная
рабочая поверхность, без иллюстраций, радуги и постоянного glow.

Новая композиция колеса требует visual approval по AGENTS.md, New Feature Design Gate, пп. 5 и 8.
Общие ранее утверждённые V2 catalog/planning references задают стиль; колесо они не утверждали.
Утверждённый макет показан в задаче; локальный интерактивный артефакт:
`C:/Users/Руслан/.codex/visualizations/2026/09/14/01a09d98-8782-77f2-a84f-8067a93bb73c/balance-approved-reference.html`.
Временный HTML preview исключён из продуктового коммита по требованию пользователя.
Это интерактивная композиция на вымышленных данных, без чтения/сохранения пользовательских записей.
Он показывает overview, Sphere detail, Direction detail, выбор участников, ручную оценку,
редактирование rating и lifecycle/mode. Счётчики progress в макете демонстрационные.

## Фактическая архитектура

| Область             | Текущая реализация                                                                                              | Решение                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Сфера               | `src/domain/sphere/Sphere.ts`, `SphereStatus.ts`                                                                | Расширить существующий aggregate, без SphereV2                              |
| Направление         | `src/domain/direction/Direction.ts`, `DirectionStatus.ts`                                                       | Сохранить `desiredState`, добавить текущее состояние и score settings       |
| Цель                | `src/domain/goal/Goal.ts`                                                                                       | `sphereId`, fallback через `directionId`, optional measurement              |
| Quantitative        | `src/domain/planner/GoalMeasurement.ts`, `src/application/planner/GoalContributions.ts`                         | Использовать `createGoalProgressReader` и его nullable percent              |
| Периоды             | `src/domain/planner/PlanningPeriod.ts`, `src/application/planner/PeriodPlanning.ts`                             | Существующие year/quarter/thirty_days/week и memberships                    |
| Транзакции planning | `src/application/ports/PlanningRepository.ts`, `src/infrastructure/persistence/IndexedDbPlanningRepository.ts`  | Goals/actions/contributions/Journal уже коммитятся атомарно                 |
| Sphere storage      | `SphereRecord`, `SphereRecordMapper`, `IndexedDbSphereRepository`                                               | Safe defaults + optimistic version + atomic outbox                          |
| Direction storage   | `DirectionRecord`, `DirectionRecordMapper`, `IndexedDbDirectionRepository`                                      | Есть optional strategic fields; `updateManyIfVersionsMatch` для main        |
| Registry            | `src/application/sync/SyncRegistry.ts`, `src/infrastructure/sync/LifeOsSyncRegistry.ts`                         | Добавить типы indicators/monthly snapshots                                  |
| Sync serializers    | `src/application/sync/pilot/PilotSyncProtocol.ts`, `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts` | `normalizePilotRecord`, `serializePilotSyncPayload`, `PILOT_BINDINGS`       |
| Journal             | `src/domain/journal/JournalEntry.ts`, `IndexedDbJournalRepository`, `IndexedDbJournalUnitOfWork`                | Не дублировать Goal history; использовать `PeriodDecision.resultAtDecision` |
| Существующие UI     | `src/presentation/pages/SpheresPage.tsx`, `src/presentation/management/DirectionsSection.tsx`                   | Это старые экраны, V2 пока не имеет своих routes                            |
| V2 shell            | `src/presentation/planner-v2/PlannerV2Workspace.tsx`, `PlannerV2Navigation.ts`                                  | Добавить Сферы и detail routes, сохранять остальные views                   |

Авторитет состояния — persistent domain records и application-команды. Presentation получает
read model, не меняет предметные данные напрямую. Автоматические scores существуют только в
projection и зафиксированной monthly history, не как редактируемый live field.

## Модель

### Sphere

Добавить `desiredLevel: number | null`, `manualScore: number | null`, `importance`,
`includeInBalanceWheel: boolean`; сохранить текущие name/description/icon/color/status и
createdAt/updatedAt/version. Старые значения default: null/null/normal/false.
Opt-in колеса безопасен для технических и временных сфер: пользователь явно выбирает участников.
Новые сферы получают ту же настройку с возможностью включения при создании.
Archive сохраняет историю; архивная сфера не отображается как текущая участница колеса.

### Direction

Желаемое состояние — уже существующее `desiredState`; не вводить параллельный `desiredStateText`.
Добавить `currentStateText: string | null`, `mode: develop | maintain`, `importance`,
`manualScore: number | null`; lifecycle расширить до active/paused/archived.
Старые defaults: null/develop/normal/null. Сохранить strategicIntent/inScope/outOfScope/isMain.
Тексты optional, нормализация как у существующих strategic fields, лимит 4000 символов.
Pause/archive не удаляют Goal/Action. Неактивное направление не может быть main; mode при
pause/archive сохраняется и виден после возобновления. Maintain без Goal валиден.

### Важность

Единый новый `BalanceImportance` для Sphere/Direction/Indicator: low=1, normal=2, high=3,
critical=4. Existing DecisionPriority/ActionPriority описывают приоритет выполнения и имеют
три значения; Goal.intentionLevel — want/plan/commit. Они не являются важностью состояния жизни.
Не менять их semantics, не использовать Goal intentionLevel как неявный вес. Goal progress
сферы рассчитывать с равными весами.

### DirectionIndicator

Отдельный record с id/directionId/name/type/importance/sourceType/sourceGoalId/value/target,
createdAt/updatedAt/version/schemaVersion. Discriminated unions исключают несовместимые значения.

- rating: optional finite number 0..10;
- boolean: boolean или null;
- numeric: finite number или null; target atLeast/atMost/range с finite thresholds;
- source manual или quantitativeGoal; только совместимая existing Goal с measurement.

Лимит 5 проверяется атомарно для направления в application/repository, а не только UI.
Используются пять детерминированных ID `indicator:<encodedDirectionId>:0..4`. Одновременное
создание на одном слоте разрешается существующим sync conflict mechanism; проигравшая версия
сохраняется штатным конфликтом. Replay не создаёт шестую запись. Удаление linked Goal сохраняет indicator
и выдаёт `source unavailable`. Существующий источник без percent выдаёт «Нет данных».
Sync relationship `sourceGoalId` имеет `required: false`: существующий helper `optional()`
означает nullable поле, но оставляет required relationship и для этого случая не подходит.

## Точные расчёты

`C(x) = min(10, max(0, x))`. Все числа проверяются на finite до деления.

| Indicator       | Score                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Missing         | null; исключён из знаменателя                                                                                 |
| rating          | C(value)                                                                                                      |
| boolean         | true → 10; false → 0                                                                                          |
| linked Goal     | C(existingProjection.percent / 10); null percent → null                                                       |
| numeric atLeast | target > 0: C(current / target × 10)                                                                          |
| numeric atMost  | current ≤ target: 10; иначе при current > 0: C(target / current × 10)                                         |
| numeric range   | min ≤ current ≤ max: 10; ниже при min > 0: C(current / min × 10); выше при current > 0: C(max / current × 10) |

Для нового numeric indicator thresholds неотрицательные, atLeast target строго положительный,
range min ≤ max; недопустимая ratio-domain конфигурация отклоняется с понятной ошибкой, а не NaN.
Ноль atMost/range допустим; ветка current=0 не делит на ноль. Rating domain не принимает
некорректный пользовательский ввод, а scoring clamp дополнительно защищает projection.

Direction auto = Σ(score × importanceWeight) / Σ(importanceWeight) по доступным indicators.
Пустая сумма → null. Direction effective = manualScore ?? automaticScore.
Sphere auto = та же взвешенная формула по effective scores только active Directions.
Maintain включается; paused/archived и null scores исключаются. Sphere effective = manual ?? auto.
Округлять только представление до одного десятичного знака; расчёт не округлять каскадно.
Ручная оценка никогда не уничтожает auto, оба значения показываются отдельно.

`gap = max(0, desiredLevel - effectiveScore)`.
`attentionNeed = gap × Sphere importanceWeight`.
Если desired/current отсутствует: оба результата null, не ноль.

## Состояние, progress и рекомендации

State всегда относится к текущей жизни и не зависит от выбранного периода.
Связанный recurring quantitative Indicator использует текущий measurement cycle, а не period
selector колеса. Смена периода не должна изменять scores или создавать snapshots.

Progress использует только существующие non-removed Goal memberships выбранного периода.
Связь Sphere: явный Goal.sphereId; при его отсутствии — Direction.sphereId, как в существующем
`plannerViewsModel`. Не назначать бесхозную цель случайной сфере.
Qualitative: achieved=100%, иначе 0%. Quantitative: существующий reader на дате текущего/закрытого
периода; замороженный `PeriodDecision.resultAtDecision`, если он имеется, имеет приоритет для
исторического решения. Null quantitative percent исключается с признаком неполных данных,
а не превращается в ноль. Нет доступных целей → null. Равные веса.

Периоды year/quarter/week вычисляются через automaticPeriod без побочной записи.
Default — текущий квартал. Thirty_days выбирает существующий активный цикл; если цикла нет,
показывает пустое состояние с переходом в Plans, не запускает цикл автоматически.
Next 7 days отсутствует.

Рекомендации: 5 slots/year, 4/quarter, 4/thirty_days, 4/week. Только включённые активные Sphere
с положительным известным attentionNeed. Quota = slots × need / totalNeed; сначала floor,
оставшиеся slots распределить по убыванию дробного остатка, ties — по стабильному entity ID.
Не использовать локализованное имя как tie breaker. Sum ≤ slots; при sumNeed=0 slots не выдаются.
Неизвестная need → unavailable, известная нулевая → 0. Рекомендация read-only, без ограничения
фокуса, создания целей и изменения period membership.

Переходы в Goals/Plans получают фильтр Sphere. Создание целей и изменение membership остаются
явными действиями пользователя в существующих экранах планирования.

## Monthly snapshots и sync gate

Отдельный record `BalanceMonthlySnapshot` с детерминированным ID:
`monthly:<entityType>:<encodedEntityId>:YYYY-MM`.
Поля: entityType=sphere/direction, entityId, month, automaticScore/manualScore/effectiveScore;
для Sphere — desiredLevel/attentionNeed; version/schemaVersion/updatedAt по существующему pattern.
Числа снимка фиксируются, null сохраняется. Goal progress не копируется в этот record.

Месяц брать из CurrentDateProvider/DayDate, timestamps — из Clock. При изменении источника
обновлять текущие affected Direction/Sphere snapshots атомарно с command. Синхронизация и
смена domain date/measurement cycle также должны актуализировать текущий snapshot. Дату
проверять при запуске и возобновлении приложения: weekly recurring score может измениться
в понедельник без команды и без смены месяца. Не создавать историю
задним числом, не переписывать прошлый месяц текущим расчётом, не писать при одинаковом результате.
Два устройства и reload используют один ID. Automatic и manual хранятся раздельно.

**Решение пользователя:** поздний remote snapshot закрытого месяца синхронизируется по обычным
правилам конфликтов LifeOS. Запрет относится к локальному пересчёту прошлого. Если дата устройства
откатилась, наличие более нового месяца защищает прошлый снимок. После remote apply текущий
месяц приводится к фактическим источникам в той же транзакции без sync echo. Recovery также
обновляет текущие snapshots атомарно и регистрирует восстановленные значения в outbox.

DB расширена с v24 до v25 двумя additive stores. Изменение DB version не означает
изменение crypto PROTOCOL_VERSION. Обязательные точки: LifeOsIndexedDb, application registry,
LifeOsSyncRegistry, PILOT_BINDINGS, StructuredSyncFixtures, bootstrap expansionReady,
IndexedDbSnapshotService.hasCompleteStoreManifest, recovery tests.

Sphere/Direction `mapped()` сейчас отбрасывает unknown fields. Нужен compatibility bridge:
отсутствие новых полей в legacy payload сохраняет имеющиеся значения, explicit null очищает;
старые records получают defaults. Обычные репозитории также должны сохранять residual fields.
Старому исполняемому клиенту новые функции неизвестны — доказательства compatibility не должны
ложно обещать поддержку новых stores старой сборкой.

Crypto XChaCha20Poly1305/X25519/HKDF, secure storage, PROTOCOL_VERSION не меняются.
Доказанного protocol blocker аудит не обнаружил.

## UI и состояния

- Overview: колесо, спокойный desired contour, выбор четырёх periods, компактные Sphere rows.
  Row: name, effective/desired, attention gap, progress, recommended slots, active Direction count.
- Wheel settings: checkbox opt-in/out, архивные Sphere отдельно; не окрашивать каждую ось.
- Sphere: state/auto/manual, desired/importance, attention, period progress, Directions с
  mode/status/score/active Goals/next Action, переходы в Goals/Plans.
- Direction: Sphere, current/desired text, lifecycle/mode/importance, effective/auto/manual,
  0–5 indicators, active Goal, other active Goals, next Action, collapsed future/achieved Goals.
- Create/edit: обязательное существующее name; advanced fields свернуты. VoiceField и
  VoiceTextInput/Area для current/desired/indicator name; числа/select без voice.
- Indicator editor: только поля выбранного type/source, явный source unavailable, шестой —
  спокойное сообщение лимита. Очистка значения означает null.

Loading — текст ожидания без подстановки нулей; error — текст/retry; success — status feedback;
empty — next action. Покрыть 0/1/2/many wheel spheres, длинные названия, отключённые сферы,
нет Directions/Indicators/data/desired, manual only, missing source, maintain без Goal,
paused/archived. При missing score не рисовать точку в нуле и не соединять разрыв как измерение.
При 1–2 осях использовать отдельные радиальные отметки без вырожденного polygon.

Mobile: 390/360/320, одна колонка, читаемые полные имена в списке, numbered axes при недостатке
места, вертикальные editors, keyboard focus, semantic labels, контраст и reduced motion.
Чек-лист Design Rules №38 применяется с явно разрешённым пользователем V2 palette exception.

## Проверки подготовки — фактический результат

14 сентября 2026 выполнена команда:

```text
npm run test:target -- src/infrastructure/persistence/PlanningAggregates.test.ts src/infrastructure/persistence/PlanningRepository.test.ts src/infrastructure/persistence/PlanningCompatibility.test.ts src/infrastructure/persistence/IndexedDbSphereRepository.test.ts src/infrastructure/persistence/DirectionProjectPersistence.test.ts src/infrastructure/sync/pilot/StructuredSyncAdapters.test.ts src/infrastructure/sync/pilot/StructuredSyncApply.test.ts src/infrastructure/sync/pilot/PilotBootstrapService.test.ts src/application/sync/pilot/PilotSyncProtocol.test.ts src/infrastructure/sync/pilot/PilotSyncFoundation.integration.test.ts src/infrastructure/sync/IndexedDbSnapshotService.test.ts
```

**11 files / 80 tests passed; exit 0; 8.35 seconds wrapper elapsed.**
Это baseline текущих records/persistence/sync contracts, не тест новой функции.
Composed gate добавлен: `node scripts/test-sync-crypto.mjs`. Он ограничен по времени,
сериализует реальные V2 fixtures в TypeScript, вызывает существующий Rust crypto module,
проверяет шифрование/дешифрование и восстанавливает записи в TypeScript. Сначала прошёл baseline
на 30 records, затем 32 records с новыми полями Sphere/Direction, indicator и monthly snapshot.
Проверены metadata authentication и уникальность nonce. Новых зависимостей и правок crypto нет.

## Проверка реализованного продукта

Read-only architecture и final review завершены. Учтены замечания о транзакционном rollback,
обновлении snapshot при recovery/sync, clock skew, сохранении старых полей Sphere и выборе
paused Direction в существующей форме Goal.
Общий gate выявил зависимость semantic sync comparison от порядка JSON-ключей после
preserveUnknown. Сравнение переиспользует существующую canonical sort без изменения wire format;
регрессии подтверждают равенство вложенных объектов и значимость порядка массивов. Ожидания
схемы/реестра обновлены на два новых типа. Focus regression проверяет роли и количество без
случайного порядка UUID. Дополнительный targeted прогон: 9 files / 81 tests, exit 0.

Ручная браузерная QA выполнена на отдельном origin 127.0.0.1:5190 на вымышленных данных.
Рабочие пользовательские записи не менялись. Desktop 1280×900: обзор → «Здоровье» →
«Сон и восстановление» / «Тело» / «Питание», создание/редактирование показателя, сохранение,
reload, ручная оценка, настройки колеса, выбор периода, переходы в Goals/Plans с фильтром.

Наблюдаемые значения: indicator=4 → auto Direction=4; manual Direction=7.5 сохраняет auto=4.
Три active Direction с effective 7.5, 6, 8 дают auto Sphere=7.1667 (UI 7.2).
Manual Sphere=7.5, desired=8, importance=3 дают attention=1.5; auto=7.2 остаётся видимым.
Переключение Year/Quarter меняет рекомендацию 5/4, состояние остаётся 7.5.
Maintain без Goal сохраняется и нормально отображается. Отсутствие score показано как «Нет данных».

Проверка Design Rules №38, с разрешённым V2 palette exception:

- Композиция сверена с утверждённым макетом: колесо — главный центр, компактные строки,
  чёрная база, белый/серый текст, один зелёный акцент, без новых зависимостей.
- Desktop и mobile 390/360/320: одна колонка, вертикальные формы, читаемые подписи,
  пять пунктов нижней навигации; DOM scrollWidth не превышает viewport.
- Semantic labels, 44 px controls и видимый keyboard focus; голосовые кнопки переиспользованы.
- Empty/loading/error/source unavailable/manual-only/lifecycle состояния покрыты render tests;
  колесо 0/1/6 проверено в браузере, 2 — targeted render tests; длинные подписи переносятся CSS.
- После перезапуска dev server итоговая проверка console не обнаружила error/warn.
  В ходе разработки был transient HMR import error при массовом форматировании; после reload
  состояния из IndexedDB сохранены. Это не выдаётся за ошибку продуктового сценария.
- Временный server остановлен, порт 5190 освобождён, viewport override снят.

Полный Playwright/E2E не запускается по прямому запрету пользователя. Android native,
микрофон/разрешения голосового ввода и реальный обмен двух физических устройств остаются ручной QA.
Старые v23/v24 backups и legacy fields покрыты тестами нового клиента; поддержка новых stores
старым установленным бинарником не обещается. Goal progress использует равные веса.

## Итоговый gate

14 сентября 2026: `npm run verify` завершён с exit 0. Unit/integration: 417 files / 3491 tests;
infra: 6 files / 55 tests; alpha: 1 file / 1 test. Typecheck, lint, production build,
Prettier и `git diff --check` прошли. Остались 15 прежних Fast Refresh warnings и предупреждение
размера общего bundle. Успешный полный gate после этого не повторялся.

Целевые прогоны: 18 files / 129 tests; после исправления общего sync-сравнения — 9 files / 81 tests.
Отдельный composed native crypto round-trip: 32 records, exit 0.
Во время разработки также выполнен `test:fast` (159 files / 1693 tests); это был дополнительный
прогон сверх запрошенных targeted tests. Полный Playwright/E2E не запускался.
