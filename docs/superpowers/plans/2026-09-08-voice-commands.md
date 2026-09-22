# План этапа 2 — голосовые команды

**Goal:** безопасно исполнять понятные русские команды через application layer.

**Architecture:** заменяемый interpreter выдаёт unknown; validator строит известное намерение;
registry выполняет только подключённую команду. Controller владеет preview и одноразовым
подтверждением. App связывает бизнес-операции, Presentation отображает состояние.

**Tech Stack:** существующий TypeScript/React/Vitest/Playwright, без новых зависимостей.

**Spec:** [Голосовые команды](../../design/features/2026-09-08-voice-commands.md).

## Ограничения

Главный агент — единственный автор. Существующие незакоммиченные изменения сохраняются.
Никаких прямых записей из interpreter/executor в persistence, удаления, фонового прослушивания,
внешней модели или сохранения аудио. Предметные расширения зависят от ответа пользователя.

## 1. Независимый командный фундамент

Files: `src/application/voice-commands/CommandSchema.ts`, `CommandValidator.ts`,
`CommandInterpreter.ts`, `RussianCommandInterpreter.ts`, `CommandRegistry.ts`,
`VoiceCommandController.ts` и соседние тесты.

- [x] Проверить намерения шести типов и отказ неизвестным полям/операциям.
- [x] Проверить относительные календарные даты, русские названия месяцев и неверные даты.
- [x] Проверить отсутствие выполнения до подтверждения и выполнение navigate/search сразу.
- [x] Проверить отмену, замену preview, stale async result, повторный confirm и исключение.
- [x] Реализовать минимальный независимый от persistence слой.
- [x] Запустить `npm run test:target -- src/application/voice-commands/VoiceCommands.test.ts`.

Основные интерфейсы: `CommandInterpreter.interpret(text, currentDate): Promise<unknown>`;
`validateCommand(value: unknown)`; `VoiceCommandController.submit(text)`, `cancel()`,
`confirm(revision)`, `getSnapshot()`, `subscribe(listener)`.

## 2. Предметное подключение: задачи, цели и навигация

- [x] Зафиксировать выбранный пользователем scope в specification.
- [x] Добавить интеграционные проверки фактической записи только после confirm.
- [x] Связать registry через App composition с существующими application-командами.
- [x] App composition: `createVoiceCommandController.ts` связывает существующие команды.
- [x] Registry проверяет предметные ограничения до preview; CreateDecisionForDate получает
      opt-in запрет автоматического переноса подтверждённой даты (прежние вызовы без изменений).
- [x] Заметки, свободный дневник и точные сроки целей остаются неподключёнными.

## 3. Палитра и приёмка

- [x] Подключить стандартную палитру к ApplicationShell и общему Voice Input.
- [x] `VoiceCommandPalette.tsx` отвечает за transient UI; App связывает навигацию и обновление
      видимых данных после записи; shell view предоставляет глобальную кнопку.
- [x] E2E использует существующий SpeechFake, проверяет запись/отмену/ошибки/навигацию.
- [x] Проверить ввод, preview, исправление, подтверждение, отмену, ошибки и навигацию.
- [x] Проверить desktop/mobile, focus, Escape, reduced motion, отсутствие console errors.
- [x] Выполнить test:fast → verify → test:e2e при UI/navigation integration.
- [x] Независимый read-only review, diff check, итог с фактическими ограничениями.

Commit/push не входят в план без соответствующего разрешения пользователя.
