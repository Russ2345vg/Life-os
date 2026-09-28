# Wake alarm implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Root owns all edits; independent agents review read-only. Steps use checkboxes for tracking.

**Goal:** Implement verified Android test evidence, a one-time nearest wake time, and clearer wake controls, while repairing QR export.

**Architecture:** SleepScheduleState remains the schedule authority. Application commands rebuild occurrences and reconcile the existing Android scheduler. Native storage owns test evidence and QR secrets; presentation never receives the QR payload.

**Tech Stack:** Existing React/TypeScript, IndexedDB, Tauri/Rust, Kotlin/Android, Vitest, Playwright, JUnit. No new dependencies.

**Spec:** docs/design/features/2026-09-28-wake-alarm.md

## Global constraints

- Preserve the dirty update series, user data, existing evening workflow, and Android package identity.
- No commit/push; user will consolidate the update series later.
- Existing graphite/jade surfaces and shared controls; one primary wake card, mobile controls at least 44 px.
- Normal alarm dismissal still requires QR or the existing 20-second hold and emergency phrase. QR leads to water; the existing emergency-reason flow remains intact.
- Native delivery evidence and the user's confirmation are distinct; browser cannot claim Android readiness.

## Review focus

- A late one-time wake survives refresh after the regular wake time and boot; next day returns to the regular schedule.
- A skipped or delivered cycle cannot be resurrected by rebuilding or editing its time.
- Existing records without an override retain their original schedule.
- Exporting or cancelling export leaves QR and phrase unchanged; failed replacement preserves the previous file and key.
- A permission/sound change invalidates test evidence; a scheduled probe alone cannot count as heard.

### Task 1: One-time nearest wake

**Files:** domain/sleep/SleepSchedule.ts; application/sleep/SleepScheduleService.ts; persistence records/mapper and their tests.

**Interfaces:** optional SleepSettings.wakeOverride {cycleDate,wakeTime}; service setNearestWakeTime(wakeTime:string, expectedOccurrenceId?:string), clearNearestWakeTime(); skip also accepts the displayed occurrence ID.

- [x] Write domain tests: nearest time changes once, next cycle remains 07:15; late override survives rebuild; past time rejected; skipped cycle never restored; stale forms cannot change the following day.
- [x] Run targeted tests and observe failures.
- [x] Implement domain commands and atomic service updates, backward-compatible optional record field; retain a future native timestamp during boot restoration.
- [x] Verify targeted domain/application/persistence and native schedule math tests.

### Task 2: QR export repair

**Files:** WakeAlarmGateway, TauriAndroidWakeAlarmGateway, Android Rust commands, LifeOsAlarmPlugin, WakeChallengeStore, native export policy and tests.

**Interfaces:** exportDismissalQr():Promise<void> / service exportWakeDismissalQr(); replacement remains a separate explicit command.

- [x] Write regressions for export without regeneration, surfaced bridge failures, and failure-safe replacement using a pure native transaction port.
- [x] Observe failing tests.
- [x] Export the existing content URI through Android chooser with temporary read grants; persist new QR only after successful file creation, then remove the previous copy. Cleanup failed new writes; restore previous preferences if commit fails.
- [x] Verify native transaction and bridge tests. Do not read the user's QR payload or phrase.

### Task 3: Verifiable probe and native flow polish

**Files:** alarm status/bridge, native scheduler/activity, new native probe policy and tests.

**Interfaces:** optional WakeAlarmStatus.testEvidence with scheduledAt/deliveredAt/confirmedAt/valid; native-only confirmation after actual test delivery.

- [x] Write pure policy tests for no confirmation before delivery, stale fingerprint, scheduled vs heard, future restoration, and stale test STOP protection.
- [x] Observe failures.
- [x] Persist probe fingerprint and receipt; add a test-only heard button that closes the probe safely. Keep recurring dismissal protected. Refine native typography, surfaces and touch controls without new animation.
- [x] Verify native compile/JUnit and TypeScript status mapping.

### Task 4: Wake management presentation

**Files:** SleepPreparationPage, new WakeManagementPanel and scoped CSS/render tests, scoped wake E2E.

**Interfaces:** consumes the above commands; existing settings, evening checklist and history remain available.

- [x] Add observable tests for one-off dates, readiness distinctions, browser honesty, QR bridge action, and reload persistence.
- [x] Implement one wake card before the evening checklist; cancel-safe one-off/skip forms; probe instructions/status; separate export/replacement; sync on foreground return.
- [x] Targeted tests, then npm run verify after stabilization, scoped wake/evening E2E desktop/mobile, browser screenshots/console/focus review.
- [x] Native APK build; install over the existing phone app with adb install -r. Report physical locked-screen QA separately from compilation.
- [x] Independent read-only final review, git diff --check and status; record evidence in the feature spec.

## Execution ledger

User explicitly authorized all three improvements and QR repair on 2026-09-28. Native/inline execution follows LifeOS root-only write policy. No additional approval cycle is required for these existing-page controls.

Baseline QR diagnosis: on the connected Android 14 phone the existing PNG is present in Downloads/LifeOS. The old button regenerates instead of re-exporting and supplies no system export interface.

Final application verification: npm run verify passed (1627 unit/integration, 55 infrastructure, 1 alpha; one pre-existing skipped test). Scoped wake/evening E2E passed 14/14 across desktop/mobile. Native JUnit passed 25/25 with Kotlin compilation. Rustfmt passed.

Independent read-only review identified QR commit rollback, stale test STOP, expired early override restoration and actual default-sound fingerprint issues. Each was fixed and covered by policy regressions; follow-up review found no remaining blockers. The final occurrence-ID guard was also reviewed and passed scoped E2E.

Final ARM64 Android APK rebuild passed, including Rust release and Gradle. adb install -r succeeded on the connected Galaxy A23; package identity and original QR file metadata were preserved. APK SHA256: 74F80C5741A6CCBE82B2897DB2F984C17938AABE221724194827B26C67DE861D.

Physical QR chooser and locked-screen sound QA were requested from the user and remain separate from automated evidence; no user QR payload or phrase was read. Full E2E was not required for this localized Sleep/Android change; scoped wake/evening flows were covered.
