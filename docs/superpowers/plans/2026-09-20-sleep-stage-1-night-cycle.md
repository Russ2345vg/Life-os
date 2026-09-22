# Sleep Stage 1 Night Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить отдельные данные ночного цикла, воспроизводимый расчёт локального времени и атомарное перестроение ближайших подъёмов без UI и Android runtime.

**Architecture:** Domain вычисляет локальное окно ночи и изменяет неизменяемый агрегат расписания. Application service координирует Clock, IdGenerator и один repository port. IndexedDB v26 хранит агрегат одной записью и существующий sync pipeline переносит его как `sleep_schedule`.

**Tech Stack:** TypeScript 6, Vitest 4, IndexedDB/fake-indexeddb, `Intl.DateTimeFormat`.

**Spec:** `docs/design/features/2026-09-20-sleep-stage-1-night-cycle.md`

## Global Constraints

- Не менять UI, EveningCycle, PreparationPlan и Android runtime.
- Не добавлять зависимости; расчёт IANA time zone выполняется через стандартный `Intl`.
- Не терять и не переписывать records IndexedDB v25 при миграции на v26.
- Все операции перестроения и skip-nearest должны быть идемпотентны по активным срабатываниям.
- `enabled=false` отменяет будущие активные сигналы и сохраняет историю для обратного включения.

## Review Focus

- Сон после полуночи должен относиться к вечеру предыдущей `cycleDate`.
- DST gap должен сдвигать локальное время вперёд, а DST fold не должен давать два сигнала.
- Повторный rebuild с теми же входами не должен менять идентификатор совпавшего сигнала.
- Rebuild не должен создавать backlog для времени `<= now` и не должен менять `DELIVERED/SKIPPED`.
- Повторное создание существующей ночи не должно перезаписывать снимок подготовки.

---

### Task 1: Local night time calculation

**Files:**

- Create: `src/domain/sleep/NightTime.test.ts`
- Create: `src/domain/sleep/NightTime.ts`

**Interfaces:**

- Consumes: `cycleDate`, `bedtime`, `wakeTime`, `timeZone` as validated strings.
- Produces: `calculateNightWindow(input): { plannedSleepAt: Date; plannedWakeAt: Date }`.

- [x] Write literal fixed-date tests for midnight, after-midnight sleep, Berlin DST gap and fold.
- [x] Run `npm run test:target -- src/domain/sleep/NightTime.test.ts`; verify failure because the module is absent.
- [x] Implement HH:mm/date validation, civil-date arithmetic and local-to-instant resolution with the exact DST rules from the spec.
- [x] Re-run the targeted test and keep all expectations literal ISO timestamps.

### Task 2: Night history and alarm schedule aggregate

**Files:**

- Create: `src/domain/sleep/SleepSchedule.test.ts`
- Create: `src/domain/sleep/SleepSchedule.ts`

**Interfaces:**

- Consumes: validated settings, explicit cycle dates, current instant and preparation item inputs.
- Produces: immutable `SleepScheduleState`, `ensureNightCycle`, `rebuildWakeSchedule`, `skipNearestWakeOccurrence`, and `setSleepFeatureEnabled`.

- [x] Write failing tests for a stable cycle across midnight, copied preparation history, schedule rebuild, no backlog, no duplicate active occurrences, skip-nearest and reversible disable.
- [x] Run `npm run test:target -- src/domain/sleep/SleepSchedule.test.ts`; verify failure because the aggregate module is absent.
- [x] Implement only the state transitions exercised by those tests, preserving delivered/skipped records and existing cycle snapshots.
- [x] Re-run the aggregate tests and refactor only after they are green.

### Task 3: Application orchestration and atomic repository port

**Files:**

- Create: `src/application/sleep/SleepScheduleRepository.ts`
- Create: `src/application/sleep/SleepScheduleService.test.ts`
- Create: `src/application/sleep/SleepScheduleService.ts`

**Interfaces:**

- Consumes: `SleepScheduleRepository`, `Clock`, `IdGenerator` and domain transitions from Tasks 1–2.
- Produces: commands `saveSettings`, `ensureNightCycle`, `rebuild`, `skipNearestWake`, `setEnabled`, plus read `getState`.

- [x] Write failing service tests using an in-memory repository and deterministic Clock/IdGenerator.
- [x] Run `npm run test:target -- src/application/sleep/SleepScheduleService.test.ts`; verify missing service failure.
- [x] Implement each command as one transactional read-modify-write operation; a missing record starts from an empty aggregate.
- [x] Re-run service tests and confirm repeated commands keep one active occurrence.

### Task 4: IndexedDB v26 migration, record mapper and sync registration

**Files:**

- Create: `src/infrastructure/persistence/SleepSchedulePersistence.test.ts`
- Create: `src/infrastructure/persistence/records/SleepScheduleRecord.ts`
- Create: `src/infrastructure/persistence/mappers/SleepScheduleRecordMapper.ts`
- Create: `src/infrastructure/persistence/IndexedDbSleepScheduleRepository.ts`
- Modify: `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`
- Modify: `src/application/sync/SyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.ts`
- Modify: `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`

**Interfaces:**

- Consumes: `SleepScheduleRepository` and domain state.
- Produces: schema-version-1 record round-trip and sync-ready singleton store `sleepSchedules` / entity `sleep_schedule`.

- [x] Write failing tests that open a seeded v25 database, verify old planner data byte-for-byte, verify only the new store is added, and round-trip a full aggregate.
- [x] Run `npm run test:target -- src/infrastructure/persistence/SleepSchedulePersistence.test.ts`; verify v25→current lacks the new store.
- [x] Add IndexedDB v26 schema creation without reading or rewriting old stores, then implement mapper/repository.
- [x] Add the new entity type and registration, including the singleton sync transaction scope.
- [x] Run persistence and registry targeted tests; repeat open/round-trip to prove no duplicates.

### Task 5: Stage gate and stop report

**Files:**

- Verify all files above; do not begin Stage 2.

**Interfaces:**

- Consumes: the completed Stage 1 patch.
- Produces: verification evidence and a rollback note for `enabled=false`.

- [x] Run the four targeted test files; after reviewer fixes, rerun the directly affected domain, application and persistence tests.
- [x] Run migration, sync/recovery dependency tests and `npm run typecheck`; keep the earlier successful `npm run verify` as pre-fix evidence only.
- [x] Do not resume the interrupted E2E after the user's explicit verification-policy correction; record the partial result and free the managed port.
- [x] Run `git diff --check`, inspect task diff and compare `git status --short` with the dirty baseline.
- [x] Report Stage 1 results, migration/rollback behavior and actual limits, then stop before Stage 2.
