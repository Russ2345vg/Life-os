# Автопилот дня по предпочтениям — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подбирать открытые дела по сохранённому фокусу и пожеланиям на день, учитывая распорядок, прогулку, отдых и сон, с редактируемым preview и атомарным применением.

**Architecture:** Domain выбирает кандидатов и рассчитывает окна. Application загружает существующие связи и ограничения, создаёт общую проекцию для автопилота/календаря и одну команду применения; Infrastructure проверяет источники внутри транзакции. React отображает форму и результат, без собственной логики подбора и прямого IndexedDB.

**Tech Stack:** Существующие TypeScript, React 19, IndexedDB, Vitest/fake-indexeddb, Playwright и Tauri. Новых библиотек нет.

**Spec:** [Утверждённая спецификация](../../design/features/2026-10-10-preference-day-autopilot.md). Статус этого плана: подготовлен для проверки; реализация ещё не начата.

## Global Constraints

- Работать только в текущем LifeOS worktree, ветка `codex/batched-updates-20261010`; сохранять чужие изменения. Главный агент — единственный исполнитель изменений согласно [AGENTS.md](../../../AGENTS.md).
- Defaults: лимит **5** дел, допустимо **1–12**; утро **30 минут**, вечер **45 минут**, прогулка **30 минут**. Начало прогулки выбирает пользователь; включение явно видно.
- Pomodoro: действующие `focusMinutes`, `shortBreakMinutes`, `longBreakMinutes`; длинная пауза после **4** интервалов. Не делить действие автоматически.
- Запас **15%**, минимум **30 минут**, при подтверждённой ночи короче **7 часов** — **25%**; ограничить реальным остатком после обязательных блоков. Запас и отдых различаются.
- Неизвестная оценка **25 минут** остаётся предположением; записывать оценку только после явного редактирования пользователем.
- Читаем весь backlog через `findAll`; будущие даты не переносим. Повторения — только существующие экземпляры, один на серию: сегодняшний, иначе последний просроченный.
- Preferences/drafts — локальные `sync_settings`, отдельные ключи, `schemaVersion: 1` и CAS-версии. Не менять `MeaningfulUserSettingsRecord`, версию БД **33**, snapshot format или типы sync-объектов.
- Сохранять LifeAction и только отдельные прогулку/отдых как существующий RoutineBlock. Утро/вечер/сон вычисляются из реальной даты и настроек сна; `24:00` не записывать в RoutineBlock.
- Главный фокус автопилота не меняет `isNext`, месячный фокус, прогресс целей, сон, будильник или фактическое время концентрации.
- Локальное сопоставление текста с существующим каталогом и явное уточнение. Новый AI endpoint, медитация, native-сборки, push и публикация обновления вне задачи.
- UI: `#/v2/routine/day`, действующий Graphite/Jade и [approved reference](../../design/references/2026-09-25-premium/approved-direction.png); baseline → computed styles → comparison. Основные viewport **1440×900 / 390×844**, дополнительно **1600×900 / 1280×720 / 360×800** по UI_RULES.
- Targeted проверки каждого изменения, затем `test:fast`, один `verify` и scoped E2E двух сценариев. Повторять только затронутые этапы после влияющего исправления; полный E2E не запускать без нового основания по AGENTS.

## Review Focus

1. Фокус/связанная цель удалены или архивированы после preview: применению отказать целиком, не возвращать их и не подменять фокус.
2. Выполненная прогулка на второй странице истории или активная без известного окончания: не добавить дубликат; для активной потребовать окончание.
3. Несколько старых повторений, сегодняшний и будущий экземпляр одной серии, включая rule contribution-link: выбрать ровно один допустимый экземпляр.
4. Два сохранения черновика или переключение даты во время загрузки: старый ответ не перезаписывает новый текст и другую дату; конфликт версий видим.
5. Чужой часовой пояс, переход даты/DST и выключенный будильник: защищать реальные ночные интервалы, не включать будильник и не записывать недопустимое время.

---

## Файлы и границы ответственности

Все пути ниже относительно корня LifeOS; `Create` означает новый файл, `Modify` — существующий. Тест находится рядом с владельцем поведения.

| Задача | Файлы                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ответственность                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1      | Create `src/domain/planner/AutopilotPreferences.ts`, `src/application/ports/AutopilotSettingsStore.ts`, `src/application/planner/AutopilotSettingsService.ts`, `src/infrastructure/persistence/IndexedDbAutopilotSettingsStore.ts`                                                                                                                                                                                                                                   | Типы, валидация и версионное локальное хранение preferences/draft                        |
| 2      | Create `src/domain/planner/AutopilotSelection.ts`                                                                                                                                                                                                                                                                                                                                                                                                                    | Сопоставление пожеланий, связи и группы кандидатов                                       |
| 3      | Create `src/domain/planner/AutopilotSchedule.ts`, `src/application/planner/AutopilotConstraints.ts`; Modify `src/domain/planner/DayAutopilot.ts`                                                                                                                                                                                                                                                                                                                     | Интервалы распорядка, выбор по вместимости, отдых и резерв                               |
| 4      | Create `src/application/ports/RoutineBlockRepository.ts`, `src/infrastructure/persistence/IndexedDbRoutineBlockRepository.ts`, `src/application/planner/AutopilotGuard.ts`, `src/infrastructure/persistence/AutopilotTransactionGuard.ts`, `src/application/commands/prepareLifeActionPlan.ts`; Modify `src/application/ports/JournalUnitOfWork.ts`, `src/infrastructure/persistence/IndexedDbJournalUnitOfWork.ts`, `src/application/commands/SetLifeActionPlan.ts` | Чтение блоков, общая подготовка переноса, CAS/phantom guards и атомарные записи/удаления |
| 5      | Modify `src/application/planner/DayAutopilotService.ts`, `src/application/queries/GetTimeSchedule.ts`, `src/application/planner/PlannerServices.ts`, `src/app/composition/createLifeOsApplication.ts`, `src/app/composition/LifeOsApplication.ts`, `src/application/index.ts`, `src/domain/index.ts`                                                                                                                                                                 | Оркестрация, применение, общая проекция и dependency wiring                              |
| 6      | Create `src/presentation/planner-v2/AutopilotPreferencesForm.tsx`, `src/presentation/planner-v2/AutopilotPlanPreview.tsx`; Modify `src/presentation/planner-v2/DayAutopilotCard.tsx`, `src/presentation/planner-v2/RoutinePages.tsx`, `src/presentation/planner-v2/PlannerWorkspace.tsx`, `src/presentation/planner-v2/PlannerTimeCalendar.tsx`, `src/presentation/planner-v2/planner-premium.css`, `src/presentation/planner-v2/planner-time-calendar.css`          | Форма, редактируемая шкала, календарь и состояния                                        |
| 7      | Modify утверждённую спецификацию только для implementation evidence; Create `docs/codex/reports/2026-10-10-preference-day-autopilot.md`                                                                                                                                                                                                                                                                                                                              | Проверки, итоговый review и отчёт; без новой продуктовой логики                          |

## Task 1: Локальные предпочтения и дневные черновики

**Tests:** Create `src/domain/planner/AutopilotPreferences.test.ts`, `src/application/planner/AutopilotSettingsService.test.ts`, `src/infrastructure/persistence/IndexedDbAutopilotSettingsStore.test.ts`.

**Interfaces — produces:**

```ts
// AutopilotPreferences.ts; минуты — целые, start 0..1439, end 1..1440.
type AutopilotReference = { kind: 'direction' | 'goal' | 'action'; id: string };
type AutopilotFocus = { kind: 'direction' | 'goal'; id: string };
interface AutopilotPreferences {
  focus: AutopilotFocus | null;
  maxActions: number;
  morningMinutes: number;
  eveningMinutes: number;
  walk: { enabled: boolean; startMinute: number | null; minutes: number };
  manualWakeMinute: number | null;
  manualBedtimeMinute: number | null;
}
interface AutopilotDayDraft {
  date: string;
  wishes: string;
  startMinute: number | null;
  endMinute: number | null;
  wishReferences: readonly AutopilotReference[];
  excludedActionIds: readonly string[];
  durationOverrides: readonly { actionId: string; minutes: number }[];
  activeWalkEndMinute: number | null;
}
interface AutopilotStored<T> {
  schemaVersion: 1;
  version: number;
  value: T;
}
// AutopilotSettingsStore.ts; отсутствующая запись — null.
interface AutopilotSettingsStore {
  readPreferences(): Promise<AutopilotStored<AutopilotPreferences> | null>;
  readDraft(date: string): Promise<AutopilotStored<AutopilotDayDraft> | null>;
  writePreferences(
    value: AutopilotPreferences,
    expectedVersion: number | null,
  ): Promise<AutopilotStored<AutopilotPreferences>>;
  writeDraft(
    value: AutopilotDayDraft,
    expectedVersion: number | null,
  ): Promise<AutopilotStored<AutopilotDayDraft>>;
}
```

Service methods `getPreferences`, `getDraft`, `savePreferences`, `saveDraft` сохраняют те же параметры/результаты; getters возвращают `version: 0` с показанными defaults при отсутствии записи, saves переводят 0 в `expectedVersion: null`. Ключи: `day-autopilot-preferences:v1`, `day-autopilot-draft:v1:<YYYY-MM-DD>`. Длительности >0, не больше 1440; валидировать порядок явного диапазона, уникальные IDs и существующий DayDate. Повреждённую запись не перезаписывать молча: показать error восстановления и сохранить исходную запись для существующей диагностики/восстановления данных.

- [ ] Написать падающие тесты с assertions: `defaultsAreVisible` → maxActions 5, morning 30, evening 45, walk 30/start null; `rejectsInvalidValues` → лимиты 0/13 и дробные/отрицательные минуты отклонены; `survivesReopen` → текст, фокус, overrides одинаковы после нового adapter instance.

  ```ts
  const defaults = await service.getPreferences();
  expect(defaults.value).toMatchObject({ maxActions: 5, morningMinutes: 30, eveningMinutes: 45 });
  expect(defaults.value.walk).toMatchObject({ minutes: 30, startMinute: null });
  ```

- [ ] Добавить `staleDraftWriteDoesNotOverwrite` (Review Focus 4): два save от версии 1, второй отклонён, сохранена первая запись; черновики двух дат независимы. `corruptRecordIsNotSilentlyReplaced` → исходная запись сохранена, ошибка восстановления видима.
- [ ] Run `npm run test:target -- src/domain/planner/AutopilotPreferences.test.ts src/application/planner/AutopilotSettingsService.test.ts src/infrastructure/persistence/IndexedDbAutopilotSettingsStore.test.ts`; ожидается FAIL из-за отсутствующих exports.
- [ ] Реализовать указанные типы, store и service; использовать IndexedDB readwrite CAS, не localStorage и не синхронизируемый user-settings payload.
- [ ] Повторить эту targeted команду; ожидается PASS. Проверить сохранённые ключи и отсутствие новых sync mutation для preferences/draft.
- [ ] Commit только файлов Task 1: `feat: persist local day autopilot preferences`.

## Task 2: Каталог, пожелания и допустимые группы действий

**Tests:** Create `src/domain/planner/AutopilotSelection.test.ts`.

**Interfaces — consumes:** `AutopilotReference`, `AutopilotFocus`; существующие `LifeAction`, `Goal`, `Direction`, `ContributionLink`.

**Interfaces — produces** в `AutopilotSelection.ts`:

```ts
interface AutopilotCatalog { actions: readonly LifeAction[]; goals: readonly Goal[]; directions: readonly Direction[]; links: readonly ContributionLink[] }
interface AutopilotWishResolution {
  matches: readonly AutopilotReference[];
  unresolved: readonly { text: string; candidates: readonly AutopilotReference[] }[];
}
interface AutopilotCandidateGroups {
  main: readonly string[]; focus: readonly string[];
  wishes: readonly { reference: AutopilotReference; actionIds: readonly string[] }[];
  todayFallback: readonly string[];
  excluded: readonly { actionId: string; reason: 'future_date' | 'inactive' | 'duplicate_occurrence' }[];
}
resolveAutopilotWishes(text: string, catalog: AutopilotCatalog, explicit: readonly AutopilotReference[]): AutopilotWishResolution;
selectAutopilotCandidates(date: string, catalog: AutopilotCatalog, focus: AutopilotFocus | null, wishes: readonly AutopilotReference[]): AutopilotCandidateGroups;
```

Return groups, не обрезанный список до проверки вместимости. Явно разрешённые references соответствуют показанным пожеланиям; unresolved остаются blocking до выбора либо удаления соответствующего текста. Сохранённый неактивный фокус даёт ошибку выбора, не fallback. Сортировка внутри групп: high/normal/low → просроченная дата → createdAt → ID. Link действует при `!removed && effectiveFrom <= date`; rule-link применяется к occurrence.ruleId.

- [ ] Написать `focusAndWishSelectWholeBacklog`: недатированное инвестиционное дело и бытовое просроченное присутствуют в своих группах, постороннее отсутствует; прямое направление/goal.directionId/дополнительный link дают совпадения, removed/future-effective links не дают.

  ```ts
  expect(groups.focus).toContain('investment-undated');
  expect(groups.wishes[0]?.actionIds).toContain('household-overdue');
  expect(groups.focus).not.toContain('unrelated');
  ```

- [ ] Написать `oneOccurrencePerRule` (Review Focus 3): today выигрывает у двух overdue, иначе выбирается latest overdue, future исключён; rule-link сохраняет совпадение, ID в итоговом подборе один.
- [ ] Написать `ambiguousAndUnknownWishRequireChoice`: нормализация ё/е, регистра и пунктуации работает; одинаковые названия дают candidates с контекстом, неизвестная фраза остаётся unresolved; явный выбор снимает только своё уточнение. `largeCatalogKeepsLastMatchingAction` — совпадение на конце каталога из 10 000 синтетических действий не теряется.
- [ ] Run `npm run test:target -- src/domain/planner/AutopilotSelection.test.ts`; ожидается FAIL.
- [ ] Реализовать две функции; переиспользовать текущие search matching helpers после проверки их контракта, индексировать связи Map/Set. Не присваивать отдельные дела на основании нераспознанного текста.
- [ ] Повторить targeted команду; ожидается PASS.
- [ ] Commit Task 2: `feat: select autopilot candidates by focus and wishes`.

## Task 3: Ограничения распорядка, рабочие окна и паузы

**Tests:** Modify `src/domain/planner/DayAutopilot.test.ts`; Create `src/domain/planner/AutopilotSchedule.test.ts`, `src/application/planner/AutopilotConstraints.test.ts`.

**Interfaces — consumes:** `AutopilotCandidateGroups`, `AutopilotPreferences`, `AutopilotDayDraft`, действующие `DayAutopilotActionInput`, `PomodoroSettings`, `RoutineBlock`, `SleepScheduleState`, `Walk`.

**Interfaces — produces:**

```ts
// AutopilotSchedule.ts — общая проекция, источник = technical ID, не title.
type AutopilotBlockKind = 'action' | 'morning' | 'evening' | 'sleep' | 'walk' | 'rest' | 'reserve' | 'manual';
interface AutopilotScheduleBlock {
  id: string; kind: AutopilotBlockKind; title: string;
  startMinute: number; endMinute: number; sourceId: string | null;
  actionId: string | null; protected: boolean;
}
// AutopilotConstraints.ts
interface AutopilotConstraintInput {
  date: string; now: Date; preferences: AutopilotPreferences; draft: AutopilotDayDraft;
  sleep: SleepScheduleState; routineBlocks: readonly RoutineBlock[];
  walks: readonly Walk[]; actions: readonly LifeAction[];
}
buildAutopilotConstraints(input: AutopilotConstraintInput): readonly AutopilotScheduleBlock[];
```

В `DayAutopilot.ts` заменить зависимость конца от capacity на обязательный `endMinute` в `DayAutopilotInput`; добавить `groups`, `maxActions`, `constraints`, `pomodoro`, `excludedActionIds`, `durationOverrides` с типами выше. `buildDayAutopilotPlan(input: DayAutopilotInput): DayAutopilotPlan` сохраняется. Extend plan `timeline: readonly AutopilotScheduleBlock[]`; proposals сохраняют текущие поля, добавляют `previousDate: string|null`, `estimateSource: 'default'|'stored'|'user'`, `selectionReference: AutopilotReference|null`, reasons `main_action|focus|wish|day_order`. Reason/default estimate видимы, причины deferred/conflict — типизированные, без свободного parsing UI.

- [ ] Написать `fitsShorterFocusAfterLongCandidate`: main/fixed сохранены, длинное не помещается, короткое включено; сначала fitting focus, по одному fitting wish в порядке, затем focus до лимита 5; duplicate ID один; отсутствие focus/wishes оставляет today-only подбор.
- [ ] Написать `protectsRitualsAndReserve`: сон 23:00–07:00, утро до07:30, вечер22:15–23:00; работа заканчивается до22:15. Резерв 15% после обязательных блоков/min30, short-night25%, tiny remainder cap. Конфликт обязательных блоков не сокращает их; после конца дня нет работы.

  ```ts
  expect(plan.timeline.find((block) => block.kind === 'evening')).toMatchObject({
    startMinute: 1335,
    endMinute: 1380,
  });
  expect(plan.proposals.every((item) => item.startMinute + item.durationMinutes <= 1335)).toBe(
    true,
  );
  ```

- [ ] Написать `breaksFollowPomodoroWithoutSplitting`: при25/5/15 пять отдельных25-минутных действий дают5/5/5/15 между работой; длинное неделимое действие не разрезается; прогулка сбрасывает счётчик. Пауза только если после неё есть следующий рабочий блок, не добавлять trailing rest ради заполнения.
- [ ] Написать `projectsRealNightAcrossZones` (Review Focus 5): границы в Asia/Chita, Europe/Berlin на DST-дате, bedtime после полуночи, disabled alarm; интервалы реальной ночи клипуются до1440, settings неизменны. Для отсутствующего режима обязательны manualWake/Bedtime и явный диапазон; активная прогулка без target/end даёт объяснимую ошибку.
- [ ] Run `npm run test:target -- src/domain/planner/DayAutopilot.test.ts src/domain/planner/AutopilotSchedule.test.ts src/application/planner/AutopilotConstraints.test.ts`; ожидается FAIL на новых правилах.
- [ ] Реализовать ограничения через существующий `calculateNightWindow`/timezone helpers; `occursOn` для ручных блоков. Интервалы вычитать по объединению, чтобы перекрывающиеся фиксированные ограничения не уменьшали остаток дважды; конфликт показывать. Весь прогноз переносов/пауз рассчитывать чисто, без мутации entities.
- [ ] Реализовать fit-by-groups и rest/reserve; сохранять full-task duration, помечать внутренний Pomodoro длинного действия. Совпадающий RoutineBlock→action/план прогулки показывать один раз. Резерв — свободные промежутки, не записываемая сущность.
- [ ] Повторить targeted команду; ожидается PASS, включая прежние инварианты no-overlap/active-session с обновлённым явным endMinute.
- [ ] Commit Task 3: `feat: plan work around routines walks and rest`.

## Task 4: Одна транзакция для плана и защита от устаревшего preview

**Tests:** Modify `src/application/commands/SetLifeActionPlan.test.ts`, `src/infrastructure/persistence/DayAutopilotService.integration.test.ts`; Create `src/infrastructure/persistence/AutopilotTransactionGuard.test.ts`, `src/infrastructure/persistence/IndexedDbRoutineBlockRepository.test.ts`.

**Interfaces — consumes:** типы задач1–3 и существующий `JournalUnitOfWork.commit(input: CommitJournalStateInput): Promise<void>`.

**Interfaces — produces:**

```ts
// RoutineBlockRepository.ts — запись только через UOW.
interface RoutineBlockRepository { findAll(): Promise<readonly RoutineBlock[]> }
// AutopilotGuard.ts
interface AutopilotGuardSource {
  date: string; catalog: AutopilotCatalog; sessions: readonly ActionSession[];
  sleep: SleepScheduleState; sleepObservations: readonly SleepObservation[];
  routineBlocks: readonly RoutineBlock[]; walks: readonly Walk[];
  preferences: AutopilotStored<AutopilotPreferences>; draft: AutopilotStored<AutopilotDayDraft>;
}
interface AutopilotGuardSnapshot { date: string; sourceFingerprint: string }
buildAutopilotGuard(source: AutopilotGuardSource): AutopilotGuardSnapshot;
// Extend CommitJournalStateInput (всё optional, существующие callers без изменений):
// routineBlocks?: readonly { block: RoutineBlock; expectedVersion: number|null }[];
// deletedRoutineBlocks?: readonly { id: EntityId; expectedVersion: number }[];
// autopilotGuard?: AutopilotGuardSnapshot;
// AutopilotTransactionGuard.ts
validateAutopilotGuard(transaction: IDBTransaction, expected: AutopilotGuardSnapshot): Promise<void>;
// prepareLifeActionPlan.ts — без commit, с теми же правилами, что SetLifeActionPlan.
prepareLifeActionPlan(action: LifeAction, input: SetLifeActionPlanInput, clock: Clock, ids: IdGenerator): readonly JournalEntry[];
```

Fingerprint — стабильная сериализация семантических источников (ID/version/status/date/windows/активные связи и локальные настройки), не криптографическая подпись; сортировать ID. Сравнить в readwrite transaction повторно прочитанный каталог, сессии, sleepSchedules, относящиеся к recoverySignal sleepObservations, routineBlocks, walks и два ключа sync_settings. Сканирование нужных наборов выявляет добавленные manual/fixed/active записи, а не только изменения известных ID. Историю прогулок нормализовать одинаково при preview/transaction, без photo bytes. Pomodoro — проверенный snapshot рецепта preview, не перезаписываемая настройка; его дальнейшее изменение используется при следующем построении.

- [ ] Написать `backlogPlanIsAtomic`: date/window, recurrence.manualDate, ready reschedule journal и RoutineBlock upserts сохраняются вместе; искусственная ошибка последней записи откатывает всё, включая journal/outbox.

  ```ts
  await expect(unitOfWork.commit(batchWithInjectedWriteFailure)).rejects.toThrow();
  expect(await readActionBlockJournalAndOutboxState()).toEqual(before);
  ```

  `readActionBlockJournalAndOutboxState` — test-only helper в integration test: читает четыре набора в одной readonly transaction; `before` — состояние до batch.

- [ ] Написать `staleSourceRejectsWholeBatch`: отдельные сценарии action version/date, running/paused session, sleep version, preference/draft CAS, новый manual block/fixed action/active walk отклоняют batch без записей. `archivedFocusAfterPreviewRejectsBatch` покрывает Review Focus1.
- [ ] Написать `ownedBlocksRebuildWithoutDuplicates`: ID `day-autopilot:v1:<date>:<walk|rest>:<ordinal>`; delete/upsert только будущих owned blocks с expectedVersion; прошедший/ручной block неизменен. На повторный apply нет новых событий/мутаций; допустим stale reject. Удаление создаёт ровно одну sync tombstone, upsert ровно одну mutation при включённом sync capture.
- [ ] Run `npm run test:target -- src/application/commands/SetLifeActionPlan.test.ts src/infrastructure/persistence/AutopilotTransactionGuard.test.ts src/infrastructure/persistence/IndexedDbRoutineBlockRepository.test.ts src/infrastructure/persistence/DayAutopilotService.integration.test.ts`; ожидается FAIL.
- [ ] Извлечь только подготовку date/reschedule/manualDate/journal из `SetLifeActionPlan` в helper; команда сохраняет `clearPreviousMainActions` и свой commit. Автопилот сохраняет star только у существующего main дня и не назначает новый. Прежние date undo/status tests должны оставаться зелёными.
- [ ] Расширить `collectStores`/version validation для новых optional fields и guard; mapper существующий, no schema change. Использовать текущий mutation recorder/capture без двойной регистрации, abort при конфликте до любых финальных write.
- [ ] Повторить targeted команду; ожидается PASS. Проверить diff общего UOW на отсутствие изменения чужих flows.
- [ ] Commit Task 4: `feat: apply autopilot schedule atomically with source guards`.

## Task 5: Сервис, повторное чтение и календарная проекция

**Tests:** Modify `src/application/planner/DayAutopilotService.test.ts`, `src/application/queries/GetTimeSchedule.test.ts`, `src/app/composition/createLifeOsApplication.test.ts`, `src/infrastructure/sync/IndexedDbSnapshotService.test.ts`, `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`.

**Interfaces — consumes:** settings service, selection/constraints/plan и guard задач1–4; существующие actions/sessions, GoalRepository, DirectionRepository, `PlanningRepository.read()` для contribution links, sleep schedule/history, WalkRepository, PomodoroPreferences и RoutineBlockRepository.

**Interfaces — produces:**

```ts
// Extend существующие DayAutopilotPreviewInput/Preview, не второй preview type.
// Input: date: DayDate, mode: DayAutopilotMode; диапазон/edits из сохранённого draft.
interface AutopilotSetup {
  preferences: AutopilotStored<AutopilotPreferences>; draft: AutopilotStored<AutopilotDayDraft>;
  catalog: AutopilotCatalog; wishResolution: AutopilotWishResolution;
  suggestedEndMinute: number | null; sleepConfigured: boolean;
}
interface AutopilotDaySchedule { date: string; blocks: readonly AutopilotScheduleBlock[]; conflictIds: ReadonlySet<string> }
// DayAutopilotService:
getSetup(date: DayDate): Promise<AutopilotSetup>;
preview(input: DayAutopilotPreviewInput): Promise<DayAutopilotPreview>;
apply(preview: DayAutopilotPreview): Promise<DayAutopilotApplyResult>;
readSchedule(from: DayDate, to: DayDate): Promise<readonly AutopilotDaySchedule[]>;
// Extend Preview: guard: AutopilotGuardSnapshot; wishResolution: AutopilotWishResolution;
// Extend ApplyResult: updatedCount сохраняется, routineBlockCount: number.
// GetTimeSchedule.ts: 4-й optional argument, existing callers работают.
buildTimeScheduleDay(date: string, actions: readonly LifeAction[], capacityMinutes: number|null,
  blocks?: readonly AutopilotScheduleBlock[]): TimeScheduleDay;
```

`TimeScheduleDay` дополнить `blocks`; `suggestFreeTimeStarts` учитывает занятые блоки и не предлагает пересечение. Existing plannedMinutes/utilization относятся к рабочим действиям, ритуалы/rest показываются отдельно, без двойного учёта linked block→action. New projection строится из actual persisted state, не последнего preview в памяти.

- [ ] Написать `wholeCatalogRequired`: отсутствие findAll даёт configuration error, findByDate не fallback; все три источника связей учитываются. `rangeIsExplicit` → capacity только suggestedEnd, без settings нет скрытых480; сегодня start не раньше clock; короткая подтверждённая ночь даёт25%.
- [ ] Написать `walkHistoryIsFullyPaged` (Review Focus2): completed walk на второй странице отменяет дополнительный блок; running/paused защищён, неизвестный end блокирует preview до ввода; walkPlan.targetMinutes/window используются один раз.
- [ ] Написать `applyPreservesUnknownEstimate`: default25 меняет окно/date, estimate остаётся null; явный override40 записывает estimate40. Число focus sessions/фактическая аналитика до/после apply одинаковы.

  ```ts
  expect((await actions.findById(unknownId))?.estimateMinutes).toBeNull();
  expect((await actions.findById(editedId))?.estimateMinutes).toBe(40);
  expect(await sessions.all()).toEqual(sessionsBeforeApply);
  ```

- [ ] Написать `readbackMatchesCalendarAfterReopen`: действия, rest/walk и computed rituals одинаковы после новых service instances; linked block не дублируется; changed sleep settings показывают conflict и не сдвигают записанные окна.
- [ ] Написать `routineBlocksUseExistingSnapshotAndWireShape`: snapshot export/import и pilot sync round-trip сохраняют существующие RoutineBlockRecord/Action формы; новых полей/типов нет; preferences/draft не попадают в user-settings wire.
- [ ] Run `npm run test:target -- src/application/planner/DayAutopilotService.test.ts src/application/queries/GetTimeSchedule.test.ts src/app/composition/createLifeOsApplication.test.ts src/infrastructure/persistence/DayAutopilotService.integration.test.ts src/infrastructure/sync/IndexedDbSnapshotService.test.ts src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`; ожидается FAIL по новым сценариям.
- [ ] Реализовать загрузку/preview/apply/readSchedule. При preview сохранить используемые defaults как versioned local записи до capture guard; не менять draft после preview без инвалидирования. Apply повторно проверяет наступившее начало/версии, готовит все изменения и один commit. Cancel не вызывает application write.
- [ ] Подключить зависимости в composition после создания WalkRepository; bounded перемещение конструктора, без перестройки всего application. Экспортировать типы; `PlannerServices` предоставляет settings service и расширенный dayAutopilot.
- [ ] Повторить targeted команду; ожидается PASS. Не менять sync registry/format ради нового UI.
- [ ] Commit Task 5: `feat: wire preference autopilot and shared schedule readback`.

## Task 6: Форма, редактируемый preview и объединённая шкала

**Tests:** Modify `src/presentation/planner-v2/DayAutopilotCard.test.tsx`, `tests/e2e/current.day-autopilot.spec.ts`, `tests/e2e/current.time-planning.spec.ts`; Create `src/presentation/planner-v2/AutopilotPreferencesForm.test.tsx`, `src/presentation/planner-v2/AutopilotPlanPreview.test.tsx`.

**Interfaces — consumes:** `AutopilotSetup`, settings service и `DayAutopilotService` задач1/5; existing VoiceTextArea, timePresentation, selectors и navigation patterns.

**Interfaces — produces:**

```ts
interface AutopilotPreferencesFormProps {
  setup: AutopilotSetup;
  busy: boolean;
  onSavePreferences(value: AutopilotPreferences): Promise<void>;
  onSaveDraft(value: AutopilotDayDraft): Promise<void>;
}
interface AutopilotPlanPreviewProps {
  preview: DayAutopilotPreview;
  busy: boolean;
  onExclude(actionId: string): Promise<void>;
  onDuration(actionId: string, minutes: number): Promise<void>;
  onApply(): Promise<void>;
  onCancel(): void;
}
// named React components возвращают React.JSX.Element.
```

DayAutopilotCard owns orchestration/loading/stale state; edits save draft с ожидаемой версией, clear preview, пересчитывают через service. Нельзя применить preview после edit до пересчёта. Calendar получает application `readSchedule` для текущего visible range; оба экрана используют общие blocks, без второго алгоритма. Защитить asynchronous responses request token/date, ошибки CAS отображать с сохранением введённого текста.

- [ ] До изменения UI снять synthetic desktop/mobile baseline `#/v2/routine/day` и time calendar; записать stylesheet cascade/computed styles. Сохранить baseline в `artifacts/visual-qa/preference-day-autopilot/`, не использовать пользовательскую БД.
- [ ] Написать render tests: `showsMatchedContextAndUnresolvedWish`, `recalculatesBeforeApply`, `defaultsAndEstimateAreExplicit`, `stalePlanKeepsWishText`; `oldDateResponseDoesNotReplaceCurrentDraft` (Review Focus4) → медленный ответ вчера не меняет сегодняшний текст.
- [ ] Run `npm run test:target -- src/presentation/planner-v2/DayAutopilotCard.test.tsx src/presentation/planner-v2/AutopilotPreferencesForm.test.tsx src/presentation/planner-v2/AutopilotPlanPreview.test.tsx`; ожидается FAIL.
- [ ] Реализовать components, reuse VoiceTextArea/controls; форма focus+wishes+range, раскрываемые defaults, состояние missing sleep/walk end. Preview одна хронологическая шкала с причинами/estimate edit/exclude и метриками «Работа в плане», «Распорядок и отдых», «Свободно». Ritual links открывают существующие страницы; empty всё ещё показывает обязательный распорядок.
- [ ] Подключить readback после apply/reload и calendar projection; scoped CSS по текущему каскаду, labels/keyboard/live feedback, touch target≥44px. Никаких глобальных palette/layout overrides.
- [ ] Повторить targeted команду; ожидается PASS.
- [ ] Добавить E2E synthetic catalog investments+order+future recurrence, sleep/walk/pomodoro; фиксировать clock и timezone (`Asia/Chita`) на10.10.2026. Flow: setup → matched preview → duration/exclusion → apply → reload → calendar → rebuild. Проверить целевой выбор, cutoff, rest, preserved unknown estimate, отсутствующие дубли/errors/overflow.

  ```ts
  await page.clock.install({ time: new Date('2026-10-10T09:00:00+09:00') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(pageErrors).toEqual([]);
  ```

- [ ] Run `npm run test:e2e -- tests/e2e/current.day-autopilot.spec.ts tests/e2e/current.time-planning.spec.ts --project=desktop-chrome --project=mobile-chrome`; ожидается PASS. Дополнительный visual comparison на1600×900,1280×720,360×800; не обновлять baselines ради PASS. Зафиксировать before/after paths и findings.
- [ ] Commit Task 6: `feat: add editable day autopilot preferences and timeline`.

## Task 7: Финальная проверка и передача результата

**Interfaces:** consumes commits/evidence Tasks1–6; produces report с результатом каждого обязательного этапа и известными ограничениями.

- [ ] Прочитать применимые LifeOS quality/UI skills и проверить coverage всех9 acceptance пунктов спецификации; все5 Review Focus имеют named regression tests выше. Проверить diff, отсутствие изменённых version/feed/native config и чужих файлов.
- [ ] Run `npm run test:fast`; ожидается PASS. Затем один `npm run verify`; ожидается exit0 со всеми typecheck/lint/full unit-integration/infra/alpha/build/format этапами. Не считать старый product gate1.0.43 результатом этой функции.
- [ ] Выполнить один итоговый read-only review ветки после зелёных checks; главный агент исправляет actionable findings. Повторить affected targeted checks; повторить verify лишь если исправление изменило проверенный продукт. Не запускать второй сервер или конкурентный gate.
- [ ] Сохранить evidence report: commit/base, команды/exit codes, screenshots/comparison, desktop/mobile, snapshot/sync adapter проверки, local-only preferences, NOT RUN physical Android/Windows installation и причина. Native installation/account device exchange этим browser gate не доказаны.
- [ ] Run `git diff --check` и `git status --short`; ожидается нет whitespace errors, только собственные ожидаемые файлы. Commit отчёт/implementation evidence: `docs: record preference autopilot verification`.
- [ ] Сообщить результат и путь проверки в приложении; накопить изменение для будущего совместного обновления. Не выполнять push, tagging, release publication без новой команды пользователя.

## Условия остановки и способ исполнения

При необходимости новой DB/wire migration, semantic AI, изменения пользовательских данных или неустранимого обязательного gate — сохранить результат, назвать конкретный blocker и пересогласовать только эту границу. Не ослаблять проверки.

Рекомендуется **Native**: главный агент реализует план в этом чате, затем один итоговый read-only reviewer. Это соответствует роли единственного исполнителя из LifeOS AGENTS и предпочтению пользователя уменьшить число контекстов/проверок. Перед кодом требуется проверка этого письменного плана и выбор способа исполнения.
