# Android startup after the goal migration

## Reproduction and confirmed cause

Galaxy A23, package `com.lifeos.desktop`, installed version 1.0.4: the native activity
starts, but the actual WebView displays «LifeOS не удалось запустить» / «Локальное
хранилище недоступно». A successful `am start` was insufficient acceptance evidence.

Read-only inspection of the existing profile through a temporarily enabled USB WebView
debugger found database `lifeos` still at version 21. The startup error chain is
`app.initialization_failed` → `persistence.database_open_failed` → transaction abort.
The profile has two valid legacy projects and five canonical goals. Two canonical IDs
already match the deterministic legacy-project IDs, but their records lack
`legacyProjectId`, `sphereId`, and `isMain`. The old mapper did not retain those fields.
All historical content fields and timestamps match the corresponding projections;
one receiver-local version differs. No record contents are included in this report.

Version 22 previously treated any missing provenance marker as an ID collision and
aborted the entire upgrade. The original v21 data remained intact after that abort.

## Minimal correction

`LegacyProjectGoalMigration` recognizes only a complete equivalent historical projection.
It compares an independently constructed expected record, validates the existing goal,
and continues to reject mismatched content or a marker for another project. Versions
are device-local and excluded from identity comparison. Missing new optional fields
are restored. The existing content, ID, and local version are retained; provenance and
the source binding are added. Existing backups, replay protection, and tombstones remain.

## Evidence

- New regression reproduced the same database-open failure before the correction.
- After correction: 15/15 targeted goal-unification tests passed, including unchanged
  backup, reopening/replay, and five non-equivalent collision cases with atomic rollback.
- Read-only independent review found no introduced P1/P2 issue.
- Initial typecheck caught optional-property typing; corrected with explicit defaults.
- `npm run verify`: typecheck and lint passed (14 existing lint warnings); the unit
  stage emitted the already-known baseline failures and exceeded its 300-second
  deadline. This is an unresolved general gate, not a successful verification.
- `npm run test:e2e`: the managed full suite reached scenario 159/206, then exceeded
  its 1,200-second deadline. Progress was continuing; this was not an isolated hung
  scenario. The managed server released port 4173, and the exact owned process IDs
  were subsequently absent. The complete browser suite is not certified green.
- On the physical phone, the repaired candidate opened both «Сегодня» and «Альбом
  целей». Read-only inspection confirmed database version 22 and five goals.
- SHA-256 fingerprints of all seven original stores covered by migration backups
  match their pre-upgrade records exactly: two projects, five goals, three walks,
  and four empty stores. Normal startup/sync changed other current stores; these
  backup checks do not assert that the whole live database remained byte-identical.
- The final signed ARM64 APK built successfully (exit 0, 407.49 seconds), matched
  the existing signing certificate, and installed with `adb install -r` successfully.
- Final package: `com.lifeos.desktop`, version 1.0.4 / 1000004. APK SHA-256:
  `BC5009131164658ACC12A286F218802C92C2B72BDABDA750C1122735618FAEC9`.
- Screenshots of the final installation and a second cold launch show «Сегодня»
  and «Синхронизировано», without the startup error. The final process exposes no
  WebView debugging socket. Temporary USB forwards were removed.
- `git diff --check` passed; unrelated pre-existing workspace changes are retained.

Temporary WebView debugging and startup console logging were removed before the final
build. No uninstall, app-data clearing, or manual database rewriting was performed.
The phone-specific startup repair is verified and installed. General release readiness
remains unconfirmed because the broader verification gates did not complete successfully.
