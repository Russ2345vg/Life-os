# LifeOS trash and reversible deletion

**Date:** 2026-09-25

**Status:** design approved in conversation; awaiting written-spec review

**Scope:** reversible deletion for goals, standalone actions and recurring action series; immediate
undo; a unified trash page; restore; permanent deletion after 30 days

## Outcome

A LifeOS user can delete a goal, standalone action or recurring action series without risking an
immediate irreversible loss. The entity disappears from every active projection at once, an
immediate `Отменить` action is offered, and the entity remains restorable from a unified trash page
for 30 days. Restore returns the entity to the active workspace with its supported relationships and
history. After the retention period, LifeOS makes the entity permanently non-restorable and records
the deletion through the existing sync tombstone contract where referential integrity permits it.

This feature separates three meanings that must remain distinct:

- completed means the intended result was achieved;
- archived means retained history that is intentionally outside active work;
- deleted means hidden everywhere and recoverable only through trash until its purge deadline.

## Confirmed product decisions

- The first release covers goals, standalone actions and recurring action series.
- Deleted entities remain in trash for 30 days.
- Every successful delete offers an immediate `Отменить` action.
- Trash is a normal workspace page at `#/v2/trash`, available from `Ещё`.
- Trash filters are `Все`, `Цели`, `Действия` and `Серии`.
- A restored goal or action keeps its identifier, content and supported relationships.
- A restored recurring series resumes from the local current date and keeps completed history.
- Permanent deletion requires a destructive confirmation.
- Automatic expiry runs through bounded application maintenance during normal startup or trash
  loading; it does not require a background service to remain alive.
- A deleted entity never appears in active lists, focus, Today, calendar, kanban, tree, quick access,
  selectors or planning calculations.
- Existing dependency checks remain authoritative. The feature does not introduce cascading delete
  of user data.
- Decisions already have a compatible soft-delete domain contract, but adding decisions to the
  unified trash UI is outside this release.

## Current system and reuse boundary

LifeOS currently has two deletion models relevant to this work:

- goals and standalone actions are physically removed by `IndexedDbPilotDeleteRepository` in the
  same transaction that records a sync tombstone;
- recurring series keep the rule with `removedAt`, preserve completed occurrences and cancel/archive
  unfinished occurrences;
- decisions already model `deletedAt`, `lastDeletedAt` and `restoredFromTrashAt` in the domain and
  persistence mapper.

The new feature adopts the decision-style soft-delete contract for goals and life actions. It keeps
the existing recurrence history model and formalizes `removedAt` as the series' trash timestamp.
The existing Pilot registry, mutation recorder, repositories, clock and id generator remain the
authoritative persistence and sync boundaries. Presentation must not create a separate trash cache
or mutate records directly.

The current dependency graph remains enforced before soft deletion. For example, deleting a goal
that is still required by an action, recurrence rule, membership, contribution or focus record is
blocked with the existing explanatory error. The user must unlink the dependent record or archive
the goal. This avoids orphan records and makes later permanent purge deterministic.

## User experience

### Delete and immediate undo

The existing destructive menu action keeps the label `Удалить`. Its confirmation copy changes from
irreversible wording to `Переместить в корзину? Объект можно восстановить в течение 30 дней.`

After the command commits, the current page refreshes from the authoritative repository and shows a
status notification:

`Перемещено в корзину · Отменить`

`Отменить` remains available for eight seconds. It invokes the same restore application command as
the trash page. If the notification expires, the object remains available in trash. A failed delete
or restore never shows success optimistically.

For a recurring occurrence the existing distinction remains:

- `Удалить это повторение` permanently skips that one occurrence and is not a trash item;
- `Удалить всю серию` moves the series to trash and preserves completed occurrences.

### Trash page

`Ещё` adds `Корзина`, routed to `#/v2/trash`. The page uses the established catalog shell. Its main
content is a single chronological list ordered by `deletedAt` descending. Each row contains:

- entity title;
- neutral type label: `Цель`, `Действие` or `Серия`;
- deletion date;
- `Будет удалено навсегда …` with the computed local purge date;
- primary `Восстановить` action;
- secondary destructive `Удалить навсегда` action.

The page header contains the four type filters and a count. No bulk empty-trash action is included
in the first release because one accidental click would affect unrelated entity types and would
require a separate recovery design.

Required states:

- loading: existing bounded loading treatment;
- empty: `Корзина пуста` and a short explanation of the 30-day retention;
- error: inline alert with `Повторить загрузку`;
- restoring: only the affected row is busy and duplicate commands are blocked;
- restored: status notification and immediate removal of the row;
- permanent-delete confirmation: entity title, irreversibility warning and red confirm action;
- expired while open: the row disappears after maintenance refresh and cannot be restored;
- dependency/conflict error: the row stays visible with a precise recoverable message.

### Restore semantics

Goal restore clears its deletion marker and returns the same goal record. Its pre-delete status,
stage, hierarchy links and progress data remain unchanged.

Standalone action restore clears its deletion marker and returns the same action record. Status,
planned date, goal/direction/sphere links, expected result and completion history remain unchanged.

Series restore clears the rule's removed state, increments its version and revision, sets
`effectiveFrom` to the local current date and resumes future materialization. Completed occurrences
remain history. Cancelled and archived occurrences produced by the series deletion remain historical
and must not block the restored revision. Each rule has a `restorationGeneration`, defaulting to
zero for legacy and active rules and incremented only by restore. New occurrences include that
generation in their identity and metadata, so restored slots cannot collide with historical
instances. Previously skipped individual occurrences remain skipped within their original
generation.

If a relationship target was independently deleted after the trash item was created, restore is
blocked rather than silently clearing the relationship. The error identifies the missing target.

### Permanent deletion and expiry

`Удалить навсегда` is available per row and requires confirmation. Automatic expiry uses the same
application command after `deletedAt + 30 calendar days` in local time. It runs in a bounded batch at
startup and when trash is loaded; failures are isolated per entity and retried later.

For goals and standalone actions, successful purge uses the existing physical delete and sync
tombstone transaction. For recurrence rules, completed occurrences may retain a historical
reference. In that case permanent deletion means the rule is non-restorable and absent from trash;
the minimal referential record may remain locally and in sync with a `purgedAt` marker. It cannot
materialize occurrences or return to the UI. This is user-level permanent deletion without breaking
historical integrity.

The first release has no manual retention setting and no recovery after purge.

## UI design contract

```text
FEATURE → unified trash and immediate undo
USER GOAL → delete goals, actions and recurring series safely and restore them for 30 days
EXISTING LOGIC → decision soft-delete, Pilot mutation/tombstone sync, recurrence removed history
PAGE/COMPONENT ARCHETYPE → standard catalog page in the current workspace
SECTION COLOR → current jade for restore; danger red only for permanent deletion/error
ATMOSPHERIC MOTIF → calm recovery area within the graphite workspace
MAIN VISUAL CENTER → chronological list of deleted entities and their recovery deadline
COMPONENTS TO REUSE → PlannerWorkspace shell, AppIcon, catalog rows, confirmation dialog, notice
MOBILE BEHAVIOR → single column; stacked metadata; restore and menu targets at least 44 px
APPROVED REFERENCE → YES; current “Единая рабочая поверхность” direction and live shell baseline
TEST SCOPE → domain, application, persistence, sync, projections, routing and desktop/mobile E2E
```

The page does not introduce a decorative palette or a unique composition. It uses the current
graphite surfaces, system typography and density. Jade communicates recovery/primary action; red is
reserved for irreversible purge. Type labels and dates remain neutral. The list is the page's only
visual center.

On mobile, filters may scroll horizontally or use the established compact control. Row content
stacks title, type and dates before actions. Permanent delete remains inside the row menu to avoid a
large field of red buttons. Desktop keeps the existing sidebar; mobile exposes trash through `Ещё`.

## Domain model

### Goal

Add nullable `deletedAt`, `lastDeletedAt` and `restoredFromTrashAt` fields to `Goal`, its rehydration
data and persistence record. Domain operations:

- `softDelete(at)` rejects an already deleted goal and preserves status/stage;
- `restoreFromTrash(at)` requires `deletedAt`, moves that timestamp to `lastDeletedAt`, clears
  `deletedAt` and records `restoredFromTrashAt`;
- `isDeleted()` is the single visibility predicate for deleted state.

Both transitions increment version and updated time. Existing legacy records without these fields
rehydrate as active.

### LifeAction

Add the same three timestamps to `LifeAction` and its record. Soft delete is independent of action
status and archive status; restore returns both unchanged. Domain events use generated ids through
the existing command boundary. Legacy records default to active.

### RecurrenceRule

Keep `removedAt` as the current deletion timestamp and add `lastRemovedAt`,
`restoredFromTrashAt`, `purgedAt` and integer `restorationGeneration`. A removed rule is a trash item
while `purgedAt` is null. A purged rule is historical metadata only. Restore requires `removedAt`,
rejects `purgedAt`, clears `removedAt`, records the restoration timestamps, increments
restorationGeneration/revision/version and starts the restored revision from the current local date.
`ActionOccurrence` stores the generation, and materialization includes it in occurrence identifiers.
Missing legacy generation fields read as zero, preserving existing identifiers.

### Shared trash projection

Application owns a read-only `TrashCatalog` that combines deleted goals, deleted standalone actions
and removed non-purged recurrence rules into a discriminated projection:

```text
TrashItem = { type, id, title, deletedAt, purgeAt }
```

The projection contains no copied domain payload. Restore and purge commands reload the authoritative
entity by type and id before mutation.

## Application commands and ports

Replace presentation use of `DeletePilotGoal` and `DeletePilotLifeAction` with reversible commands:

- `MoveGoalToTrash`;
- `MoveLifeActionToTrash`;
- `RestoreGoalFromTrash`;
- `RestoreLifeActionFromTrash`;
- `RestoreRecurringSeriesFromTrash`;
- `PurgeTrashItem`;
- `MaintainTrashRetention`;
- `TrashCatalog.list(filter)`.

`RecurringActions.remove` remains the application owner for moving a series to trash and gains a
restore operation. Permanent purge delegates to an application service that understands historical
recurrence references.

The write commands depend on application ports, `Clock` and `IdGenerator`; they do not import
IndexedDB or React. Infrastructure adapters persist each mutation and its sync outbox entry in one
transaction. Presentation refreshes catalogs only after command success.

Delete commands run the existing dependency validation before changing state. This validation is
factored behind an application port so reversible delete and later physical purge use the same
relationship policy without duplicating registry rules in presentation.

## Persistence and synchronization

Goal and action records gain optional nullable trash timestamps for backward compatibility.
Recurrence records gain optional nullable restoration and purge timestamps. Mappers must round-trip
every field and treat absent legacy fields as null.

Moving to trash and restoring are ordinary versioned upserts. They enter the existing Pilot outbox,
sync across devices and resolve through the normal version/HLC conflict contract. A later accepted
mutation wins: for example, a restore performed after a delete remains active on every device.
Permanent purge creates the existing domain tombstone. A stale offline upsert older than that
tombstone cannot resurrect the entity.

All read paths must use authoritative visibility rules:

- normal repositories/catalogs exclude `isDeleted()` entities;
- trash repositories select only deleted entities;
- raw transaction readers used by dependency validation and sync still see both states;
- planning, Today, focus, quick access, selectors and all view projections receive no deleted data;
- removed or purged recurrence rules never materialize actions.

No new IndexedDB database or parallel sync engine is introduced. Schema evolution is additive and
legacy compatible.

## Failure handling and concurrency

- Commands are idempotent at the application boundary: replaying the same committed intent returns
  the current state without duplicating events or records.
- Restore after purge returns `trash.expired` and refreshes the page.
- Concurrent restore and purge resolve by committed version/HLC; a purge tombstone dominates stale
  restore upserts.
- A failed transaction changes neither the domain store nor the sync outbox.
- Maintenance processes a bounded number of expired rows per run and reports aggregate diagnostics
  without blocking normal application startup.
- UI busy state is per row; a failed operation leaves other rows usable.
- Undo uses the committed trash receipt `{ type, id }`; it does not retain a mutable in-memory
  object snapshot.

## Accessibility

- The trash page has one `h1` and a labelled results region.
- Filter controls expose selected state without relying on color.
- Restore and permanent-delete controls include the entity title in their accessible names.
- Notifications use `role=status`; errors use `role=alert`.
- Focus moves to the notification after delete only when initiated from a context menu whose trigger
  disappears; otherwise it returns to the nearest stable list control.
- After restore or purge from trash, focus moves to the next row or the empty-state heading.
- Confirmation supports Escape, focus trapping and return focus through the existing dialog.

## Testing strategy

Domain tests cover soft-delete, restore, repeated operations, timestamps, versioning, legacy
rehydration and preservation of pre-delete state. Recurrence tests cover removal, completed history,
restoration from today, skipped occurrences, identity collision prevention and permanent purge.

Application and persistence tests cover dependency blocking, catalog visibility, 30-day local-date
boundary, bounded maintenance, atomic outbox writes, database reopen and idempotency. Sync tests cover
delete/restore ordering, purge tombstone dominance and an offline stale upsert.

Presentation tests cover routing, filters, empty/loading/error/busy states, accessible names and
notification undo. Scoped E2E covers goal, standalone action and series deletion; disappearance from
list/calendar/tree/kanban; immediate undo; restore from trash; reload persistence; permanent delete;
expiry; desktop and mobile layouts. `npm run verify` is required before handoff. Full E2E is required
only if implementation changes the shared startup or sync machinery beyond the scoped contracts in
this specification, according to `AGENTS.md` and `docs/codex/TEST_MATRIX.md`.

## Rollout and migration

The additive record fields require no eager data rewrite. Legacy goals/actions/rules load with null
trash fields. Existing physically deleted entities cannot be reconstructed and do not appear in
trash. Existing removed recurrence rules become trash items only when they have a valid `removedAt`
and are not marked purged; this makes the user's currently removed series recoverable after upgrade.

Retention maintenance must not purge legacy removed series immediately on first startup merely
because `removedAt` is older than 30 days. The first compatible release records a retention
eligibility timestamp for pre-existing removed rules and grants a fresh 30-day recovery window.
New deletions use their actual deletion timestamp.

All supported delete entry points switch in the same release so the UI cannot mix physical deletion
and trash behavior for the same entity type.

## Out of scope

- Trash for spheres, directions, decisions, inbox ideas, scenarios, sleep preparation data or files.
- Cascading deletion of dependent entities.
- Bulk `Очистить корзину`.
- Configurable retention duration.
- Recovery after permanent purge.
- A new analytics or audit-history subsystem.
- Visual redesign of the surrounding LifeOS shell.

## Acceptance criteria

1. Deleting a supported entity hides it from every active LifeOS projection after the committed
   command and after reload.
2. The immediate undo restores the same goal/action identity or the same logical recurring series.
3. Trash lists every supported recoverable deletion with the correct local purge date and type.
4. Restore preserves supported content, state and relationships; series resume from today without
   duplicating completed or skipped history.
5. Manual purge is confirmed and makes the item non-restorable.
6. Automatic maintenance makes items non-restorable after 30 local calendar days and never purges
   legacy removed series without the migration grace period.
7. Delete, restore and purge synchronize without stale offline resurrection.
8. Legacy records without trash fields remain active; existing removed series receive a safe
   recovery window.
9. Dependency blocking remains atomic and explanatory; no orphan records are created.
10. Desktop and mobile interfaces meet the established LifeOS visual and accessibility contracts.
