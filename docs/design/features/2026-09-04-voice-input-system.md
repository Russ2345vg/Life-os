# LifeOS Voice Input System

## Status

- Design: APPROVED
- Implementation: NOT STARTED
- Visual review: PENDING
- Lock: UNLOCKED
- Approved by: LifeOS owner, 2026-09-04

This specification records the approved system design for ordinary speech-to-text dictation in
LifeOS. It is the source for the implementation plan. It does not approve a rendered visual result;
that requires browser review after implementation.

## Feature

LifeOS gains one reusable voice-input system for existing and future controlled text fields.
Users can start dictation from the field, speak in Russian by default, and insert the recognized
text at the current selection without changing the form's existing save, validation, routing, or
domain behavior.

This is an architectural feature rather than a collection of screen-specific microphone buttons.

## User goal

Enter ordinary human text by voice anywhere that dictation is useful, while retaining keyboard
editing and the exact behavior of the surrounding form.

## Non-goals

- Voice commands or intent parsing.
- Creating goals, decisions, actions, dates, priorities, or projects from natural-language
  commands.
- LLM, OpenAI API, paid speech services, or a LifeOS speech backend.
- Audio recording, audio persistence, transcript history, or analytics about dictation.
- A native Windows, Android, or cloud recognition engine in this stage.
- Redesigning forms or changing their domain/application contracts.
- Adding microphones to secrets, recovery material, identifiers intended to be pasted exactly,
  dates, times, numbers, passwords, PINs, selects, checkboxes, radio buttons, switches, sliders,
  range controls, file controls, color controls, or emoji/icon selectors.

## Existing logic and authoritative state

The audit found no shared Input, Textarea, endAdornment, or form-control abstraction. Presentation
currently renders native controlled input and textarea elements, plus a few local field wrappers.
Each field updates an existing draft through its current callback. Those drafts and their existing
application commands remain authoritative.

Voice input only produces another value for the same controlled callback:

~~~text
keyboard event ─┐
                ├─> existing controlled draft ─> existing validation ─> existing submit command
voice transcript ┘
~~~

The voice subsystem must never write a repository, domain entity, IndexedDB record, or application
form state directly. It must never submit a form.

## Audit summary

The source audit identified 87 logical voice-eligible fields across 26 presentation files and 53
intentional exclusions. Raw tag-search totals are not acceptance counts because they also include
tests, repeated local field abstractions, and utility/choice controls. The 87-field inventory below
is the implementation and review checklist.

Existing assets to reuse:

- src/presentation/components/AppIcon.tsx, extended with one shared outline microphone glyph so no
  field owns local SVG markup.
- src/presentation/styles/tokens.css for colors, spacing, radii, shadows, and motion.
- Existing icon-button, focus-visible, data-tooltip, role=status, role=alert, and aria-live
  conventions.
- Existing controlled value callbacks in every form.

No reusable Tooltip component exists. VoiceInputButton will reuse the established title plus
data-tooltip pattern rather than introduce a second tooltip system.

## Design contract

~~~text
FEATURE
→ One system-wide Voice Input capability

USER GOAL
→ Dictate ordinary text into the active field at its current selection

EXISTING LOGIC
→ Controlled React draft and existing application commands remain authoritative

PAGE/COMPONENT ARCHETYPE
→ Shared form control with an end-action rail; no new page

SECTION COLOR
→ Neutral graphite; gold for listening/current, green for brief success, red for error

MAIN VISUAL CENTER
→ Unchanged; the microphone remains a tertiary field action

COMPONENTS TO REUSE
→ AppIcon, tokens.css, focus, tooltip, inline status, and existing form callbacks

MOBILE BEHAVIOR
→ 44×44 px touch target, reserved inline space, no overlap or horizontal overflow

APPROVED REFERENCE
→ NO; the component is covered by the established LifeOS form-control language

TEST SCOPE
→ TDD for provider/coordinator/buffer/cursor logic, component contracts, affected form tests,
  deterministic Playwright coverage, desktop/mobile browser review, npm run verify:full
~~~

## Architecture

The approved dependency flow is:

~~~text
VoiceTextInput / VoiceTextArea / VoiceInputButton
                         │
                         ▼
           Presentation useVoiceInput
       cursor selection + controlled update
                         │
                         ▼
       Application VoiceInputCoordinator
          one active owner + state machine
                         │
                         ▼
 Application SpeechRecognitionProvider port
                         ▲
                         │
 Infrastructure BrowserSpeechRecognitionProvider
                         ▲
                         │
              App composition/provider
~~~

Domain, persistence, application commands, and read models do not change.

### Why the port belongs to Application

Speech recognition is replaceable platform capability. The application layer owns the
platform-neutral port; Infrastructure implements it; App selects the concrete implementation.
Presentation depends only on the port/coordinator types. No DOM, React, browser event, Window,
MediaStream, or vendor-prefixed type may escape the browser adapter.

### Why the coordinator belongs to Application

The invariant “at most one recognition session is active” is system-wide and must not be
duplicated in field hooks. The coordinator is a framework-neutral technical state machine similar
to the existing system-update coordinator. React projects its state but is not its source.

### Why Voice Input is not added to LifeOsApplication

LifeOsApplication is the aggregate for persisted LifeOS use cases. Dictation is transient UI input
and does not belong in its database-oriented constructor. A dedicated App-level provider creates
one voice runtime and publishes it through a Presentation-owned React context. This avoids both a
large prop fan-out and a Presentation-to-App dependency.

## Planned module boundaries

### Application

- src/application/ports/SpeechRecognitionProvider.ts
  - Platform-neutral provider, session, event, result, and error contracts.
- src/application/voice-input/VoiceInputCoordinator.ts
  - Single active-owner invariant, transcript buffer, state transitions, stop/cancel/release,
    stale-event suppression, and disposal.
- Focused barrel exports only where current repository conventions require them.

### Infrastructure

- src/infrastructure/voice-input/BrowserSpeechRecognitionProvider.ts
  - Runtime detection for SpeechRecognition and webkitSpeechRecognition.
  - Narrow internal Web Speech interfaces without any.
  - DOM event conversion into stable application events.
  - Idempotent handler cleanup, stop, cancel, and dispose.

### App

- src/app/composition/createVoiceInputRuntime.ts
  - Creates BrowserSpeechRecognitionProvider and VoiceInputCoordinator.
- src/app/providers/VoiceInputProvider.tsx
  - Owns one runtime for the mounted application, is React StrictMode-safe, and disposes it after
    the genuine final unmount.
  - Stores the runtime in a stable ref. Effect setup increments a generation; cleanup defers
    disposal by one microtask and disposes only when no StrictMode replay has advanced that
    generation. Runtime and session disposal remain idempotent.
- src/app/App.tsx
  - Adds the voice provider around the existing ApplicationShell without changing application
    startup.

### Presentation

- src/presentation/voice-input/VoiceInputContext.ts
  - Context and access hook containing application-owned coordinator types, not Infrastructure.
- src/presentation/voice-input/useVoiceInput.ts
  - Owner registration, state projection, session actions, success delivery, and unmount release.
- src/presentation/voice-input/insertVoiceTranscript.ts
  - Pure selection insertion and caret calculation.
- src/presentation/voice-input/VoiceInputButton.tsx
  - Button markup, icon, labels, tooltip, and state classes only.
- src/presentation/voice-input/VoiceTextControl.tsx
  - Shared internal action rail, selection capture, controlled update, ref/caret restoration, and
    maxLength behavior.
- src/presentation/voice-input/VoiceTextInput.tsx
  - Public controlled text/search input.
- src/presentation/voice-input/VoiceTextArea.tsx
  - Public controlled textarea.
- src/presentation/voice-input/voice-input.css
  - Token-based shared control layout and states.

### Tests

- Application coordinator tests with a deterministic fake provider.
- Browser provider contract tests with an injected fake constructor.
- Pure transcript/cursor tests.
- Static component contract tests.
- Existing form tests updated only where markup legitimately changes.
- tests/e2e/voice-input.acceptance.spec.ts using an init-script Web Speech fake, never a physical
  microphone.

These filenames, ownership boundaries, and dependency direction are fixed for the implementation
plan.

## SpeechRecognitionProvider contract

The port exposes capability and one session factory:

~~~ts
type SpeechRecognitionProviderEvent =
  | { readonly type: 'transcript'; readonly transcript: string; readonly isFinal: boolean }
  | { readonly type: 'ended' }
  | { readonly type: 'error'; readonly error: SpeechRecognitionFailure };

interface SpeechRecognitionStartRequest {
  readonly language: string;
  readonly onEvent: (event: SpeechRecognitionProviderEvent) => void;
}

interface SpeechRecognitionSession {
  stop(): void;
  cancel(): void;
  dispose(): void;
}

interface SpeechRecognitionProvider {
  isSupported(): boolean;
  start(request: SpeechRecognitionStartRequest): SpeechRecognitionSession;
}
~~~

The implementation retains these names and semantics:

- No DOM types cross the port.
- start occurs only after a user gesture.
- The coordinator reserves the active session identity and publishes listening before calling
  start. The provider never delivers an event synchronously before start returns; a synchronous
  browser failure is converted to a queued typed error and an inert disposable session.
- The returned session owns its browser listeners.
- stop requests a final result and moves the coordinator to processing.
- cancel discards the active unfinished recognition attempt.
- dispose is idempotent.
- Provider exceptions become typed failures and never escape to an event handler.

## Stable failure model

Browser-specific errors map to stable categories:

| Category | Meaning | User recovery |
| --- | --- | --- |
| permission-denied | Browser or OS denied microphone access | Enable microphone access in settings |
| microphone-unavailable | No usable capture device | Connect/check the microphone |
| no-speech | No usable speech result | Speak again |
| network | Recognition service could not be reached | Check connection and retry |
| service-unavailable | Browser recognition service is unavailable | Retry or continue typing |
| aborted | Session was intentionally or externally interrupted | Return to idle unless unexpected |
| unknown | Unexpected provider failure | Retry or continue typing |

Raw browser error codes may be retained only inside Infrastructure diagnostics. Presentation uses
short Russian copy in the form “what happened → what to do”.

## Browser provider behavior

- Detect SpeechRecognition and webkitSpeechRecognition at runtime.
- Never read either constructor at module evaluation time.
- Use request.language, defaulted by Presentation to ru-RU.
- Set interimResults=true and continuous=true for feedback and multi-phrase buffering.
- Translate results from event.resultIndex onward and preserve each result's isFinal marker.
- Do not automatically restart after the browser ends a session; the user explicitly starts every
  new session, avoiding permission loops and orphaned recognition objects.
- Do not call getUserMedia during application startup.
- Do not request permission before the microphone button is activated.
- Do not create or persist audio blobs.
- Release handlers and recognition resources on end, error, cancel, dispose, owner release, and
  application unmount.
- Treat standard and vendor-prefixed implementations identically at the port.

Browser speech engines may use a remote browser-vendor service. LifeOS must not claim that
recognition is fully local.

## VoiceInputCoordinator

### State

Voice input uses one discriminated union rather than independent booleans:

~~~ts
type VoiceInputState =
  | { readonly status: 'unsupported' }
  | { readonly status: 'idle' }
  | {
      readonly status: 'listening';
      readonly ownerId: string;
      readonly sessionId: number;
      readonly interimTranscript: string;
    }
  | {
      readonly status: 'processing';
      readonly ownerId: string;
      readonly sessionId: number;
    }
  | {
      readonly status: 'success';
      readonly ownerId: string;
      readonly sessionId: number;
      readonly transcript: string;
    }
  | {
      readonly status: 'error';
      readonly ownerId: string;
      readonly sessionId: number;
      readonly failure: SpeechRecognitionFailure;
    };
~~~

Starting and permission-prompt latency are represented by listening because recognition was
deliberately activated. The coordinator publishes listening immediately before provider start, and
the UI consistently announces “Слушаю…”. This label describes the active dictation attempt; it does
not claim that audio has already been captured.

### Transitions

~~~text
unsupported ───────────────────────────────────────────────> unsupported

idle ── start ──> listening
listening ── interim ──> listening
listening ── stop ──> processing
listening/processing ── final ──> same state with appended buffer
listening/processing ── end + non-empty final buffer ──> success
listening/processing ── end + empty final buffer ──> no-speech error
listening/processing ── provider error ──> error
listening/processing ── cancel/release ──> idle
success/error ── feedback reset/manual interaction/release ──> idle
success/error ── new start ──> listening
~~~

Final transcript events only append to the current session buffer and never terminate the state.
The matching ended event is the sole normal terminal event: a non-empty final buffer becomes success
and an empty final buffer becomes no-speech error. Events after that terminal transition are stale
and ignored. An ended event from an intentionally cancelled or superseded session is stale rather
than an error.

### One active owner

- Every mounted voice-enabled field has a unique ownerId.
- Starting owner B atomically cancels owner A before B receives a new session.
- A is projected back to idle and never receives B's transcript.
- Every provider event is tagged internally with a monotonically increasing sessionId.
- Events from any stale sessionId are ignored.
- stop, cancel, release, and dispose are idempotent.
- Releasing the active owner during unmount cancels recognition and removes subscribers.
- release(ownerId) returns every state owned by that owner, including success or error, to idle. If
  a provider session still exists, release also cancels and disposes it.

### Transcript buffer

- Interim transcript is replaceable feedback and is never committed to the form.
- Final chunks are appended exactly once in provider order.
- Empty/whitespace-only chunks are ignored.
- The complete normalized final buffer is delivered in success state.
- The field commits a sessionId at most once.
- Cancelling a session before success does not insert its buffer.

## Controlled field contract

VoiceTextInput and VoiceTextArea accept native attributes plus:

~~~ts
interface VoiceTextValueProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly voiceInput?: boolean;
  readonly voiceLanguage?: string;
  readonly endActions?: ReactNode;
}

type VoiceTextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> &
  VoiceTextValueProps & { readonly type?: 'text' | 'search' };

type VoiceTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange'
> &
  VoiceTextValueProps;
~~~

Contract details:

- value is required and controlled.
- onValueChange is the sole value-mutation callback and is called once for a genuine DOM change or
  once for a final voice commit. No synthetic DOM event is fabricated for dictation.
- Both components use forwardRef and preserve the caller's native control ref.
- voiceInput defaults to true.
- voiceInput=false suppresses the microphone and does not instantiate a session.
- voiceLanguage defaults to ru-RU.
- VoiceTextInput accepts only type=text or type=search. Email, tel, url, password, date/time,
  numeric, color, file, and other specialized inputs remain native controls and cannot accidentally
  opt in.
- Native disabled/readOnly state prevents recognition start.
- endActions uses one shared action rail so a future clear/password action cannot overlap the
  microphone.
- Existing external refs and native handlers other than the replaced value/onChange contract remain
  supported. Each migrated form moves any existing onChange side effect into onValueChange without
  changing its order relative to its current draft update.
- The microphone has type=button and never submits its parent form.

## Cursor and selection insertion

The pure insertion operation receives current value, transcript, selectionStart, selectionEnd, and
optional maxLength. It returns the next value and collapsed caret.

Rules:

1. Null selection defaults to the end of the current value.
2. Reversed or out-of-range positions are ordered and clamped.
3. An empty selection inserts at the caret.
4. A non-empty selection is replaced.
5. Existing text outside the selected range is never changed.
6. Leading/trailing transcript whitespace is removed and every internal whitespace run is
   normalized to one ordinary space.
7. Opening punctuation is `(`, `[`, `{`, `«`, `“`, or `„`. Closing punctuation is `.`, `,`, `!`,
   `?`, `;`, `:`, `…`, `)`, `]`, `}`, `»`, or `”`.
8. At the left boundary, add one space only when the prefix is non-empty, its final character is
   neither whitespace nor opening punctuation, and the transcript does not begin with closing
   punctuation.
9. At the right boundary, add one space only when the suffix is non-empty, its first character is
   neither whitespace nor closing punctuation, and the transcript does not end with opening
   punctuation.
10. Empty recognition output leaves value and caret unchanged.
11. maxLength never causes existing text to be removed. Only the insertable transcript portion is
    limited; if nothing fits, the value is unchanged and the UI reports that the field limit was
    reached.
12. After the controlled update is rendered, focus returns to the text control and the caret is
    restored immediately after the inserted text.

The component captures selection before button activation and maintains the latest known selection
from select, input, click, and keyboard interactions. Final insertion reads the latest controlled
value, not a value captured at recognition start.

## UI behavior

### Idle

- Compact outline microphone at the end of the field.
- Graphite/neutral presentation with a restrained gray-gold edge.
- Tooltip: “Голосовой ввод”.
- Accessible action name: “Начать голосовой ввод”.

### Listening

- Gold current-state accent and very soft pulse/activity mark.
- Tooltip: “Остановить запись”.
- Accessible action name: “Остановить голосовой ввод”.
- aria-live status announces “Слушаю…”.
- Repeated activation calls stop, not a second start.
- Escape while this owner is listening or processing cancels the attempt, preserves the controlled
  value, and returns the owner to idle. This applies only while focus is in that field's native
  control or microphone button; there is no global Escape listener. Internal handling runs first,
  then calls the control's caller-provided onKeyDown exactly once and never calls preventDefault or
  stopPropagation. Existing dialog/navigation Escape behavior therefore remains unchanged. Escape
  has no voice-input effect in other states.

### Processing

- Button remains stable and disabled against duplicate activation.
- Quiet progress treatment without layout shift.
- aria-live status announces “Распознаю речь…”.

### Success

- Brief green success treatment using existing motion tokens.
- Transcript has already entered the controlled draft.
- State returns to idle after the existing 600 ms feedback duration (`--motion-feedback`) or
  immediately on the next interaction.

The Presentation hook owns this feedback timer and calls reset(ownerId, sessionId). Both identifiers
must still match before reset can change state. The hook clears the timer on manual interaction,
new start, owner release, and unmount.

### Error

- Restrained red semantic accent without strong glow.
- Short inline role=alert message appears only for the affected field.
- Existing text remains editable.
- Manual user retry is allowed; no automatic permission loop occurs.
- A genuine manual edit clears that field's voice error before applying the typed value.

### Unsupported

- Microphone remains visibly unavailable so the capability is understandable.
- Tooltip and accessible name: “Голосовой ввод недоступен”.
- The focusable button uses aria-disabled rather than native disabled in this state, so keyboard and
  tooltip users can discover the explanation; activation is a no-op.
- Keyboard input remains fully functional.

## Visual language

- Component archetype: tertiary end action within an existing form control.
- No new page, modal, banner, or atmospheric motif.
- The page's existing main visual center remains unchanged.
- Neutral graphite is the resting state.
- Gold means current/listening.
- Green is only brief confirmed success.
- Red is only an error.
- No purple, neon, permanent glow, or decorative animation.
- All measurements use existing tokens. The minimum pointer/touch target is 44×44 px.
- The action rail reserves inline padding in the input/textarea; it never overlays entered text,
  clear actions, counters, or existing end actions.
- Textarea actions align to the top end; single-line actions remain vertically centered.
- Tooltip follows the existing dark transient pattern and works on hover and focus.

## Accessibility

- Native button with type=button.
- State-specific aria-label.
- aria-controls points to the associated input/textarea when an id exists.
- Visible focus-visible ring.
- Keyboard activation through Enter and Space; Escape cancellation follows the active-owner rule.
- aria-pressed while listening.
- aria-disabled for unsupported/processing/disabled states.
- Polite live announcements for listening, processing, and success.
- Error text uses role=alert and is programmatically associated with the control.
- State is conveyed by label, icon treatment, and text, never color alone.
- Reduced-motion mode removes pulse/scale movement while retaining the state indication.
- Existing label and aria-describedby relationships are preserved and extended rather than
  replaced.

The shared control derives a stable voice-message id from the native control id, or from React
useId when no id was supplied. While an error is present, that id is appended to the control's
existing aria-describedby tokens; it never replaces caller-provided descriptions.

## Responsive behavior

Required review viewports:

- Desktop: 1600×900 and 1280×720.
- Mobile: 390×844 and 360×800.

Constraints:

- No page-level horizontal overflow.
- The action rail stays inside the control width.
- Entered text and long placeholders do not run under the action.
- Existing counters and validation messages remain readable.
- Existing mobile CTA and safe-area behavior remains unchanged.
- The focused text field can be scrolled into view with the software keyboard.
- Touch target remains at least 44×44 px; visual icon may be smaller.

## Integration inventory

All voice-enabled migrations use VoiceTextInput, VoiceTextArea, or the same shared
VoiceTextControl primitive. No screen gets its own recognition implementation.

### Goals

src/presentation/goals/GoalForm.tsx:

- Goal title.
- Why important.
- Why now.
- Achievement criteria.
- Next progress.

Cover file input remains excluded.

### Projects and directions

src/presentation/management/ProjectsSection.tsx:

- Project title.
- Desired result.
- Description.

src/presentation/management/DirectionsSection.tsx:

- Direction and project titles.
- Descriptions.
- Strategic intent.
- Desired state.
- In-scope and out-of-scope text.
- Optional project title/result during strategic review.

Choice controls remain excluded.

### Decisions and actions

src/presentation/pages/DecisionCreationForm.tsx:

- Title, reason, expected result, price, sacrifices, and project reference.

src/presentation/pages/TodayPage.tsx:

- Inline decision title and expected result.

src/presentation/components/DecisionDetailsPanel.tsx:

- Decision and related action free-text edit/result/reason fields.

src/presentation/components/LifeActionDetailsPanel.tsx:

- Action title, description, expected result, session note, and actual result.

Date, select, and choice controls remain excluded.

### Journal and history

src/presentation/pages/HistoryPage.tsx:

- Search query.
- Corrected text value.
- Correction reason.

Search is intentionally included because the approved requirement explicitly includes search.

### Walks and capture

- src/presentation/walk/WalkCaptureComposer.tsx: new thought.
- src/presentation/walk/WalkCaptureDetails.tsx: edited thought.
- src/presentation/walk/WalkCompletionFlow.tsx: reflection.
- src/presentation/pages/WalksPage.tsx: walk result/reflection.
- src/presentation/walk/WalkSessionFlow.tsx: reflection question.

Rating, range, number, mode, and file controls remain excluded.

### Evening

- src/presentation/pages/EveningReflectionScene.tsx: correction, insight, and free answer.
- src/presentation/pages/EveningReviewPanel.tsx: reasons, notes, summary, reflection, result, and
  tomorrow text.
- src/presentation/pages/EveningSleepCheckScene.tsx: thought.
- src/presentation/pages/EveningResolvingScene.tsx: result note.
- src/presentation/pages/EveningAnalyticsPage.tsx: target outcome and first-action text.

Ratings, choices, dates, and selects remain excluded.

### Morning

- src/presentation/pages/MorningCenterPage.tsx: mood text.
- src/presentation/pages/MorningPhysicalActivationPage.tsx: custom exercise name.

Energy, clarity, measurement, repetition, and duration controls remain excluded.

### Tomorrow planning

- src/presentation/pages/TomorrowPlanningCenter.tsx: title, project reference, expected result,
  reason, price, and sacrifices.
- src/presentation/pages/TomorrowComposer.tsx: primary decision title/result, active outcome,
  first-action title/result, and supporting decision title.

Dates and selects remain excluded.

### Other supported text

- src/presentation/routine/RoutineBlockForm.tsx: routine title.
- src/presentation/pages/SpheresPage.tsx: sphere name and description.
- src/presentation/sync/SyncPage.tsx: ordinary device name.

Sphere emoji/icon and Sync recovery/manual pairing payloads remain excluded.

## Permission and capability handling

- Capability detection is read-only and does not trigger permission UI.
- The first microphone request can occur only inside a deliberate button action.
- Permission denial maps to error without clearing, replacing, or submitting the field.
- LifeOS never retries or reopens permission automatically.
- A user may retry manually after changing browser/OS settings.
- Unsupported environments remain keyboard-functional.
- Device absence, audio-capture errors, cancellation, interruption, service/network errors, and
  unexpected exceptions all terminate cleanly.

## Navigation and lifecycle

- Every field releases its owner in React cleanup.
- Releasing the active owner cancels the provider session, removes listeners, and prevents further
  draft updates.
- Route/page transitions require no speech-specific navigation hook; component unmount is the
  ownership boundary.
- Late callbacks after unmount, error, cancel, supersession, or application disposal are ignored by
  sessionId.
- StrictMode development remount must not leave the shared runtime permanently disposed or create
  simultaneous active sessions.
- App final unmount disposes the coordinator and current provider session.
- Outside VoiceInputProvider, including server/static rendering of an isolated form, the
  Presentation hook returns a stable unsupported no-op projection instead of throwing. The shared
  control therefore renders the discoverable disabled microphone state, while the real App always
  supplies the global runtime.

## Privacy and security

- No audio or transcript history is persisted by the voice subsystem.
- No microphone is active before a user starts dictation.
- No LifeOS backend receives audio.
- The UI makes no claim that browser recognition is local.
- Security-sensitive recovery/pairing material is excluded even though represented by textarea.
- A future cloud provider requires a separate privacy, consent, threat-model, and architecture
  review.

## Performance

- No recognition object, microphone stream, interval, or listener remains permanently active.
- The lightweight provider and coordinator are created with the App. A browser recognition engine
  and session are created only for an actual dictation attempt.
- One coordinator/context prevents per-field global subscriptions outside mounted controls.
- State publication is bounded to the active field and lightweight capability projection.
- No dependency is added.
- Shared CSS and AppIcon prevent duplicated assets and styling.

## Test strategy

Implementation follows strict red → green → refactor cycles.

### Pure insertion tests

- Empty value.
- End, beginning, and middle insertion.
- Selected-range replacement.
- Existing text preservation.
- Word/punctuation boundary spacing.
- Null, reversed, and out-of-range selections.
- Unicode/Cyrillic text.
- Empty transcript.
- maxLength partial/no-room behavior.
- Returned caret.

### Coordinator tests

- unsupported and initial idle.
- idle → listening.
- listening → processing.
- processing/listening → success.
- permission/error/no-speech states.
- stop and cancel.
- one active owner.
- superseding owner cancellation.
- final chunks do not mix between owners.
- stale late callbacks are ignored.
- release/unmount cancels active recognition.
- idempotent dispose.

### Browser adapter tests

- Standard constructor.
- webkit-prefixed constructor.
- Unsupported runtime.
- ru-RU/default language pass-through.
- Interim/final mapping.
- Browser error mapping.
- stop/cancel/dispose.
- Listener cleanup and late-event safety.
- Synchronous start exception.

### Component and form tests

- Button type, state labels, tooltip, aria attributes, and disabled behavior.
- Voice text primitives preserve native props and controlled updates.
- Microphone activation cannot submit a form.
- Manual typing and existing validation remain operational.
- Existing form markup/contracts are adjusted only for the shared control.
- Representative Goal, Decision, Project, Journal, Evening, Morning, Walk, Tomorrow, and Sync
  fields expose voice input; excluded fields do not.

### Deterministic E2E

tests/e2e/voice-input.acceptance.spec.ts injects a fake SpeechRecognition constructor before page
startup. It covers:

- Final transcript into an empty field.
- Cursor insertion into “Сегодня я пойду домой”.
- Selected-range replacement.
- Switching between two microphones.
- Permission-denied and unsupported behavior.
- Navigation/unmount cleanup and late callback.
- Keyboard activation, accessible names, and no accidental submit.
- Desktop/mobile layout, 44 px target, no overlap/overflow, and reduced motion.
- Browser console and page errors.

The test never grants a real microphone and is deterministic.

### Gates

During development:

~~~text
npm run test:target -- <changed test file>
npm run test:fast
npm run typecheck
npm run lint
~~~

After stabilization:

~~~text
npm run verify
npm run test:e2e
~~~

Because this changes browser interaction and desktop/mobile form layout, the final R10-equivalent
gate is:

~~~text
npm run verify:full
~~~

No command may be reported as passed unless it was run against the final source state.

## Manual QA

After automated checks, inspect the real application at the required desktop/mobile viewports and
check browser console/page errors.

Required scenarios:

1. Dictate “Это проверка голосового ввода” into an empty field.
2. Insert “после работы” after “я” in “Сегодня я пойду домой”.
3. Start one microphone, then another; only the second remains active.
4. Deny permission; the app remains usable and existing text is preserved.
5. Check narrow viewport, long placeholder, validation, focus, Enter, Escape, and submit.

Automated/browser-fake evidence does not prove a physical microphone, OS permission dialog, browser
vendor service, Tauri WebView, or Android WebView. Any scenario that cannot be exercised with real
audio must be reported as requiring user/device verification.

## Design-system documentation

LifeOS_DESIGN_RULES_v1.md already uses Rule №33 for accessibility and later repository guidance
refers to Rule №38 by number. The approved safe update is:

### Правило №33.1 — Голосовой ввод

It will document:

- Shared-system requirement for audited and future ordinary free-text/search fields that are not in
  the explicit exclusion list.
- Visual states and semantic colors.
- Provider abstraction and future adapters.
- Controlled insertion and cursor behavior.
- Accessibility, tooltip, focus, touch target, and reduced motion.
- Permission/error/unsupported behavior.
- Explicit excluded data types and security-sensitive fields.
- Requirement that future fields use the shared primitive instead of browser API or local voice
  buttons.

Rules 34–44 will not be renumbered.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Browser/WebView lacks Web Speech | Runtime feature detection and unsupported state |
| Browser vendor uses network speech service | No locality claim; stable network/service error |
| Permission denial loops | Start only from user gesture; no automatic retry |
| Transcript enters wrong field | Global active-owner invariant and sessionId filtering |
| Late event updates unmounted field | release cleanup plus generation guard |
| Interim text duplicates content | Commit only normalized final buffer |
| Button overlaps text/actions | Shared action rail and reserved padding |
| Existing form validation changes | Same controlled callback and existing submit path |
| StrictMode double lifecycle | StrictMode-safe App provider and idempotent disposal |
| Huge unrelated refactor | Only eligible controls migrate; non-text controls remain native |
| Dirty worktree absorbs unrelated edits | Main agent makes scoped patches and reviews scoped diffs |

## Definition of Done

- [ ] Application SpeechRecognitionProvider port exists without DOM/React types.
- [ ] One VoiceInputCoordinator enforces the active-session invariant.
- [ ] Browser provider implements feature detection, start, stop, cancel, cleanup, and error
      mapping.
- [ ] ru-RU is the configurable default.
- [ ] VoiceTextInput, VoiceTextArea, and VoiceInputButton are reusable.
- [ ] Cursor insertion, selection replacement, maxLength, and caret restoration work.
- [ ] Interim/final buffering cannot duplicate or destroy typed text.
- [ ] Permission, unsupported, no-speech, device, interruption, network, and unexpected errors are
      recoverable.
- [ ] Switching fields and page unmount cannot deliver a transcript to the wrong field.
- [ ] Eligible audited fields use the shared system.
- [ ] Excluded controls remain without microphones.
- [ ] Existing business logic, persistence, validation, routing, and data structures are unchanged.
- [ ] Accessibility and mobile requirements are met.
- [ ] Rule №33.1 is added without renumbering later rules.
- [ ] Targeted tests and npm run verify:full pass on the final source state.
- [ ] Browser QA covers desktop/mobile states and reports console results.
- [ ] Physical microphone/platform limitations are reported honestly.
