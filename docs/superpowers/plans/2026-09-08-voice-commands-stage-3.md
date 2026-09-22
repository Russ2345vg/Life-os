# Voice Commands Stage 3 Implementation Plan

**Goal:** подключить естественные русские команды и безопасные уточнения к существующей палитре.
**Architecture:** interpreter без persistence; отдельные temporal/intent/normalizer модули;
controller хранит только transient draft и immutable target snapshot; app связывает операции.
**Tech Stack:** существующие TypeScript, React, Vitest, Playwright; без зависимостей.
**Spec:** [design](../../design/features/2026-09-08-voice-commands-stage-3.md).

- [x] Parsing: добавить NaturalRussianCommands.test.ts с вариациями порядка слов, датами,
      временем, ошибками и уточнениями; увидеть failures через test:target; разделить текущий
      RussianCommandInterpreter на IntentParser, temporal parsers, normalizer/clarification.
- [x] Controller: тесты missing fields, выбора из нескольких задач, отмены, stale async и
      одноразового confirm. Добавить transient clarification/selection state и registry resolver.
- [x] Wiring: расширить createVoiceCommandController и реальные integration tests. Использовать
      только найденные команды/queries; проверить отсутствие записи до confirm и conflict guard.
- [x] UI: расширить VoiceCommandPalette стандартной формой уточнения, списком результатов,
      target selection и preview изменений. Сохранить original transcript, микрофон и keyboard flow.
- [x] Voice E2E: fake provider, шесть приёмочных фраз, перенос, неоднозначность, отмена,
      desktop/mobile и console; inspect screenshots по правилу №38.
- [x] Review и финальные gate: targeted → relevant Voice E2E → verify → full E2E;
      git diff --check, review diff/status, отчёт с ограничениями и ручными шагами. Без commit/push.
