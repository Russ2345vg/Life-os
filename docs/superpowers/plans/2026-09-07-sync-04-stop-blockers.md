# SYNC-04 STOP blockers

User-approved scope: repair singleton-per-date sync identity, restore use of the existing REL-05 signing key, controlled WALK-14 diagnosis, and consolidated acceptance. No SYNC-05, new engine, data reset, or UI redesign.

## Contract

Business-logic/persistence repair only. Existing domain repositories remain authoritative. The existing HLC/revision resolver chooses conflicts. Existing physical IDs are retained. Logical identity is entity type plus the domain date, inside encrypted sync payloads; server object IDs remain opaque. Technical identity bindings belong to existing sync settings, not a second domain store. Multi-record-per-date entities keep their stable IDs.

## Sequence

1. Audit unique date invariants and reference paths; add focused real IndexedDB regressions (same content, divergent content, different dates, multi-record dates).
2. Implement sync-boundary identity/reference translation, preserving legacy payloads, pending events, local IDs and loser history. Verify scoped tests before broad gates.
3. Use existing external REL-05 key with matching public config; never print or commit secret material.
4. Preserve the installed Galaxy A23 application/data; perform physical acceptance only through supported access.
5. After stabilization: relevant sync tests, SQL/RLS, verify, one complete E2E, signed Windows build, affected Android production build, device acceptance, diff hygiene and independent review.

## WALK-14 evidence

Three controlled exact-selector runs passed: 8.11s, 7.60s, 7.52s. Port 4173 released after every run. No source or timeout change. Original failure trace no longer exists; deterministic regression is not reproduced, but the historical root cause is not established. Do not label environment contention as proven.

## Existing installation/signing evidence

Galaxy A23 SM_A235F is authorized via ADB; existing release is 1.0.2. REL-05 secure environment and private key exist outside Git; public key matches the current Tauri updater configuration. No new key is required.

## Handoff / remaining contract gate

Identity regressions, related sync tests, SQL/RLS, verify and both native builds passed. The one full
E2E had a WALK-10 screenshot timeout; its exact isolated repeat passed. No second full suite was run.
Physical acceptance is not complete: Windows installed app has a storage startup error and closing
that window awaits user permission; Galaxy USB availability was intermittent, last check authorized.

Independent review found conditional preparation rule-version cache incompatibility. Safe repair
requires source-content provenance or a changed application cache contract, with an explicit policy
for legacy completed plans lacking that evidence. Blind rebasing is not safe and was not added.
Implementation of that expanded contract is paused for design approval (`superpowers:brainstorming`).
Current authoritative results: `docs/sync/SYNC_04_REPORT.md`. SYNC-05 remains out of scope.

## Approved legacy completion policy (2026-09-07, continuation)

User approved preserving completed legacy plans when portable generation-input provenance is absent.
All current generation signatures use local versions, so automatic `getOrGenerate` now treats a
completed plan as authoritative after validating the parent link. The check belongs inside the
existing optimistic reread loop. No protocol/provenance encoding or schema is introduced.
Explicit item/core application commands may still modify/reopen the plan. Unfinished plans retain
their existing regeneration behavior. This conservative policy deliberately prefers preserved
completion over inferring an input change from incomparable device versions.

Regression: real sync apply of a completed plan into a PREPARING receiver with different local rule
versions (same and different rule content), application reads/restart preserving items/completedAt/
version/Outbox, explicit edit emitting one change, and unfinished regeneration. RED: 3/4 fail as
expected; GREEN with existing application/identity tests: 31 tests. Refresh verify and relevant
Evening/persistence gates after this code change; do not replay closed SQL/foundation checks.
