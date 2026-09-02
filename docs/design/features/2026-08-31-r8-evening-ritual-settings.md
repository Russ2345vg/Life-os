# R8 — Evening Ritual v2 Settings

## Status

- Design: `APPROVED`
- Implementation: `COMPLETE`
- Visual review: `REVIEWED`
- Lock: `UNLOCKED`

The user approved the R8 design contract on 2026-08-31. R8 is limited to persistent Evening
Ritual defaults and their existing Settings-page controls. R9 migration and compatibility work are
outside this stage.

## Scope classification

R8 extends the existing local settings document, Preparation environment catalog, Relaxation
initialization, late-evening reminder, and conscious skip policy. It does not create another
settings store, another Evening aggregate, a context rule engine, automatic preference learning,
or multiple notifications.

## Design contract

```text
FEATURE
→ Evening Ritual v2 settings

USER GOAL
→ Configure one reusable baseline evening ritual for every day

EXISTING LOGIC
→ BrowserLocalSettingsStore remains the only settings storage
→ PreparationPlan remains authoritative for the current preparation
→ RelaxationSnapshot remains authoritative for the current relaxation stage
→ EveningCycle commands remain the only mutation boundary

PAGE/COMPONENT ARCHETYPE
→ Existing Settings page with one Evening Ritual panel

SECTION COLOR
→ Graphite base, gold primary/selected, red only for validation errors

ATMOSPHERIC MOTIF
→ Existing quiet Settings surface; no new decorative motif

MAIN VISUAL CENTER
→ Baseline ritual controls and selection of three to six required items

COMPONENTS TO REUSE
→ Existing settings fields, toggles, action buttons, and environment item catalog

MOBILE BEHAVIOR
→ Single column, 44px controls, button-based ordering, no horizontal overflow

APPROVED REFERENCE
→ NO; the established Settings archetype covers this form

TEST SCOPE
→ Defaults, validation, backward-compatible persistence, reset/reload, removed item cleanup,
  Preparation/Relaxation/late reminder/skip application, and mobile render contract
```

## Settings contract

The default target sleep time is `23:00`. The required core contains the existing four recommended
environment items and must contain three to six unique active catalog keys. Reading is the default
relaxation practice. The normal screen-free duration defaults to 25 minutes and accepts integer
values from 20 through 30. Adaptive relaxation and conscious skip are enabled; the single in-app
late reminder is disabled.

Each catalog item stores a recommended integer duration from 1 through 60 minutes. Its position in
the settings list is its priority/order. Required/optional state is derived from membership in
`requiredCoreItems`. Unknown or removed item keys are discarded on load; if this leaves an invalid
required core, the safe default core is restored. New catalog items are appended with catalog
defaults.

## Ownership and persistence

`BrowserLocalSettingsStore` continues to own the single `lifeos.local-settings.v1` document. The
document gains a nested Evening Ritual value and remains tolerant of the previous four-field shape.
Business validation lives in Application-facing settings code; the browser store remains an app
adapter. No IndexedDB store or schema version changes are introduced.

Preparation reads settings when generating a new plan, applies the configured order and durations,
and initializes the required core once. Existing per-day core choices remain authoritative after
initialization. Relaxation uses the configured practice and screen-free duration; adaptive mode may
reuse only an explicitly saved prior default and never infers preferences automatically.

The configured sleep time drives the existing single late-evening offer. `notificationEnabled`
controls that one in-app reminder; it does not schedule operating-system notifications. The skip
command is rejected when `allowConsciousSkip` is false, and the UI does not offer it.

## Verification strategy

```text
targeted R8 tests
→ npm run verify
→ browser review at desktop and mobile widths
→ STOP
```

No R9 work or automatic full E2E run is included.
