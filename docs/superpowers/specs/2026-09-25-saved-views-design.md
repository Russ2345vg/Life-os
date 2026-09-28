# LifeOS saved views

**Date:** 2026-09-25

**Status:** design approved in conversation; awaiting written-spec review

**Scope:** user-named, synchronized filter presets for goal and action lists; pinned access from Quick Access; optional synchronized default view

## Outcome

A LifeOS user can configure the existing goal or action list, save that configuration under a clear name, reopen it later from the list or Quick Access, and choose one saved view as the default for that section. Saved views store filter intent rather than copied results, so their contents stay current as goals and actions change. The same views and defaults synchronize across the user's devices.

This release applies to the existing list pages for goals and actions. It does not create saved calendar, kanban, tree, Today or focus layouts, and it does not turn saved views into shared team objects.

## Confirmed product decisions

- A saved view belongs to either goals or actions.
- The view stores current filters, search text and relevant ordering/period settings.
- Results are calculated from the authoritative goal/action data each time the view opens.
- The user explicitly saves changes; editing filters after opening a view remains temporary until `Сохранить изменения` is used.
- A saved view can be renamed, duplicated, pinned, unpinned and deleted.
- Pinned views appear in Quick Access before ordinary search results and remain available with an empty query.
- One saved view per section can be chosen as the synchronized default.
- An explicit URL, browser back/forward navigation or a direct item route wins over the default view.
- Deleting a saved view does not delete goals or actions and does not enter the entity trash.
- A saved view that references a deleted or missing goal, direction or sphere remains editable and reports the missing filter rather than silently changing its meaning.
- The first release has no sharing, collaborative ownership, icons, colors, nested folders or smart suggestions.

## Current system and reuse boundary

Goal filtering currently uses `GoalFilters` plus search and period state in `PlannerGoalList`. Action filtering uses `ActionView`, search, relation filters, overdue state and sort state in `PlannerActionList`. These values are presentation state and are lost when the user leaves the page.

Quick Access already owns a read-only catalog of current actions, goals, directions and spheres. It has no persistence contract for pins. Saved views extend its application-level result model rather than introducing a second command palette or a local-only pin store.

`BrowserLocalSettingsStore` is not sufficient for this feature because local storage cannot satisfy cross-device synchronization. Saved views therefore use a first-class Pilot entity and IndexedDB store. The default saved-view pointer belongs to the existing synchronized meaningful-settings record, so another device opens the same default after sync.

The feature reuses the current filter controls and list components. It does not duplicate filter evaluation in persistence or store result ids.

## User experience

### Saving a view

The goal and action filter areas gain `Сохранить представление`. It is enabled when the current configuration differs from the unspecialized list and can also save a non-empty search by itself.

The save dialog contains:

- required name, maximum 80 characters;
- a read-only summary of stored criteria;
- `Закрепить в быстром доступе` checkbox;
- `Сделать представлением по умолчанию` checkbox;
- primary `Сохранить` and secondary `Отмена` actions.

The name is unique within the same target after trim and Russian case folding. A conflicting name produces an inline error and keeps the dialog open. A view with the same name may exist in the other section.

After save, the URL identifies the saved view and the header shows its name. A status notification confirms the save. The list continues to show live results from the current data.

### Opening and editing

The goal/action list header adds a saved-view selector. Its first option is `Без сохранённого представления`, followed by pinned views and then other views alphabetically. Selecting a view applies all stored criteria in one state transition and updates the URL.

Changing a filter, period, search or ordering after opening a saved view marks the header `Есть несохранённые изменения`. The available actions are:

- `Сохранить изменения` — update the current saved view;
- `Сохранить как новое` — create a separate view;
- `Сбросить` — restore the last saved configuration.

Navigating away with unsaved view criteria does not require a destructive warning because no domain data is at risk. Returning through browser history restores the URL-selected saved view, not the temporary edits.

### Management

The selector's row menu supports rename, duplicate, pin/unpin, make/remove default and delete. Delete requires a compact confirmation naming the view because it changes synchronized personalization. The confirmation explicitly states that goals/actions remain unchanged.

Deleting the current view returns the list to its ordinary default filters. If it was the section default, the synchronized default pointer is cleared atomically with the removal. If another device has already deleted the view, the current page shows `Представление больше недоступно` and offers `Открыть обычный список`; it never applies a stale cached definition silently.

### Quick Access

Pinned saved views appear in a dedicated `Представления` group when Quick Access opens, including with an empty query. Each item shows its name and the neutral context `Цели` or `Действия`. Search matches the view name and a human-readable summary of its criteria.

Opening a pinned view navigates to the goal or action list with its `savedViewId`. It does not execute or mutate domain data. If a pinned view was removed on another device, the catalog omits it after refresh; a stale click receives the same recoverable unavailable state as a direct URL.

### Default behavior

The user can set one default saved view for goals and one for actions. Opening the bare route `#/v2/goals` or `#/v2/actions` from navigation resolves the synchronized default after application data is ready. Direct routes with `savedViewId`, entity-detail routes, explicit filter query parameters and browser history entries do not get replaced by the default.

If the default pointer refers to a missing/deleted/incompatible view, LifeOS clears the invalid pointer through the settings command, opens the ordinary list and shows a non-blocking notice. Startup is never blocked by a broken default.

## UI design contract

```text
FEATURE → saved and pinned goal/action list views
USER GOAL → return to useful filter combinations without rebuilding them
EXISTING LOGIC → PlannerGoalList/PlannerActionList filter state, semantic periods, Quick Access
PAGE/COMPONENT ARCHETYPE → existing catalog list with selector and standard modal/menu
SECTION COLOR → current warm theme with jade for selection/save and red only for delete/error
ATMOSPHERIC MOTIF → compact personal workspace controls within the graphite surface
MAIN VISUAL CENTER → unchanged goal/action result list; saved-view name is contextual chrome
COMPONENTS TO REUSE → filter panels, PlannerWorkspace shell, EntityContextMenu, dialog, status notice, Quick Access groups
MOBILE BEHAVIOR → selector occupies one compact row; management stays in menu; filter summary wraps below
APPROVED REFERENCE → YES; current “Единая рабочая поверхность” direction and live list baseline
TEST SCOPE → domain/application, persistence/sync, route/history, list UI, Quick Access and desktop/mobile E2E
```

This is a standard extension of existing list pages and does not require a unique visual mockup. The result list remains the main visual center. The control uses existing typography, radii, surfaces and focus treatment. Pin state is communicated by icon plus label/accessible name, never color alone.

On mobile the selector and its menu remain available without forcing all saved-view actions into the page header. Long names truncate visually but remain fully available to assistive technology and in the management dialog.

## Domain model

Saved-view filter types belong to Domain or Application and must not import presentation types.

```ts
type SavedViewTarget = 'goals' | 'actions';

interface SavedViewBase {
  readonly id: EntityId;
  readonly title: string;
  readonly pinned: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly removedAt: Date | null;
  readonly version: number;
}

type SavedView = SavedViewBase &
  (
    | { readonly target: 'goals'; readonly definition: GoalSavedViewDefinition }
    | { readonly target: 'actions'; readonly definition: ActionSavedViewDefinition }
  );
```

`GoalSavedViewDefinition` contains normalized equivalents of status/show-completed, unassigned, undated, sphere, direction, importance, horizon, focus, semantic period and search. `ActionSavedViewDefinition` contains action view, search, goal/direction/sphere, overdue-only and sort.

The semantic period value (`year`, `quarter`, `thirty_days`, `week`, `none` or `all`) is stored, not a generated period id. Therefore `На этой неделе` continues to mean the current week when reopened later.

Domain operations validate title length/normalization, target-compatible definitions, pin state and lifecycle:

- `create`;
- `rename`;
- `replaceDefinition`;
- `pin` / `unpin`;
- `duplicate` through the application service with a new id;
- `remove` as a versioned soft removal for sync convergence.

Removed saved views are excluded from every active catalog and are not restorable in the user-facing trash in this release. Their records remain long enough for normal Pilot tombstone/removal convergence, then follow existing cleanup policy.

## Application services and ports

Add `SavedViews` as the write service and `SavedViewCatalog` as the read service:

- `create(input)`;
- `updateDefinition(id, definition)`;
- `rename(id, title)`;
- `duplicate(id, title)`;
- `setPinned(id, pinned)`;
- `setDefault(target, id | null)`;
- `remove(id)`;
- `get(id)`;
- `list(target)`;
- `listPinned()`.

The repository persists the entity and exposes active versus raw reads explicitly. The service uses `Clock` and `IdGenerator`, validates referenced filter ids through read ports, and writes each mutation through the Pilot mutation recorder.

Optional relationship ids in saved definitions do not create delete blockers for goals, directions or spheres. A later missing relation is represented as an unresolved criterion. This keeps entity deletion independent from personalization and lets the user repair or remove the view.

The filter evaluator remains in the existing list-model boundary. Presentation converts the persisted application definition into the current model's input shape through pure adapters. This avoids coupling Domain to React while retaining one source for actual filter behavior.

## Routing and state precedence

Goal and action routes gain optional `savedViewId` query state:

```text
#/v2/goals?savedViewId=<id>
#/v2/actions?savedViewId=<id>
```

Route parsing and building must round-trip encoded ids and preserve compatible existing parameters. State precedence is:

1. explicit detail/new route;
2. explicit `savedViewId` in URL;
3. explicit filter parameters already represented in the URL;
4. synchronized section default on a bare list route;
5. ordinary initial filter state.

The UI waits for `SavedViewCatalog.get(savedViewId)` before applying the definition. It renders bounded loading rather than briefly showing unfiltered results. An unknown, removed or target-mismatched id produces a recoverable unavailable state and does not silently fall back.

Browser back/forward derives view selection from the route. Applying a definition occurs as one reducer/state transition so intermediate filter combinations are not rendered or announced.

## Persistence and synchronization

Add a `savedViews` object store in the next IndexedDB version with key `id` and useful indexes for `target`, `pinned` and `removedAt`. Existing databases upgrade additively; no existing records are rewritten.

Register `saved_view` with the Pilot registry, structured identity, record mapper, snapshot manifest, account recovery and local-data cleanup. Create/update/pin/remove are ordinary versioned upserts until existing cleanup policy creates or retains the necessary tombstone. Conflict resolution follows current version/HLC semantics; a later accepted mutation wins.

The synchronized meaningful-settings record gains nullable `defaultGoalSavedViewId` and `defaultActionSavedViewId`. `setDefault` updates that record through its existing synchronization service. Removing a default view and clearing its pointer must be one application-level operation; if the persistence infrastructure cannot span both stores and outbox atomically, the service clears the pointer first and treats stale pointers as recoverable on every read.

Saved definitions are versioned. Version 1 contains the fields listed in this specification. Mappers reject unknown targets and malformed structures, while absent newly added optional fields use safe defaults. Future definition versions require an explicit migration rather than best-effort interpretation.

## Failure handling and concurrency

- Create/update success is shown only after the IndexedDB transaction and outbox record commit.
- Replaying an already committed command does not create a duplicate entity.
- Two devices renaming or editing one view converge through existing Pilot version/HLC rules.
- If another device removes the current view, the next catalog refresh shows the unavailable state and offers the ordinary list.
- If a referenced entity disappears, the view remains and reports the missing criterion; other valid criteria still apply only after the user confirms an edit. It does not silently broaden results.
- A failed default resolution never blocks application startup.
- Quick Access treats a saved-view reader error as an error state, not an empty pinned group.
- Duplicate names caused by concurrent offline creation are resolved deterministically after sync by retaining both records and showing a disambiguating target-neutral creation date until the user renames one; data is not dropped.

## Accessibility

- The saved-view selector has an accessible name containing the section.
- Current selection and unsaved state are exposed in text, not only color or an icon.
- Pin/unpin and default actions include the view title in their accessible names.
- Save and management dialogs trap focus, support Escape and return focus to their trigger.
- Status messages use `role=status`; validation and unavailable errors use `role=alert`.
- Quick Access identifies each result as `Представление` plus its target.
- Keyboard users can open, select and manage views without entering the result list.

## Testing strategy

Domain tests cover normalization, target definitions, rename, update, pin, removal, versioning and legacy/default decoding. Application tests cover uniqueness, duplication, unresolved relation behavior, default cleanup, idempotency and read ordering.

Persistence tests cover the IndexedDB upgrade, store indexes, mapper round trips, atomic outbox writes and database reopen. Sync tests cover cross-device create/update/remove, conflict ordering, snapshots, recovery and synchronized default pointers.

Presentation tests cover route round trips, precedence, loading/unavailable states, atomic application of criteria, unsaved changes, reset/save-as, management actions and Quick Access grouping. Scoped E2E covers save/open/update/duplicate/delete, pinning, empty-query Quick Access, defaults, reload, back/forward, another-device removal simulation, desktop and mobile keyboard behavior.

`npm run verify` is required before handoff. The shared IndexedDB schema and sync registry change only one new entity family and additive settings fields; begin with targeted migration/sync tests and scoped E2E. Run the full E2E suite only if implementation changes common routing/startup/recovery behavior beyond these isolated contracts or scoped checks reveal an unclear cross-flow regression.

## Rollout and migration

The IndexedDB migration adds an empty `savedViews` store. Existing users start with no saved views and null defaults. Current list behavior remains unchanged until a view is created or a default is selected.

The feature can ship without importing local ad hoc filter state because none is currently persistent. If sync is unavailable, local saved views continue to work and enter the existing outbox for later delivery. If the running application reads a future unsupported definition version, it shows the view as unavailable with a clear update message rather than applying partial criteria.

## Acceptance criteria

- A user can save the current goal or action list configuration under a valid unique name.
- Reopening the view after data changes recalculates results from current authoritative records.
- Temporary edits are visible and are not persisted until explicit save.
- Rename, duplicate, pin/unpin, default and delete work and synchronize.
- Pinned views appear in Quick Access with an empty query and navigate to the correct route.
- Bare list routes apply the synchronized section default; explicit routes and history take precedence.
- Missing referenced entities and removed views produce recoverable states without silently broadening filters.
- Existing users and databases retain current list behavior after the additive migration.
- Desktop and mobile layouts, keyboard navigation, focus restoration and announcements pass scoped browser verification.
