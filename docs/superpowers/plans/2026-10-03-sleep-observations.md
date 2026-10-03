# Sleep Observations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить утреннее подтверждение фактического времени «лёг / встал», связать предложенное время подъёма с отключением существующего будильника, показать подтверждённые ночи на графике и передать ограниченную проекцию этих данных контекстному ИИ.

**Architecture:** `SleepObservation` — отдельная сущность и отдельный IndexedDB/sync-объект, а `SleepScheduleState` остаётся владельцем плана и native alarm history. Application-координатор идемпотентно превращает доверенные `WakeResult` в черновики наблюдений; UI подтверждает фактические времена, а analytics/AI читают только подтверждённые записи.

**Tech Stack:** TypeScript 6 strict, React 19, IndexedDB, существующий LifeOS sync registry, Vitest, Playwright, CSS/SVG без новой chart-зависимости.

**Spec:** `docs/design/features/2026-10-03-sleep-observations.md`

## Global Constraints

- Перед сном новая функция не требует открытия LifeOS или нажатия кнопки.
- Начало часа без экранов не сохраняется, не отображается и не передаётся ИИ.
- `NO_RESULT` не означает подъём; только `QR` и `EMERGENCY` создают редактируемый черновик.
- Интервал называется `время в постели`, а не `продолжительность сна`.
- Неподтверждённые и неполные записи не участвуют в графике, средних и AI-выводах.
- Не добавлять зависимости и не менять alarm API.
- Сохранять существующие незакоммиченные изменения; особенно аккуратно объединять правки в AI/composition/UI-файлах.

## Review Focus

- Повторный `syncAlarm()` с одним `wakeOccurrenceId` должен оставить один черновик и не перезаписать подтверждённое пользователем время — покрыть в Task 3.
- Позднее отключение будильника после планового подъёма должно остаться связано с исходной `cycleDate` — покрыть в Task 1 и Task 3.
- Ночь через полночь/DST должна хранить абсолютные timestamps и корректно считать время в постели — покрыть в Task 1.
- Legacy IndexedDB v31 должна обновиться без потери `sleepSchedules`, а повреждённое observation-record должно отклоняться — покрыть в Task 2.
- AI не должен получать черновики, личные комментарии alarm emergency или неподтверждённые времена — покрыть в Task 7.

---

### Task 1: Domain model and sleep metrics

**Files:**

- Create: `src/domain/sleep/SleepObservation.ts`
- Create: `src/domain/sleep/SleepObservation.test.ts`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Produces: `SleepObservation`, `WakeObservationSource`, `createWakeObservationDraft`, `confirmSleepObservation`, `reviseSleepObservation`, `isConfirmedSleepObservation`, `timeInBedMilliseconds`, `summarizeSleepObservations`.
- Consumes: ISO `cycleDate`, absolute `Date` values, IANA `timeZone`, stable IDs supplied by application.

- [ ] **Step 1: Write failing domain tests**

  Add tests named:
  - `creates one incomplete draft from a trustworthy alarm result`;
  - `rejects NO_RESULT as an observation source`;
  - `confirms a cross-midnight night and reports time in bed`;
  - `keeps the explicit cycle date when wake time is later than planned`;
  - `rejects wentToBedAt at or after wokeAt`;
  - `summarizes only confirmed complete observations and handles DST timestamps`.

- [ ] **Step 2: Run the domain test and confirm RED**

  Run: `npm run test:target -- src/domain/sleep/SleepObservation.test.ts`

  Expected: FAIL because `SleepObservation` contracts do not exist.

- [ ] **Step 3: Implement the domain contracts**

  Use these exact shapes:

  ```ts
  export type WakeObservationSource = 'ALARM_QR' | 'ALARM_EMERGENCY' | 'MANUAL';

  export interface SleepObservation {
    readonly id: string;
    readonly cycleDate: string;
    readonly nightCycleId: string | null;
    readonly wentToBedAt: Date | null;
    readonly wokeAt: Date | null;
    readonly wakeSource: WakeObservationSource | null;
    readonly wakeOccurrenceId: string | null;
    readonly timeZone: string;
    readonly confirmedAt: Date | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  }
  ```

  `summarizeSleepObservations` returns counts plus averages/variability in minutes and never includes an observation unless both timestamps and `confirmedAt` exist.

- [ ] **Step 4: Run the domain test and confirm GREEN**

  Run: `npm run test:target -- src/domain/sleep/SleepObservation.test.ts`

- [ ] **Step 5: Commit the domain unit**

  Commit: `feat: add sleep observation domain`

### Task 2: IndexedDB persistence and sync contract

**Files:**

- Create: `src/application/sleep/SleepObservationRepository.ts`
- Create: `src/infrastructure/persistence/records/SleepObservationRecord.ts`
- Create: `src/infrastructure/persistence/mappers/SleepObservationRecordMapper.ts`
- Create: `src/infrastructure/persistence/IndexedDbSleepObservationRepository.ts`
- Create: `src/infrastructure/persistence/SleepObservationPersistence.test.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/infrastructure/persistence/index.ts`
- Modify: `src/application/sync/SyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`
- Modify: `src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`

**Interfaces:**

- Consumes: domain `SleepObservation` from Task 1 and existing `IndexedDbPilotMutationRecorder`.
- Produces:

  ```ts
  export interface SleepObservationRepository {
    getByCycleDate(cycleDate: string): Promise<SleepObservation | null>;
    list(input: {
      readonly from: string;
      readonly to: string;
    }): Promise<readonly SleepObservation[]>;
    save(observation: SleepObservation): Promise<void>;
    subscribe(listener: () => void): () => void;
  }
  ```

- [ ] **Step 1: Write failing mapper, migration, repository and sync tests**

  Assert:
  - record schema is exactly `1` and dates round-trip as ISO timestamps;
  - malformed cycle date, time zone, date or source is rejected;
  - opening legacy DB version `31` creates `sleepObservations` while preserving `sleepSchedules`;
  - `save` writes observation and its `sleep_observation` outbox mutation atomically;
  - list is period-bounded and sorted newest first;
  - sync registry/adapters normalize `sleep_observation` without touching `sleep_schedule`.

- [ ] **Step 2: Run the persistence tests and confirm RED**

  Run: `npm run test:target -- src/infrastructure/persistence/SleepObservationPersistence.test.ts src/infrastructure/sync/LifeOsSyncRegistry.test.ts src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.test.ts`

- [ ] **Step 3: Add store and mapper**

  Raise `LIFE_OS_DATABASE_VERSION` from `31` to `32`; add `LIFE_OS_STORE.sleepObservations` with key path `id` and indexes `byCycleDate` and `byUpdatedAt`. Do not migrate historical schedule/alarm records into observations.

- [ ] **Step 4: Add repository and sync registration**

  Add `sleep_observation` to `SyncEntityType`, `SYNC_ENTITY_TYPES`, `LIFE_OS_SYNC_REGISTRY`, and `PILOT_SYNC_ADAPTERS`. Repository writes use the existing mutation recorder within the same readwrite transaction.

- [ ] **Step 5: Run persistence/sync tests and confirm GREEN**

  Run the same targeted command from Step 2.

- [ ] **Step 6: Commit the persistence unit**

  Commit: `feat: persist and sync sleep observations`

### Task 3: Application commands and alarm reconciliation

**Files:**

- Create: `src/application/sleep/SleepObservationService.ts`
- Create: `src/application/sleep/SleepObservationService.test.ts`
- Create: `src/application/sleep/SleepAlarmObservationCoordinator.ts`
- Create: `src/application/sleep/SleepAlarmObservationCoordinator.test.ts`
- Modify: `src/application/sleep/SleepScheduleService.ts`

**Interfaces:**

- Consumes: `SleepObservationRepository`, `Clock`, `IdGenerator`, `SleepScheduleState.wakeResults`, `NightCycle`, `WakeOccurrence`.
- Produces:

  ```ts
  interface SleepObservationService {
    pending(cycleDate?: string): Promise<SleepObservation | null>;
    history(from: string, to: string): Promise<readonly SleepObservation[]>;
    reconcileWakeResult(
      state: SleepScheduleState,
      result: WakeResult,
    ): Promise<SleepObservation | null>;
    confirm(input: {
      readonly cycleDate: string;
      readonly wentToBedAt: Date;
      readonly wokeAt: Date;
    }): Promise<SleepObservation>;
    revise(input: {
      readonly cycleDate: string;
      readonly wentToBedAt: Date;
      readonly wokeAt: Date;
    }): Promise<SleepObservation>;
  }
  ```

  `SleepAlarmObservationCoordinator.sync()` returns the same `{ state, alarm }` shape as current `syncAlarm()` after reconciling trustworthy results.

- [ ] **Step 1: Write failing service/coordinator tests**

  Cover manual confirmation, missing bedtime, QR/emergency source mapping, ignored `NO_RESULT`, stable cycle linkage after late wake, repeated sync, retry after repository failure, confirmed-observation protection, and no-alarm manual flow.

- [ ] **Step 2: Run the application tests and confirm RED**

  Run: `npm run test:target -- src/application/sleep/SleepObservationService.test.ts src/application/sleep/SleepAlarmObservationCoordinator.test.ts`

- [ ] **Step 3: Implement the service and coordinator**

  Match a result to `wakeOccurrenceId`, then its `cycleDate`; obtain planned values from that cycle only as form suggestions. Never persist planned bedtime as confirmed fact. Use the existing `SleepScheduleService.syncAlarm()` as the native import boundary.

- [ ] **Step 4: Run application and neighboring alarm tests**

  Run: `npm run test:target -- src/application/sleep/SleepObservationService.test.ts src/application/sleep/SleepAlarmObservationCoordinator.test.ts src/application/sleep/SleepScheduleService.test.ts`

- [ ] **Step 5: Commit the application unit**

  Commit: `feat: reconcile wake alarms with sleep observations`

### Task 4: Composition and analytics snapshot

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.test.ts`
- Modify: `src/application/planner/PlannerServices.ts`
- Modify: `src/application/ports/AnalyticsSnapshotReader.ts`
- Modify: `src/infrastructure/persistence/IndexedDbAnalyticsSnapshotReader.ts`
- Modify: `src/infrastructure/persistence/IndexedDbAnalyticsSnapshotReader.test.ts`

**Interfaces:**

- Consumes: repository/service/coordinator from Tasks 2–3.
- Produces: `LifeOsApplication.sleepObservations`, `LifeOsApplication.sleepAlarmObservations`, and `AnalyticsSnapshot.sleepObservations: readonly SleepObservation[]`.

- [ ] **Step 1: Write failing composition/snapshot tests**

  Assert composition exposes the services, startup reconciliation is best-effort without blocking app creation, snapshot reads the new store in its existing consistent transaction, and subscriptions react to `sleepObservations` commits.

- [ ] **Step 2: Run targeted tests and confirm RED**

  Run: `npm run test:target -- src/app/composition/createLifeOsApplication.test.ts src/infrastructure/persistence/IndexedDbAnalyticsSnapshotReader.test.ts`

- [ ] **Step 3: Wire the services without replacing dirty AI/walk changes**

  Instantiate `IndexedDbSleepObservationRepository`, `SleepObservationService`, and `SleepAlarmObservationCoordinator`; keep existing `sleepSchedule` API available. Add `sleepObservations: []` to every typed snapshot fixture found by TypeScript/tests.

- [ ] **Step 4: Run targeted tests and confirm GREEN**

  Run the same command from Step 2.

- [ ] **Step 5: Commit the composition unit**

  Commit: `feat: expose sleep observations to application reads`

### Task 5: Morning confirmation form

**Files:**

- Create: `src/presentation/planner-v2/sleep/SleepObservationForm.tsx`
- Create: `src/presentation/planner-v2/sleep/SleepObservationForm.test.tsx`
- Create: `src/presentation/planner-v2/sleep/sleep-observations.css`
- Modify: `src/presentation/planner-v2/SleepPreparationPage.tsx`
- Modify: `src/presentation/planner-v2/SleepPreparationPage.test.tsx`
- Modify: `src/presentation/planner-v2/PlannerWorkspace.tsx`

**Interfaces:**

- Consumes: `SleepObservationService`, current `SleepScheduleState`, cycle plan, and pending draft.
- Produces: controlled morning form with `wentToBedAt`, `wokeAt`, source text, validation and success/error feedback.

- [ ] **Step 1: Write failing render/interaction tests**

  Assert no pre-sleep CTA exists; planned bedtime is only a suggestion; trusted alarm time is prefilled and labeled; manual no-alarm entry works; invalid order preserves values; save confirms once; busy prevents duplicate submit; success and retry feedback are accessible.

- [ ] **Step 2: Run UI tests and confirm RED**

  Run: `npm run test:target -- src/presentation/planner-v2/sleep/SleepObservationForm.test.tsx src/presentation/planner-v2/SleepPreparationPage.test.tsx`

- [ ] **Step 3: Implement the isolated form and page integration**

  Keep `SleepPreparationPage` responsible for loading/orchestration; keep field state and validation in `SleepObservationForm`. Use existing controls/tokens, 44px targets, explicit labels, keyboard focus and one primary action `Сохранить ночь`.

- [ ] **Step 4: Run UI tests and confirm GREEN**

  Run the same command from Step 2.

- [ ] **Step 5: Commit the form unit**

  Commit: `feat: add morning sleep confirmation`

### Task 6: Sleep history chart and responsive states

**Files:**

- Create: `src/presentation/planner-v2/sleep/SleepObservationChart.tsx`
- Create: `src/presentation/planner-v2/sleep/SleepObservationChart.test.tsx`
- Modify: `src/presentation/planner-v2/sleep/sleep-observations.css`
- Modify: `src/presentation/planner-v2/SleepPreparationPage.tsx`

**Interfaces:**

- Consumes: confirmed history, matching `NightCycle` plans, `summarizeSleepObservations`.
- Produces: 7/30 day segmented view, accessible rows with plan/fact/time-in-bed labels, desktop SVG/CSS timeline and mobile list.

- [ ] **Step 1: Write failing chart tests**

  Assert empty/loading/error/success states; draft exclusion; planned outline plus confirmed fact; cross-midnight labels; 7/30 switch; accessible text independent of color; mobile list uses the same data.

- [ ] **Step 2: Run chart tests and confirm RED**

  Run: `npm run test:target -- src/presentation/planner-v2/sleep/SleepObservationChart.test.tsx`

- [ ] **Step 3: Implement chart without a dependency**

  Use SVG/CSS with a fixed evening-to-morning time scale and a text/list fallback. Use existing Premium surfaces and tokens; jade is the actual series, neutral is plan, green is limited to saved-success feedback.

- [ ] **Step 4: Run chart and page tests**

  Run: `npm run test:target -- src/presentation/planner-v2/sleep/SleepObservationChart.test.tsx src/presentation/planner-v2/SleepPreparationPage.test.tsx`

- [ ] **Step 5: Commit the chart unit**

  Commit: `feat: chart confirmed sleep observations`

### Task 7: Analytics and contextual AI projection

**Files:**

- Modify: `src/application/analytics/GetAnalyticsOverview.ts`
- Modify: `src/application/analytics/GetAnalyticsOverview.test.ts`
- Create: `src/application/ai/SleepAiProjection.ts`
- Create: `src/application/ai/SleepAiProjection.test.ts`
- Modify: `src/application/ai/AiContext.ts`
- Modify: `src/application/ai/AiContext.test.ts`
- Modify: `src/application/ai/AnalyticsAiProjection.ts`
- Modify: `src/presentation/planner-v2/ContextualAiAssistant.tsx`
- Modify: `src/presentation/planner-v2/ContextualAiAssistant.test.tsx`

**Interfaces:**

- Consumes: `AnalyticsSnapshot.sleepObservations` and domain summary from Task 1.
- Produces: sleep metrics in `AnalyticsOverview`, bounded `AiContext` facts/sources for section `sleep` and analytics topics `state/rest/overview`.

- [ ] **Step 1: Write failing analytics/AI tests**

  Assert only confirmed complete observations enter metrics; drafts and emergency comments never cross AI boundary; each source has cycle date and factual plan/fact detail; insufficient energy samples state insufficiency; context remains below 20KB; suggested question uses `время в постели` and avoids diagnosis language.

- [ ] **Step 2: Run analytics/AI tests and confirm RED**

  Run: `npm run test:target -- src/application/analytics/GetAnalyticsOverview.test.ts src/application/ai/SleepAiProjection.test.ts src/application/ai/AiContext.test.ts src/presentation/planner-v2/ContextualAiAssistant.test.tsx`

- [ ] **Step 3: Implement local metrics and bounded projection**

  Keep calculations deterministic and local. Send dates, planned/factual times, time-in-bed minutes, variability and sample counts; do not send alarm emergency reason/comment or any draft.

- [ ] **Step 4: Run analytics/AI tests and confirm GREEN**

  Run the same command from Step 2.

- [ ] **Step 5: Commit the analytics/AI unit**

  Commit: `feat: add sleep observations to analytics ai`

### Task 8: Browser flow and quality gate

**Files:**

- Modify: `tests/e2e/current.sleep-preparation.spec.ts`
- Modify only if fixture setup requires it: `tests/fixtures/openai.tsx`
- Modify: `docs/design/features/2026-10-03-sleep-observations.md` only for verified implementation notes, without changing approved behavior.

**Interfaces:**

- Consumes: completed application/UI/AI behavior from Tasks 1–7.
- Produces: desktop/mobile browser evidence and final gate evidence.

- [ ] **Step 1: Add scoped E2E scenarios**

  Cover manual no-alarm morning entry, trusted alarm-prefilled entry, correction after apparent second sleep, persistence after reload, chart update, no pre-sleep control, keyboard submit, and mobile layout without horizontal page overflow.

- [ ] **Step 2: Run affected fast tests**

  Run: `npm run test:fast`

  Expected: PASS. Diagnose failures against pre-existing dirty changes before modifying unrelated files.

- [ ] **Step 3: Run the canonical non-E2E gate**

  Run: `npm run verify`

  Expected: PASS with typecheck, lint, unit/integration, infra, alpha, build, format and `git diff --check`.

- [ ] **Step 4: Run scoped sleep E2E on configured desktop/mobile projects**

  Run: `npm run test:e2e -- tests/e2e/current.sleep-preparation.spec.ts`

  Expected: selected tests execute with zero failures and no cleanup error. Full E2E is intentionally skipped because routing/startup and independent flows are unchanged.

- [ ] **Step 5: Perform browser visual review**

  Capture current desktop/mobile sleep route after the managed preview is available; check Rule №38, focus order, loading/empty/error/success, chart labels, no horizontal overflow, console/page errors and reduced-motion behavior.

- [ ] **Step 6: Review final diff and worktree hygiene**

  Run: `git diff --check`, inspect `git diff`, and run `git status --short`. Separate pre-existing changes from this feature in the final report.

- [ ] **Step 7: Commit the verified feature**

  Commit: `feat: track and explain sleep observations`
