# R7 — Short / Skip Modes

## Status

- Design: `APPROVED`
- Implementation: `IN PROGRESS`
- Visual review: `PENDING`
- Lock: `UNLOCKED`

The user approved the R7 design contract on 2026-08-31. R7 is limited to an explicit late-evening
SHORT choice and a conscious SKIPPED completion. R8 settings are outside this scope.

## Scope classification

R7 adds two user scenarios to the existing Evening start screen. It reuses the current Evening
aggregate, application command boundary, repository, history, analytics, and Command Center. It does
not add another Evening engine, route, store, settings page, or conflicting mode enum.

## Design contract

```text
FEATURE
→ Explicit short evening and conscious full skip

USER GOAL
→ Preserve the required bedtime core when time is short, or record a deliberate no-ritual day

EXISTING LOGIC
→ EveningCycle remains authoritative
→ QUICK is the existing persisted short mode; lateNight is the existing reason
→ SKIPPED remains the existing completion outcome and maps legacy raw mode="SKIPPED" safely

PAGE/COMPONENT ARCHETYPE
→ Existing Evening Deep Focus NOT_STARTED scene plus a compact confirmation dialog

SECTION COLOR
→ Graphite base, gold for the recommended short action, neutral graphite for SKIPPED
→ Red remains reserved for actual errors; SKIPPED is never red

ATMOSPHERIC MOTIF
→ Calm late-evening compression without alarm or punishment

MAIN VISUAL CENTER
→ Late offer with two explicit choices, or one focused skip confirmation

COMPONENTS TO REUSE
→ Evening Command Center, existing cards/buttons, Preparation required core, Relaxation, Sleep Check

MOBILE BEHAVIOR
→ One-column choice buttons and dialog actions, no horizontal overflow

APPROVED REFERENCE
→ NO; the established NOT_STARTED and Deep Focus archetypes fully cover the change

TEST SCOPE
→ Threshold, both choices, confirmation/cancel, persistence, history, refresh, analytics, verify
```

## Behavior and state ownership

The late offer is computed from the latest non-skipped routine block whose category is `sleep`.
The threshold is 30 minutes. No configured target means no offer. At or below the threshold the UI
shows «До сна осталось N минут. Перейти в короткий режим?» and never changes mode automatically.

Choosing SHORT calls a focused application command that starts the existing cycle in `QUICK` with
the existing `lateNight` reason. Resolving, Reflection, and Tomorrow planning are recorded as safely
skipped because their required facts are not prerequisites for the remaining bedtime core. The path
is:

```text
required Environment core → hygiene → Relaxation 2–5 min → Sleep Check
```

Drink and screen-free work are omitted from QUICK readiness. Environment required-core validation,
hygiene, the selected practice, subjective ratings, Sleep Check answers, and final completion remain
real stored facts.

Choosing NORMAL calls the existing normal start command. Merely rendering the late offer performs
no mutation.

## SKIPPED contract

The skip dialog asks «Пропустить вечерний ритуал сегодня?» and provides `Пропустить` / `Отмена`.
The optional reason is trimmed and bounded by the existing aggregate limit. Confirming uses the
existing transactional day-completion command so Day and Evening remain consistent. Cancelling
creates no command.

Persistence stores the compatible raw representation:

```text
mode = "SKIPPED"
completion = "SKIPPED"
completedAt = timestamp
skipReason = optional string
```

The domain rehydrates this as the established normal mode plus `completion=SKIPPED`; therefore no
fourth operational mode is introduced. SKIPPED appears in history with timestamp/reason, but is
excluded from operational mode distribution, completion-rate denominators, and negative pattern
detection. It creates no penalty and is presented with neutral styling.

## Compatibility and non-goals

- NORMAL, QUICK, EMERGENCY/late, legacy records, and current recovery remain readable.
- The IndexedDB schema version and stores do not change; fields are additive.
- No R8 settings, notifications, automatic switching, fatigue detection, sleep tracking, migration,
  or new analytics subsystem.
- No new dependency or stack change.

## Verification strategy

```text
targeted R7 tests
→ npm run verify
→ STOP
```

The targeted set covers domain transitions, application commands, persistence round-trip and legacy,
routine-derived threshold, short Relaxation readiness, history, refresh projection, neutral
analytics, and static desktop/mobile/accessibility contracts.
