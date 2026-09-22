# LifeOS SYNC-06 Final UX and End-to-End Acceptance Implementation Plan

**Goal:** finish Sync v1 UX and prove the complete Windows ↔ Galaxy A23 scenario.

**Architecture:** preserve local-first commands, existing registry/coordinator/crypto/Storage/recovery services. Derive presentation status from existing durable stores and publish changes after committed work. Main agent is the only writer; independent agents perform bounded read-only research/review.

**Tech stack:** existing TypeScript, React, IndexedDB, Tauri/Rust, Supabase; no new dependencies.

**Spec:** user-approved `C:/Users/Руслан/Downloads/LifeOS_SYNC_06_Codex_Task.md`; architecture `C:/Users/Руслан/Downloads/LifeOS_Sync_v1_Design.md`; [UI contract](../../design/features/2026-09-08-sync-06-final-ux.md).

## Constraints and baseline

- Preserve the dirty baseline from SYNC-01..05 and unrelated workflow/release changes. No commit/push/release publication.
- Never clear web storage, uninstall, reset hosted DB, change package/signing/recovery identities, or expose secrets/decrypted user content in diagnostics.
- Use disposable `SYNC06_TEST_<timestamp>` records. Full snapshot restore only in an isolated synthetic state.
- Close SYNC-04 physical debt in this stage. Reuse unchanged targeted evidence; run one consolidated final gate after stabilization.
- Stop after final SYNC-06 report; no later stage.

## 1. Repository intake and design

- [x] Read task, architecture, AGENTS, design rules, testing matrix; identify existing UI and application state owners.
- [x] Show standard-settings design contract and preserve existing changes.
- [x] Complete prior-stage report/plan evidence map and exact safe master scenario interfaces.

## 2. Status and live attachment feedback

Files: `src/application/sync/pilot/PilotSyncCoordinator.ts`, application Sync contracts/read model, composition wiring, attachment/recovery adapters, `src/presentation/sync/`, shell view and Goal/Walk media components.

- [x] Test observable status invariants: no green before first success, pending/offline retained, conflicts distinguishable from transport error, attachment failure visible, subscriptions stop on disposal.
- [x] Add a metadata-only projection and commit notifications over existing durable stores. Derive queue state; do not duplicate persisted state. Retry invokes existing application operation.
- [x] Add one visible compact shell indicator opening existing Sync settings; preserve existing navigation behavior.
- [x] Show waiting/uploading/downloading/available/retry beside existing Goal cover and Walk photo without making pending content appear lost.
- [x] Run focused status/coordinator/attachment/shell tests.

## 3. Final settings and recovery UX

Files: `src/presentation/sync/SyncPage.tsx`, `SyncRecoveryPanel.tsx`, `src/presentation/styles/sync.css`, related tests.

- [x] Replace pilot copy; show Status, Devices, Protection, Attachments, Backups, Recovery with real counts and dates. Keep key epoch secondary and recovery secret hidden by default.
- [ ] Verify one-time QR countdown/cancel, pending activation, scan lifecycle, export/import, revoke confirmation. Map errors to safe user-facing text.
- [x] Make conflict/deleted inspection readable, show retention and history status, keep mandatory verified pre-restore and explicit confirmation.
- [x] Show latest verified snapshot and daily/weekly status; keep unverified restore disabled.
- [x] Focused UI behavior tests and rendered desktop/mobile review, Rule 38 checklist.

## 4. Consolidated verification and native builds

- [x] Focused Sync UX/engine/attachments/recovery/snapshots and SQL/RLS/Storage policy evidence; failure states include corruption, permission/quota, revoked, unsupported schema.
- [x] `npm run verify` (one stabilized consolidated run; diagnose any failure).
- [x] `npm run test:e2e` (required final R12 plus shell/browser flows).
- [x] Windows and Android production builds using existing bounded build scripts; preserve identities/signatures and install by update.

## 5. Native master acceptance

- [ ] Baseline: exactly one current Windows instance; A23 connected, both active in same space; privacy-safe metadata baseline.
- [ ] Android creates hierarchy + representative structured record + image; local immediate save and Windows relationships/media verified.
- [ ] Windows edits and replaces image; Android converges without duplicates.
- [ ] Both offline: different objects merge, then same base revision edits converge with losing history retained and restorable.
- [ ] Delete with stale device offline; reconnect proves tombstone, Recently Deleted and normal newer restore.
- [ ] Actual singleton-per-date test on unused synthetic date; deterministic one logical record.
- [ ] Offline attachment → process restart → reconnect resumes. Restart both and compare durable cursor/outbox/queue and synthetic records.
- [ ] Manual verified backup, preview/cancel on real profile; mandatory pre-restore and safe full apply in isolated synthetic state only.
- [ ] Native responsive/QR/recovery/device management review. Reuse synthetic fixtures for irreversible membership tests; never risk sole trusted real device.

## 6. Privacy, cleanup and report

- [x] Read-only server assertions for ciphertext-only payloads/blobs, opaque paths, no sensitive fields, private buckets, foreign/pending/revoked denial.
- [x] Secret/plaintext scan without printing matched secrets. Performance sanity: cursor catch-up, independent transfers, bounded retry and foreground lifecycle.
- [x] Delete only stage-owned disposable records through normal commands where safe; remove exact temporary local test files, retain evidence and recovery backups.
- [x] Update `docs/sync/` usage/diagnostics/limitations and `SYNC_06_REPORT.md`, map all 32 PASS criteria to evidence.
- [x] Independent read-only final review; `git diff --check`, final scoped diff/status.
- [x] Record interim verdict BLOCKED and readiness NO; physical acceptance remains open, final PASS/STOP not claimed.

## Current handoff — physical action required

Implementation, verify, full E2E and both final production builds passed. Android update installed.
Native Windows additionally passed manual encrypted cloud snapshot, preview/cancel, metadata restart,
offline attachment restart/resume and Recently Deleted restore with mandatory pre-restore; synthetic
goal cleaned up through normal delete. Full report: `docs/sync/SYNC_06_REPORT.md`.

A23 remains PIN-locked; user unlock requested. Bidirectional master and A23 visual review pending.
Receiving QR scan/account recovery requires a separate safely unconfigured native installation;
current configured profiles were not reset/re-enrolled for acceptance. Overall BLOCKED, readiness NO.
No following stage. Reuse successful evidence unless relevant source changes.
