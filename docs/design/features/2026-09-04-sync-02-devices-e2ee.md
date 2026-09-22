# LifeOS SYNC-02 Devices, Pairing, E2EE Keys and Recovery

## Status

- Design: `CONTRACT DEFINED`
- Implementation: `IN PROGRESS`
- Visual review: `PENDING`
- Lock: `UNLOCKED`

The approved source is `LifeOS Sync v1 — Technical Design Specification`. No separate Figma node
exists, so this document fixes the repository UI contract without claiming visual approval.

## Feature

New technical trust scenario inside the existing More area: create or recover a personal encrypted
sync space, pair a second device, inspect membership, revoke a device, and complete key rotation.
SYNC-02 does not synchronize any ordinary LifeOS record.

## User goal

Connect the Windows and Android installations to one private encrypted space without creating a
visible account, while retaining an offline-first LifeOS and an explicit recovery path.

## Existing logic to preserve

- IndexedDB domain stores remain the interactive source of truth.
- SYNC-01 `sync_settings` owns non-secret installation metadata.
- Supabase owns server membership state and the current key epoch.
- `sync_device_cache` is an explicitly stale-capable offline cache.
- platform secure storage is the only source of device private keys, space keys, and recovery root.
- the SYNC-01 pre-sync snapshot is created before first-space setup.
- Supabase remains outside every existing domain command and repository.

## Section

`Ещё → Синхронизация`. No new top-level navigation item or global sync indicator is introduced.

## Accent

Gold for the current trusted action, green only for verified success, amber for pending pairing or
rotation, and red only for errors and revocation.

## Atmosphere

A restrained technical trust motif: thin connection lines and compact status marks on graphite
surfaces. No permanent glass surfaces, neon panels, or purple accent.

## Page archetype

Existing settings-detail page plus the Rule 19 guided-flow pattern. Device membership uses a dense
list rather than a dashboard or a grid of decorative cards.

## Main visual center

The current trust/setup state and its single next safe action.

## Layout

`SectionPageHeader` is followed by one state panel. Configured state adds current-device/epoch
diagnostics and a dense device list. Recovery export, QR pairing, and destructive confirmation use
the existing dark transient-layer language. The page never says that user data is synchronized.

## Components to reuse

- `SectionPageHeader`;
- existing settings panels, headings, messages, and actions;
- existing primary/secondary/destructive buttons and status treatments;
- `AppIcon` lock/settings/device-compatible icons;
- tokens from `src/presentation/styles/tokens.css`.

The current component inventory has no Sync flow, QR surface, recovery export, or device membership
list, so a focused `src/presentation/sync` feature folder is required.

## States

- Loading: local metadata or server membership is being read; existing LifeOS remains interactive.
- Empty: setup and recovery/join actions, with no claim that cloud content exists.
- Error / retry: connection, secure-store, malformed QR/envelope, recovery, and rotation failures
  are typed, fail closed, and retry only the technical operation.
- Success feedback: recovery saved, device active, invitation cancelled, device revoked, or rotation
  finalized.
- Disabled: double submission, expired invite, self-revoke, and incomplete recovery confirmation.
- Interactive states: existing hover/pressed/focus-visible rules; camera starts only after an
  explicit user action.

## Mobile

One column at mobile sizes. QR stays within the viewport, recovery text wraps without horizontal
overflow, actions become full width, and transient panels use a full-height/bottom-sheet layout.
Touch targets remain at least 44 px. Required review viewports: `390×844` and `360×800`; desktop:
`1600×900` and `1280×720`.

## Accessibility

Semantic headings/forms, visible `focus-visible`, labelled icon controls, live status text, explicit
countdown text, keyboard-operable dialogs, no color-only status, and reduced-motion compliance.
Manual pairing payload entry is retained as a camera-independent fallback.

## Approved references

- Required: `YES`
- Reference/link: approved `LifeOS_Sync_v1_Design.md` textual specification
- Approval owner: LifeOS owner
- Approval status: `APPROVED`
- Rationale: the task explicitly states that architecture and Sync v1 design are approved; no new
  architecture or visual direction is introduced.

## Business logic constraints

No goal, project, direction, journal, routine, walk, Goal Album, attachment, snapshot upload,
outbox, push/pull, conflict, or realtime flow is enabled. React never writes membership directly;
application commands coordinate local repositories, secure storage, crypto, auth, and narrow RPCs.
Revocation never claims remote erasure of previously downloaded data.

## Test scope

Focused crypto and native secure-store tests; IndexedDB identity/cache persistence; anonymous auth
and offline startup; pgTAP/RLS/RPC state transitions; pairing and recovery integration; proof that
all domain stores and ordinary sync queues stay untouched; UI state/controller tests; desktop/mobile
browser review, keyboard/focus and console; Windows and Android production builds. Apply the Rule 38
checklist before handoff.

## Definition of Done

- [x] Design contract defined before implementation.
- [ ] Existing logic and authoritative state preserved.
- [x] Shared components and tokens audited; no duplicate general-purpose component planned.
- [ ] Loading / empty / error / success / disabled states implemented.
- [ ] Targeted/scoped tests passed.
- [ ] Desktop/mobile visual review completed.
- [ ] Rule 38 checklist completed.
- [ ] Accessibility requirements verified.
- [x] Approved textual reference identified.
- [ ] Visual result explicitly approved/locked if later requested.
