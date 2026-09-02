# R3 — Adaptive Reflection Flow

## Status

- Design: `APPROVED`
- Implementation: `COMPLETE`
- Visual QA: `COMPLETE`
- Final visual approval: `PENDING`
- Lock: `UNLOCKED`

The design contract was explicitly accepted by the user on 2026-08-30. The implementation passed
the R3 engineering gate and browser QA. The final visual result is not approved or locked yet.

## Feature

R3 changes the existing Evening Reflection flow into a short adaptive sequence: one persisted
question per screen and one quick answer at a time. This is a new user flow inside the existing
Reflection page, not a second Reflection engine, page, or state store.

## User goal

Complete a useful evening reflection in two to four quick answers without being asked for facts
LifeOS already knows. The next question may respond to the previous answer, while history remains a
stable record of the questions that were actually shown.

Normal Reflection contains two to four questions. Five is the absolute maximum. A genuine no-op day
may finish after one question when the answer makes further questioning unnecessary.

## Design contract

```text
FEATURE
→ Adaptive Reflection: one saved question per screen

USER GOAL
→ Understand the day in 2–4 quick answers without a long questionnaire or repeated known facts

EXISTING LOGIC
→ ReflectionEngine + ReflectionApplicationService + EveningCycle remain the only flow
→ Saved questions and answers remain the source of truth for history
→ TomorrowPlan changes only through a separate, user-confirmed command

PAGE/COMPONENT ARCHETYPE
→ Deep Focus guided flow using the existing 65/35 composition

SECTION COLOR
→ Routine amber; current/primary CTA is gold; completed state is green
→ Violet is reserved for a genuine insight, not used as a general accent

MAIN VISUAL CENTER
→ One current question with large quick-answer options

COMPONENTS TO REUSE
→ EveningReflectionScene
→ Existing question card and guidance panel
→ EveningVisualIcon
→ Existing primary/secondary controls and LifeOS tokens

MOBILE BEHAVIOR
→ One vertical flow
→ Question and answer options first, guidance below
→ CTA uses the available width
→ Touch targets are at least 44×44 px

APPROVED REFERENCE
→ YES: Evening_UI_Reference_for_Codex/02_reflection.png

TEST SCOPE
→ Successful day
→ Unfinished main Decision
→ Repeated carry-forward
→ No-op day
→ Conditional follow-up
→ Refresh/persistence
→ Completed history without regeneration
→ TomorrowPlan remains unchanged
→ Desktop/mobile render contracts
```

## Existing logic to preserve

- `EveningCycle` is the authoritative aggregate for Reflection state, saved questions, sequential
  results, and completion.
- `ReflectionEngine` remains the single question-selection policy.
- `ReflectionApplicationService` remains the application boundary for answering a question,
  persistence, signal creation, and progression.
- Saved `EveningCycle.reflectionQuestions` and reflection results are the only source for refresh and
  history. A completed or previously initialized session must not call question generation again.
- Existing optimistic persistence and application commands remain the only mutation path. React
  components do not mutate domain state.
- Existing legacy Reflection questions, answers, and histories remain readable in their stored
  order.
- `QUICK` mode keeps at most one critical question. `EMERGENCY` mode continues to skip Reflection.
- A Reflection answer must never mutate `TomorrowPlan` automatically. A signal, recommendation, or
  presentation suggestion may be produced, but applying a plan change requires explicit user
  confirmation through the existing plan boundary.

## Adaptive question model

### Baseline and follow-up selection

`ReflectionEngine.generate(context)` produces the initial baseline from known day context. The same
engine also owns a pure answer-dependent follow-up decision. This is an extension of the existing
engine, not a parallel decision tree service.

The baseline should normally lead to two to four answered questions. The engine must omit questions
whose answer is already present in authoritative LifeOS context. An answer-dependent follow-up is
inserted only when it adds information that is not already known. Baseline questions plus inserted
follow-ups can never exceed five persisted questions.

Question identifiers must be deterministic for the same cycle, parent question, and branch so that
retrying an application command cannot add a duplicate follow-up.

### Required scenarios

#### Successful day

1. `SINGLE_CHOICE`: what helped the day work.
2. `YES_NO`: whether the user wants to preserve that approach.

The second question is omitted when the first answer or known context makes it redundant.

#### Unfinished main Decision

1. `SINGLE_CHOICE`: the main reason it was not completed.
2. Conditional `SHORT_CAPTURE`: one concrete change, or a clarification when `OTHER` was selected.

The supported reasons are:

- too much scope;
- insufficient time;
- unclear next step;
- fatigue;
- distractions;
- changed priority;
- external circumstances;
- the Decision lost meaning;
- other.

The existing stored value `PRIORITY_LOST` remains valid; only its user-facing label may become
“changed priority”. `DISTRACTIONS` is additive. It may be persisted without inventing a new analytics
signal during R3.

#### Repeated carry-forward

1. `MULTI_CHOICE`: which reasons keep the Decision moving forward unfinished.
2. Conditional `SHORT_CAPTURE`: one concrete next adjustment.

The flow may expose an existing signal, recommendation, or suggestion, but must not apply it to
TomorrowPlan automatically.

#### No-op day

1. `YES_NO`: whether there is anything useful to capture from the day.
2. If yes, one `SHORT_CAPTURE`; if no, Reflection completes without padding the questionnaire.

### Answer types

R3 consumes the typed R2 contracts and does not create a second answer representation:

- `YES_NO` stores a boolean answer;
- `SINGLE_CHOICE` stores one option value;
- `MULTI_CHOICE` stores an array of option values;
- `SHORT_CAPTURE` stores a bounded short string;
- legacy question and answer kinds remain readable and renderable.

## Domain and transaction semantics

Answering the current question is one application transaction:

1. Validate that the submitted question is the current unanswered saved question.
2. Record the typed result in `EveningCycle`.
3. Let the existing `ReflectionEngine` evaluate one conditional follow-up from stable day context,
   the saved question, and its typed answer.
4. If present, insert the follow-up immediately after its answered parent and before the next
   baseline question.
5. Persist the updated cycle through the existing repository and concurrency contract.
6. Complete Reflection only when no saved unanswered question remains.

`EveningCycle` enforces the following invariants:

- Reflection can change only in the existing Reflection state;
- answers remain sequential;
- a follow-up has an already answered parent;
- insertion preserves all previously saved questions and answers;
- an identifier can occur only once;
- repeated command execution is idempotent;
- total saved questions never exceeds five;
- no follow-up is appended after Reflection completion.

If persistence fails, the UI remains on the same question and can retry the same application action.
It must not expose an unsaved generated question.

## Persistence and backward compatibility

No IndexedDB schema version bump is expected for R3. The existing EveningCycle record already stores
the ordered question and result arrays, and the R2 serialization contract supports boolean, string,
and string-array answers.

R3 may require additive mapper handling for the new `DISTRACTIONS` option or question metadata, but
not a destructive record rewrite. If implementation discovery proves the record shape cannot express
the parent/branch metadata needed for deterministic insertion, the plan must prefer derivation from
deterministic IDs; a schema migration requires a separate explicit justification before coding it.

Legacy cycles with a fixed saved question set continue their current sequential behavior. Loading,
refreshing, or opening history must never retrofit conditional questions into them.

## Section

Evening Routine → Reflection (“Осмысление”).

## Accent

Routine amber/gold marks the active step and primary action. Green is reserved for confirmed success
or completion. Red is reserved for errors or destructive meaning. Violet may appear only for a real
insight or recommendation.

## Atmosphere

Keep the restrained Evening atmosphere already established by the approved reference: dark graphite
base, low-intensity warm glow, strong content readability, and no decorative layer competing with the
question.

## Page archetype

Deep Focus guided flow using the existing 65/35 desktop composition. The left side contains the
current question and direct interaction; the right side contains contextual guidance or a real saved
insight. The flow does not add a new page archetype.

## Main visual center

The single current question and its large quick-answer choices. Progress and guidance are secondary;
navigation and decoration must not compete with the answer action.

## Layout

- Desktop: retain the existing 65/35 question/guidance composition.
- The question card contains the prompt, large answer choices, bounded short capture when required,
  progress, and one clear submit/continue action.
- Choices retain their position after selection; answered or selected items do not jump or disappear.
- Progress is derived only from the persisted sequence currently known to the cycle. Conditional
  insertion may increase the total once, without replacing earlier questions.
- History uses the existing read-only history composition and shows only stored asked questions and
  answers.

## Components to reuse

- `EveningReflectionScene` as the page-level scene.
- Existing Reflection question card and guidance panel.
- `EveningReviewPanel` as the presentation/controller boundary, extended with a typed local draft
  rather than parallel domain state.
- `EveningVisualIcon`, existing button patterns, focus styles, spacing, radius, typography, and color
  tokens.

The current component inventory covers the required composition. R3 must not introduce a duplicate
Reflection page, generic card system, choice control family, or separate history renderer.

## States

- Loading: preserve the existing page shell and main card geometry.
- Empty: only a legitimate no-question/completed condition; never manufacture a placeholder question.
- Error / retry: show an inline error associated with the current question and retry the same answer
  command.
- Success feedback: brief confirmation before rendering the next persisted question; avoid a blocking
  celebration between every question.
- Disabled: submission is disabled while no valid typed answer exists and while persistence is in
  flight.
- Interactive: clear default, hover, pressed, selected, and keyboard-focus states for every choice.
- Complete: use the existing Reflection completion path.
- History: read-only saved questions/results; engine invocation is forbidden.

## Mobile

- Collapse to one vertical flow: question and answers first, contextual guidance second.
- Primary action uses the available width and stays clear of bottom navigation/safe-area overlap.
- Choice rows and controls have touch targets of at least 44×44 px.
- No horizontal scrolling is allowed.
- Long option labels wrap without truncating meaning or changing choice order.
- Required validation viewports: 390×844 and 360×800, in addition to desktop 1600×900 and 1280×720.

## Accessibility

- All answer options are reachable and operable by keyboard.
- Single and multi choice expose correct selected semantics; yes/no is not encoded by color alone.
- Focus remains predictable after save: it moves to the new question heading or error summary.
- Error text identifies the failed action and is programmatically associated with the interactive
  area.
- Short capture has a visible label, bounded length, and validation message.
- Motion respects reduced-motion preferences; no essential information depends on animation.

## Approved references

- Required: `YES`
- Reference: `D:/LifeOS-App/Evening_UI_Reference_for_Codex/02_reflection.png`
- Approval owner: user
- Approval status: `APPROVED` for design direction; final implemented visual review remains `PENDING`
- Rationale: R3 changes a key guided interaction, and the reference defines the accepted 65/35
  composition, hierarchy, controls, and atmosphere.

## Business logic constraints

- No second Reflection engine, aggregate, repository, or history source.
- No automatic TomorrowPlan mutation.
- No R4 Environment, R5 Relaxation, R6 Sleep Check, or later-stage functionality.
- No analytics redesign. Existing signals/recommendations may be reused only when their semantics
  match the saved answer.
- No loss, regeneration, or reinterpretation of legacy records.
- No `any`; typed R2 answer contracts cross UI, application, domain, and mapper boundaries.
- No dependency additions or stack changes.

## Test scope

### Domain and application

- baseline count for ordinary, successful, unfinished, repeated carry-forward, and no-op contexts;
- absolute maximum of five persisted questions;
- answer-dependent follow-up selection and omission when redundant;
- deterministic/idempotent insertion immediately after the answered parent;
- sequential answering and completion after the last saved unanswered question;
- `QUICK` and `EMERGENCY` behavior remains unchanged;
- signals/recommendations remain semantically valid;
- TomorrowPlan repository/state remains unchanged after all Reflection answers;
- persistence failure and retry do not duplicate results or follow-ups.

### Persistence and history

- refresh resumes the first persisted unanswered question;
- typed boolean/string/string-array answers round-trip;
- legacy fixtures and fixed-question cycles still round-trip;
- completed history opens without calling `ReflectionEngine`;
- history renders the exact saved asked sequence, including an inserted follow-up;
- no IndexedDB version change unless separately justified by implementation evidence.

### Presentation and browser

- exactly one question is visible at a time;
- large controls support `YES_NO`, `SINGLE_CHOICE`, `MULTI_CHOICE`, and `SHORT_CAPTURE`;
- selected, disabled/submitting, inline error/retry, brief success, complete, and read-only history
  states;
- desktop 1600×900 and 1280×720;
- mobile 390×844 and 360×800;
- keyboard order, focus restoration, touch targets, wrapping, safe areas, and browser console;
- comparison with the approved reference and Rule 38 visual checklist.

### Stage gate

R3 follows the repository R2–R8 gate:

```text
targeted tests
→ npm run verify
→ STOP
```

The full E2E suite is not automatic. Real browser QA of the changed Reflection flow is required. A
full E2E run is allowed only if implementation changes a listed cross-cutting browser/navigation/
persistence contract and the reason is stated before running it.

## Definition of Done

- [x] Design contract defined before implementation.
- [x] Existing logic and authoritative state source documented.
- [x] Existing components and tokens identified; duplicates prohibited.
- [x] Written specification reviewed and accepted by the user.
- [x] Failing flow tests added before production implementation.
- [x] Successful, unfinished, repeated carry-forward, and no-op flows implemented.
- [x] Normal adaptive branches stay within two to four questions; absolute maximum is five.
- [x] History never regenerates questions.
- [x] TomorrowPlan remains unchanged without explicit confirmation.
- [x] Legacy Reflection records pass compatibility tests.
- [x] Required loading, error/retry, success, complete, and history states implemented.
- [x] Targeted tests and `npm run verify` pass.
- [x] Desktop/mobile browser and visual review complete.
- [x] Rule 38 and accessibility checks complete.
- [ ] Final visual result explicitly approved before `APPROVED`/`LOCKED` status.

## Verification evidence — 2026-08-30

- TDD red/green evidence was recorded for engine selection, aggregate follow-up insertion,
  application sequencing, persistence, typed presentation drafts, and the one-question scene.
- Targeted R3 regression: 8 files, 102 tests passed.
- `npm run verify`: typecheck, lint, 2,525 unit/integration tests, 55 infrastructure tests, alpha,
  build, format check, and `git diff --check` passed. Lint reported 11 pre-existing
  `react-refresh/only-export-components` warnings and no errors.
- Browser QA: desktop 1600×900 / 1280×720 and mobile 390×844 / 360×800; adaptive follow-up,
  refresh resume, completion, read-only history, mobile stacking, no horizontal overflow, and empty
  browser console were verified. Native button semantics and automated focus contracts cover keyboard operation;
  the in-app browser driver did not reliably dispatch keyboard activation during manual QA.
- Full Playwright/E2E was not run: R3 did not change routing, navigation state, IndexedDB schema,
  migration, startup/recovery, or the cross-stage Evening journey, so the R2–R8 stage gate requires
  targeted tests followed by `npm run verify` and stop.
