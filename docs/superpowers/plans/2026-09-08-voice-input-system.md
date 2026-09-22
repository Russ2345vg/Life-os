# Voice Input implementation plan

**Goal:** Единая диктовка в свободные текстовые поля без изменения бизнес-логики форм.

**Architecture:** Application owns SpeechRecognitionProvider and VoiceInputCoordinator;
Infrastructure implements the browser adapter; App composes a transient runtime;
Presentation owns shared controlled fields and cursor insertion.

**Tech stack:** Existing TypeScript, React, CSS tokens, Vitest and managed Playwright. No dependencies.

**Spec:** [Approved design](../../design/features/2026-09-04-voice-input-system.md).

## Constraints

- Work only in D:/LifeOS-App; preserve the dirty baseline recorded at intake.
- ru-RU by default, configurable language, no microphone permission before user activation.
- No domain/persistence/routing changes, backend, cloud service, voice commands, or audio storage.
- One active owner, final-only commits, stale-event suppression and idempotent cleanup.
- Preserve controlled callbacks, native handlers, cursor, selection, maxLength, validation and submit.
- Main agent implements; independent agents audit/review read-only. No commit or push requested.

## Execution

- [x] Audit current eligible controls against specification; record exclusions and layout risks.
- [x] Write insertion and coordinator behavior tests, observe failing targeted run, implement core.
      Files: application/ports/SpeechRecognitionProvider.ts, application/voice-input/VoiceInputCoordinator.ts,
      presentation/voice-input/insertVoiceTranscript.ts and colocated tests.
      Test cursor beginning/middle/end, selection, punctuation, limits; state transitions, final/interim
      buffering, owner switch, errors, release, stale events and exceptional providers.
- [x] Write browser adapter tests, observe failure, implement injected constructor detection,
      result-index deduplication, stable errors, stop/abort/cleanup, deferred synchronous failures.
      Files: infrastructure/voice-input/BrowserSpeechRecognitionProvider.ts and colocated test.
- [x] Write rendered contracts before shared UI and browser acceptance tests before form migration.
      Implement context/hook, VoiceInputButton, VoiceTextControl, VoiceTextInput, VoiceTextArea,
      voice-input.css, App provider/runtime and one shared AppIcon glyph.
      Same onValueChange callback handles typing/dictation; latest controlled value and selection win.
- [x] Migrate audited eligible native controls to shared primitives, preserving each callback body.
      Exclude numeric/date/choice/file controls, recovery/pairing data, exact identifiers and icon inputs.
- [x] Run targeted voice and affected form tests, then test:fast for the application contract.
- [x] Update design rule 33.1 and current inventory/evidence documentation.
- [x] Review desktop/mobile and keyboard/error states using real app with deterministic speech fake.
      Physical microphone and OS permissions need actual device evidence; never equate fake with audio QA.
- [x] Independent read-only final review; fix substantiated findings within scope.
- [x] One npm run verify, followed by full npm run test:e2e because shared browser interactions and
      responsive forms change. Record unrelated baseline failures separately, no unrelated repairs.
- [x] Inspect scoped diff, git diff --check and git status --short; report files, tests and limitations.

## Verification commands

```sh
npm run test:target -- src/application/voice-input/VoiceInputCoordinator.test.ts src/presentation/voice-input/insertVoiceTranscript.test.ts
npm run test:target -- src/infrastructure/voice-input/BrowserSpeechRecognitionProvider.test.ts src/presentation/voice-input/VoiceTextControl.test.tsx
npm run test:fast
npm run verify
npm run test:e2e
git diff --check
git status --short
```

## Execution evidence

2026-09-08: core red/green tests, field inventory and migration complete; 1498 fast tests,
3108 unit/integration tests and final npm run verify exit 0. Full E2E exit 0:
147 passed, 31 platform-specific skipped, 0 failed/flaky (178 total); all 12 voice cases passed.
Read-only architecture and final reviews found no remaining blockers. Physical microphone and
OS permission QA remain an explicitly reported device check; browser-fake evidence is separate.
