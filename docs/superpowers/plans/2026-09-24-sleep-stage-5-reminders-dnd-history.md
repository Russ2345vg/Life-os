# Sleep stage 5: reminders, owned DND, and history

> **Spec:** `LifeOS_V2_Сон_и_подъём_Задание_Codex.docx`, stage 5 and matrix items 02–04, 06, 13–14, 17–18, 32–36.

## Global constraints

- Implement stage 5 only. Do not start a later stage.
- Preserve the accepted preparation screen and all stage 1–4 behavior.
- Do not run `npm run verify`, `npm run test:e2e`, `npm run verify:full`, or the full/common suite without a separate user command.
- Use the existing sleep aggregate as the durable source of truth and the Android plugin as the delivery/runtime adapter.
- The Android DND implementation owns and changes only its own automatic rule. It must never change or delete global or foreign rules.
- Reminders use a normal notification channel and stay independent from the alarm channel.
- Work in the current worktree because stages 3–4 are already present as uncommitted work. Preserve unrelated dirty files.

## Task 1 — Durable event and wake-result model

**Files:**

- Modify `src/domain/sleep/SleepSchedule.ts`
- Modify `src/domain/sleep/SleepSchedule.test.ts`
- Modify `src/infrastructure/persistence/records/SleepScheduleRecord.ts`
- Modify `src/infrastructure/persistence/mappers/SleepScheduleRecordMapper.ts`
- Modify `src/infrastructure/persistence/SleepSchedulePersistence.test.ts`

**Behavior:**

- Store idempotent native sleep events for −60, −15, bedtime, and LifeOS quiet-mode transitions.
- Store one wake outcome per wake occurrence: QR, emergency, or pre-disabled/no trustworthy result, plus the optional water mark.
- Keep old records readable through defaults; do not bump the database schema for additive fields.
- Compute honest summary counts. QR share uses `QR / (QR + emergency)` and returns `null` when the denominator is zero. Never infer sleep duration or quality.

**TDD:** add failing domain and mapper tests, run each with `npm run test:target -- <test>`, implement the minimum model and mapping, then rerun the same files.

## Task 2 — Application/native synchronization contract

**Files:**

- Modify `src/application/sleep/WakeAlarmGateway.ts`
- Modify `src/application/sleep/SleepScheduleService.ts`
- Modify `src/application/sleep/SleepScheduleService.test.ts`
- Modify `src/infrastructure/alarm/TauriAndroidWakeAlarmGateway.ts`
- Modify `src/infrastructure/alarm/TauriAndroidWakeAlarmGateway.test.ts`
- Modify `src-tauri/src/android_alarm.rs`

**Behavior:**

- Reconcile bedtime, wake time, timezone, current cycle completion/skip state, and the separate quiet-mode preference.
- Import native delivery events and wake outcomes idempotently before returning synced state.
- Reconcile after a preparation item or night completion changes so a current −15 reminder can be suppressed without affecting bedtime or the alarm.
- Expose notification-policy access as a distinct Android setup issue.

**TDD:** first extend the service and adapter tests and observe missing fields/import behavior fail; then implement and rerun only those tests.

## Task 3 — Android reminders and LifeOS-owned DND rule

**Files:**

- Add focused Kotlin scheduler/store/quiet-mode classes under `src-tauri/gen/android/app/src/main/java/com/lifeos/app/alarm/`
- Modify the existing alarm plugin, receiver, service, activity, boot receiver, manifest, and Gradle test sources only where integration requires it.

**Behavior:**

- Schedule at most one future −60, −15, and bedtime event per cycle; stale past events never fire as a burst.
- −15 is omitted only for a completed or skipped preparation. Bedtime notification and wake alarm remain scheduled.
- Reconcile cancels old pending intents after time/timezone changes and rebuilds from the current settings.
- −60 optionally activates the LifeOS automatic DND rule. Its policy allows alarms and starred-contact calls and disallows repeat-caller bypass.
- QR/emergency dismissal ends the LifeOS rule early; planned wake is an upper bound. Disabling the alarm cannot leave the rule active forever.
- Record events/outcomes in device-protected storage with stable IDs so app imports are idempotent across reboot.

**TDD:** add pure Kotlin policy/scheduling tests first, run the bounded Gradle unit-test target and observe failure, implement, then rerun that target.

## Task 4 — Existing sleep UI integration

**Files:**

- Modify `src/features/planner-v2/SleepPreparationPage.tsx`
- Modify `src/features/planner-v2/SleepPreparationPage.test.tsx`
- Modify the existing Today sleep-card wiring and its focused test only as required.
- Modify `src/features/planner-v2/planner-v2.css` for existing components only.

**Behavior:**

- Turn the existing “Не беспокоить” card into the separate quiet-mode setting and show its real permission/runtime status.
- Show a compact history/summary inside the accepted sleep screen. Do not create a new analytics section or claim sleep duration/quality.
- Keep the Today entry available manually before −60 and reflect the active preparation window at/after −60 without changing navigation.
- Preserve desktop/mobile composition and accepted visual language.

**TDD:** add failing focused component tests for toggle, honest empty summary, imported results, and Today timing; implement; rerun only the touched component test files.

## Task 5 — Scoped verification and device matrix

- Run the exact targeted TypeScript and Kotlin tests selected in Tasks 1–4.
- Run `git diff --check`, inspect the stage-5 diff, and recheck `git status --short`.
- Build/install only if the connected Android device is available; manually verify −60/−15/0 delivery, DND ownership, QR/emergency early exit, wake upper bound, foreign-rule preservation, and history import.
- Check the existing sleep screen at desktop and mobile widths only if UI code changed.
- Stop after the stage-5 report. Explicitly list any device checks that could not be performed.

## Review focus

- Midnight and DST calculations must use the existing timezone-aware domain helpers or equivalent tested Android math.
- A completed/skipped preparation suppresses only −15.
- No duplicate native event or history entry may be created after reboot/reconcile.
- DND ownership and user override behavior must be safe on target SDK 36.
- “No result” must remain distinct from an explicit skip, emergency, or QR result.
