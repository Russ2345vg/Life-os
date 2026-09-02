# R9 Evening Ritual v2 backward compatibility implementation plan

> Approved scope: R9 only. Do not start R10 or R11.

**Goal:** Prove that historical E1–E11 Evening records survive the current IndexedDB upgrade path and remain readable by the current repositories, history, analytics and presentation contracts.

**Architecture:** Keep IndexedDB at version 19 and retain record schema version 1. Add literal, cross-store legacy fixtures and compatibility tests. Make production changes only if a failing test proves an existing adapter defect.

**Stack:** TypeScript, Vitest, fake-indexeddb, React server rendering, Playwright through existing bounded npm scripts.

---

## Task 1: Establish exact legacy fixtures

**Files:**

- Create: `src/test/fixtures/EveningE1E11LegacyFixtures.ts`

1. Copy literal `EveningCycleRecord`, `TomorrowPlanRecord` and `PreparationPlanRecord` shapes from the historical E1–E11 contracts.
2. Include completed, shutdown/in-progress, legacy skipped, Reflection, TomorrowPlan and PreparationPlan cases.
3. Omit every R3–R8 optional field that did not exist in the legacy shape.
4. Encode stable `dayId`, `dateKey`, `cycleId`, `tomorrowPlanId` and `targetDayId` links.

## Task 2: RED — cross-store upgrade and current read model

**Files:**

- Create: `src/infrastructure/persistence/EveningRitualV2Compatibility.test.ts`

1. Create a realistic version-13 legacy database with the actual Evening store key paths and indexes.
2. Insert the literal fixtures in one transaction.
3. Upgrade through `LifeOsIndexedDb` to the current version.
4. Assert raw records are unchanged and schema/indexes remain compatible.
5. Read through repositories and `IndexedDbEveningHistoryReader`/`GetEveningHistory`.
6. Assert states, Reflection, links, analytics inputs, `dayId` and `dateKey`.
7. Run `npm run test:target -- src/infrastructure/persistence/EveningRitualV2Compatibility.test.ts` and confirm RED for the missing compatibility behavior/test harness.

## Task 3: GREEN — minimal adapter correction if required

**Potential files, only if RED proves a defect:**

- `src/infrastructure/persistence/mappers/EveningCycleRecordMapper.ts`
- `src/infrastructure/persistence/mappers/PreparationPlanRecordMapper.ts`
- `src/infrastructure/persistence/mappers/TomorrowPlanRecordMapper.ts`
- `src/infrastructure/persistence/IndexedDbEveningHistoryReader.ts`

1. Identify the failing compatibility contract.
2. Apply the smallest reader/mapper correction without changing store schema or rewriting data.
3. Re-run the targeted compatibility test until green.
4. Do not add fallback values that fabricate historical activity.

## Task 4: RED/GREEN — refresh, idempotency, partial write and rollback

**Files:**

- Modify: `src/infrastructure/persistence/EveningRitualV2Compatibility.test.ts`

1. Close/reopen the database and assert the same read model is recovered.
2. Repeat open/upgrade and assert store counts and identifiers are stable.
3. Insert a malformed partial relaxation or sleep-check value and assert controlled rejection.
4. Force a versionchange upgrade failure, then reopen the old version directly.
5. Assert the version did not advance and all legacy Evening records remain intact.
6. Run the targeted compatibility test after each behavior is introduced.

## Task 5: History UI and settings compatibility regression

**Files:**

- Modify only if coverage is missing: `src/presentation/pages/EveningCompletedHistoryScenes.test.ts`
- Reuse: `src/app/settings/BrowserLocalSettingsStore.test.ts`

1. Prove an old completed item renders through the existing history scene without new optional facts.
2. Re-run the R8 local-settings persistence/reset coverage because settings share the existing local document and are not part of IndexedDB migration.
3. Make no visual or mobile layout changes.

## Task 6: Targeted verification

Run the bounded targeted tests:

```text
npm run test:target -- src/infrastructure/persistence/EveningRitualV2Compatibility.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbEveningCycleRepository.test.ts
npm run test:target -- src/infrastructure/persistence/PreparationPersistence.test.ts
npm run test:target -- src/infrastructure/persistence/TomorrowPlanPersistence.test.ts
npm run test:target -- src/infrastructure/persistence/IndexedDbEveningHistoryReader.test.ts
npm run test:target -- src/application/queries/GetEveningHistory.test.ts
npm run test:target -- src/application/queries/GetEveningAnalytics.test.ts
npm run test:target -- src/presentation/pages/EveningCompletedHistoryScenes.test.ts
npm run test:target -- src/app/settings/BrowserLocalSettingsStore.test.ts
```

## Task 7: R9 quality gate

1. Run `npm run verify`.
2. Run mandatory R9 `npm run test:e2e`.
3. Run `git diff --check`.
4. Inspect the complete scoped diff and `git status --short`.
5. Request an independent code review and resolve only verified R9 findings.
6. Report schema before/after, strategy, matrix, risks and exact command results.
