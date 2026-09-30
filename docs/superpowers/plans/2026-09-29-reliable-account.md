# Надёжный аккаунт Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Главный агент единственный автор; review read-only. Пользователь подтвердил выполнение; повторное разрешение на этот scope не требуется.

**Goal:** надёжный вход, повторная привязка устройства и завершённый password reset без потери local data.
**Architecture:** existing account/auth/recovery, application transfer gate, native allowlist.
**Tech Stack:** текущие React/TypeScript/Supabase/Tauri/Vitest/Playwright/Rust, без новых dependencies.
**Spec:** [контракт](../../design/features/2026-09-29-reliable-account.md).
Работа в active non-main checkout: предшествующий dirty baseline нужен текущему приложению.
Commit/push/release не выполняются. Missing user error не блокирует подтверждённые независимые fixes.

## Global Constraints

Existing sign-in не применяет минимум создания пароля; создание 12–128. Auth/REST/Storage deadlines
20/30/60 s, limits 2/16/96 MiB. Recovery сохраняет owner/outbox/keys и один candidate до activation.
Без server trust weakening и сохранения reset credentials в главном auth storage.

## Review Focus

- Локальная правка во время каждого recovery await должна оставаться в outbox.
- Истёкшая/неоднозначная session и failed sign-in не разрешают старый transport.
- Timeout/body stall/late response не сохраняют auth session после abort.
- Reset proof другого аккаунта не меняет пароль связанного installation owner.
- Server accepted event до потери ответа сохраняет идемпотентный old ciphertext replay.

### Task 1: Auth credentials, ошибки и native storage

Files: SupabaseAccountAuth.ts/test, TauriSupabaseAuthStorage.ts/test,
secure_key_store/mod.rs, sync_commands.rs tests; AccountSyncPage PasswordField/test.
Interfaces: existing signIn/current/setPassword; SDK -user → separate native slot.

- [x] RED: existing password проходит provider; email/rate/network errors безопасны;
      actual SDK sign-out с native storage завершается, slots независимы, произвольные keys отвергаются.
- [x] Реализовать минимальные adapter/native/UI исправления; creation policy сохраняется.
- [x] Targeted auth/storage/render и bounded cargo slot tests GREEN.

### Task 2: Bounded Supabase requests

Files: StorageFetch.ts/test, createLifeOsSupabaseClient.ts/test.
Interfaces: withSupabaseRequestTimeout(fetch), existing withStorageTimeout сохраняется как alias.

- [x] RED: auth и REST request/body abort; внешняя отмена; no lingering timer; late response не принимается SDK.
- [x] Реализовать общий deadline до consumption body с указанными limit/timeout.
- [x] Targeted fetch + auth SDK tests GREEN.

### Task 3: Повторный вход и gate

Files: новый application/sync/SyncTransferGate.ts/test, AccountSyncService.ts/tests,
SyncInstallationRepository.ts, SyncStoreRecords.ts, IndexedDbSyncInstallationRepository.ts/tests,
PilotSyncCoordinator.ts/test, createLifeOsSyncApplication.ts; SyncApplicationService.ts/test.
Interfaces: gate.run<T>(work):Promise<T|null>, pauseAndDrain():Promise<void>, resume():void;
новые states, optional accountRecoveryDeviceId; existing recoverDevice(material).

- [x] RED: old configured login → required recovery, load не sync; drain before auth,
      owner mismatch blocked, request failure сохраняет owner; gate закрывает hints/afterStructured.
- [x] RED: candidate persisted/retry, old recording context на всех await, no key deletion;
      metadata restart/default-null; replay/rematerialization сохраняются.
- [x] Реализовать gate и configured-account recovery с переключением только после activation.
- [x] Targeted account/coordinator/persistence/recovery/outbox tests GREEN.

### Task 4: Isolated password reset

Files: AccountAuth.ts, AccountSyncService.ts/test, SupabaseAccountAuth.ts/test;
новый PasswordRecoveryProof.ts/test, factory client/composition; связанные fixtures port.
Interfaces: completePasswordReset(email,codeOrLink,newPassword):Promise<void>; isolated auth factory.

- [x] RED: OTP + standard link, duplicate/wrong-origin/type/callback rejected before network;
      policy before consumption, expected owner checked before update; no main storage/installation mutation.
- [x] Реализовать bounded isolated verify/update/cleanup. Никакого GET ссылки или auto login.
- [x] Targeted auth/parser/application tests GREEN.

### Task 5: UI состояния и scoped browser

Files: AccountSyncPage.tsx/test, accountSyncPresentation.ts/test при необходимости,
UnavailableSyncApplication.ts, tests/fixtures/account-sync.tsx, tests/e2e/account-sync.spec.ts.
Interfaces: optional overview availability; explicit states в существующих forms.

- [x] RED: current-password submit, sign-in/recovery состояния, unavailable explanation,
      reset send → proof/password/confirmation → success/login; secrets cleared, busy/double submit.
- [x] Реализовать текущие forms без нового visual pattern. Focus/keyboard и clear ошибочных states.
- [x] Scoped E2E account flow desktop/mobile; actual UI+console+Правило38.

### Task 6: Завершение

- [x] Review scope/diff независимым read-only reviewer; исправления с targeted evidence.
- [x] При общем application contract test:fast, затем один verify; без повторов зелёных стадий.
- [x] Документировать native/build/device/hosted ограничения и backward state compatibility.
- [x] git diff --check/status, cleanup только owned QA; release не публиковать.
