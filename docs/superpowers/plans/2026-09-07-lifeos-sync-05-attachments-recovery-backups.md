# SYNC-05 — Attachments, recovery and backups implementation plan

**Goal:** выполнить утверждённый SYNC-05 до STOP gate, без SYNC-06.

**Architecture:** IndexedDB остаётся рабочим источником; существующие recorder, registry,
HLC, Outbox и pull/push обеспечивают structured mutations и restore. Отдельная durable
attachment queue переносит ciphertext через private Storage. Native XChaCha20-Poly1305
и secure key ring SYNC-02 переиспользуются с отдельным purpose-derived namespace.

**Spec:** `C:/Users/Руслан/Downloads/LifeOS_SYNC_05_Codex_Task.md` и
`C:/Users/Руслан/Downloads/LifeOS_Sync_v1_Design.md` (утверждены пользователем).

**Baseline:** D:/LifeOS-App содержит незакоммиченные SYNC-01…04 и другие изменения.
Они сохраняются; этот план не разрешает commit/push/publish или изменение реальных данных.

## Inventory и границы

- SYNC BINARY NOW: `Goal.coverImage` (Goal Album), `Walk.photo`, persistent IndexedDB
  records; data URL, MIME и размер, текущий лимит 5 МиБ.
- REFERENCE ONLY: структурные связи WalkCapture, journal и built-in cover fallback.
- LOCAL CACHE / DERIVED: bundled backgrounds, browser presentation caches.
- TEMPORARY: FileReader/camera input до сохранения существующей application-командой.
- NOT IMPLEMENTED: отдельная Goal gallery, journal/project/goal file collections,
  Tauri filesystem media repository. Не добавлять эти функции.

## Последовательность

- [x] Attachment contracts/tests: `src/application/sync/attachments/`,
      `src/infrastructure/sync/attachments/`; opaque ID, immutable version, registration,
      restart lease, backoff, quarantine, binary-free structured payload.
- [x] Интеграция recorder/registry/pull: `IndexedDbPilotMutationRecorder.ts`,
      `PilotSyncRegistryAdapters.ts`, `IndexedDbPilotSyncStore.ts`,
      `LifeOsIndexedDb.ts`, `SyncStoreRecords.ts`; атомарная регистрация и before-images.
- [x] Native crypto: `src-tauri/src/sync_crypto.rs`, `sync_commands.rs`, `lib.rs`;
      AAD purpose/space/id/epoch/version, nonce randomness, tamper/wrong-key tests.
- [x] Private Storage adapter и additive migration в `supabase/migrations/`;
      insert-only immutable opaque paths, active membership, no delete, SQL denial tests.
- [x] Recovery application port и IndexedDB adapter: список/inspect conflicts,
      Recently Deleted с 30-day metadata, guarded new local revisions, preserved history.
- [x] Encrypted snapshots: manual/daily/weekly/pre-restore, local verification и
      remote roundtrip verification, conservative retention, preview counts/schema/media,
      mandatory pre-restore и atomic validated apply через normal recorder.
- [x] Composition/foreground lifecycle: `createLifeOsSyncApplication.ts`, application
      facade; independent file failures; backups catch-up без daemon.
- [x] Minimal `SyncRecoveryPanel.tsx` внутри `SyncPage.tsx`; reuse settings panels,
      buttons/status; preview/confirmation, loading/empty/error/success.
- [x] Focused tests → test:fast (shared contract) → stabilized verify stages → E2E
      (persistence/restore/browser flow). Native builds/tests при native changes.
- [x] Synthetic hosted Storage/RLS и Windows ↔ Galaxy A23 после явного разрешения пользователя;
      не выполнять full restore реальных данных. Secret/plaintext scan, diff check,
      independent read-only review, итоговый `docs/sync/SYNC_05_REPORT.md`.

## Design contract

Новая функция существующей страницы «Синхронизация»; settings-panel/list archetype,
graphite/gold, тихий градиент текущего экрана; главный центр — sync status.
Reuse SectionPageHeader, settings-panel, primary/secondary buttons, inline feedback.
Mobile — один поток, перенос действий, targets ≥44px; preview details без horizontal
overflow. Loading/empty/error/retry/success обязательны. Отдельный approved visual
reference не требуется для стандартных настроек; SYNC-06 polish исключён.

## STOP и долг

SYNC-04 physical acceptance debt — close in SYNC-06.
SYNC-04 physical acceptance debt retained for final SYNC-06 acceptance.
Отсутствующие реальные проверки не становятся PASS. Cleanup deferred до доказательства
retention + device cursor + current/snapshot references. SYNC-06 не начинать.
