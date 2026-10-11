# Подтверждение будильника Android на обоих устройствах

> Execution: inline одним исполнителем, затем один итоговый read-only reviewer, согласно ранее выбранному пользователем методу. Required skill: superpowers:executing-plans.

**Goal:** Android сохраняет реальный ответ системного будильника через существующую синхронизацию; телефон и Windows показывают время проверки, актуальность ответа и следующее действие.

**Approved spec:** [android-alarm-confirmation](../../design/features/2026-10-10-android-alarm-confirmation.md).

**Architecture:** optional report в существующем `SleepScheduleState` / record schema v1. Application строит native schedule, проверяет ack и защищает запись от async race. Presentation читает факт и не создаёт его. Без новых зависимостей, server/native API, database stores или миграции версии.

**Scope:** только пункт 8; сохранить уже реализованные пункты 1–3 и 6. Текущая ветка и незакоммиченные изменения сохраняются. Выпуск, установка, push и изменение версии не входят в этот этап.

## Task 1 — единая проверка и сохранение настоящего ответа

Files: новые `src/domain/sleep/AndroidAlarmReport.ts`, `src/application/sleep/WakeAlarmConfirmation.ts` и `.test.ts`; существующие `SleepSchedule.ts`, `SleepScheduleService.ts` / `.test.ts`, `wakeManagementModel.ts`.

Interfaces:

- `AndroidAlarmReport`: source `ANDROID`, `checkedAt: Date`, `scheduleKey: string`, outcome `CONFIRMED | DISABLED | PERMISSION_REQUIRED | ERROR | NOT_CONFIRMED`, `acknowledgedSettingsVersion: number | null`, `nextOccurrenceId: string | null`, `nextScheduledAt: Date | null`. Не сохранять произвольный native message.
- `SleepScheduleState.androidAlarmReport?: AndroidAlarmReport`.
- `buildWakeAlarmSchedule(state: SleepScheduleState, now: Date): WakeAlarmSchedule | null` — общий построитель текущей команды из существующих правил.
- `wakeAlarmScheduleKey(state: SleepScheduleState, now: Date): string | null` — однозначный JSON key настроек version/updatedAt и всех полей команды, включая occurrence и suppression.
- `isWakeScheduleAcknowledged(state: SleepScheduleState, status: WakeAlarmStatus, now: Date): boolean` — перенос существующего правила в Application; Presentation переэкспортирует его для совместимости.
- `createAndroidAlarmReport(state, status, checkedAt): AndroidAlarmReport | null` — unsupported / отсутствие настроек не создают report. CONFIRMED требует supported SCHEDULED, всех трёх alarm permissions и точных version/ID/time. DISABLED требует выключенных настроек, READY, совпадающего ack и отсутствующего next signal. Остальные ответы дают соответствующее outcome.
- `isCurrentAndroidAlarmReport(state: SleepScheduleState, now: Date): boolean` — key совпадает; положительный outcome дополнительно проверяет version/ID/time против ожидаемой команды.

Steps:

1. RED tests общей проверки: успешный ack, каждое отсутствующее permission, неверные version/ID/time, disabled ack, изменение звука/quiet mode/разового подъёма, переход следующего occurrence.
2. Реализовать интерфейсы и заменить дублирование `#reconcileNative` и presentation ack общей проверкой.
3. RED service tests: `syncAlarm` записывает полученный supported report; Windows сохраняет прежний report; поздний ответ при изменении настроек не становится актуальным; ERROR / NOT_CONFIRMED заменяют прежний success; ошибка repository write отклоняет проверку, retry восстанавливает запись.
4. В `syncAlarm` после native reconcile атомарно обновлять report только если текущий key совпадает с проверенным. Время проверки — clock после получения ответа. Не добавлять telemetry write ко всем командам подготовки. Если native вызов отклонился после определения supported Android, сохранять outcome ERROR для проверенного key и показывать failure; unsupported вызов не создаёт Android-факт.
5. GREEN: `npm run test:target -- src/application/sleep/WakeAlarmConfirmation.test.ts src/application/sleep/SleepScheduleService.test.ts src/presentation/planner-v2/wakeManagementModel.test.ts`.

## Task 2 — совместимость storage и существующий sync

Files: `SleepScheduleRecord.ts`, `SleepScheduleRecordMapper.ts`, `SleepSchedulePersistence.test.ts`; новый `src/infrastructure/sync/pilot/SleepAlarmReportSync.test.ts`, существующие registry adapters / mutation recorder / sync store переиспользуются.

Interfaces: optional record `androidAlarmReport` с теми же полями и ISO строками вместо Date. Старые записи читаются без report. Некорректное необязательное report игнорируется, не ломая действующие настройки и циклы. CONFIRMED без валидных ack/ID/date, неизвестный source/outcome или невалидная дата не принимаются.

Steps:

1. RED persistence tests: Date round trip, повторное открытие, старая запись без поля, повреждённая telemetry при сохранных settings/cycles, rejected put и повторная попытка.
2. Добавить optional serialization / parsing; schemaVersion и database version не менять.
3. RED integration test: supported service сохраняет report в настоящем IndexedDB; включённый mutation recorder захватывает `sleep_schedule` payload; applyPulled в другой DB и load через production mapper сохраняют факт. Проверить stale report и последующий Windows `syncAlarm`, который не стирает report.
4. GREEN: targeted persistence + новый sync test. Не менять общую политику разрешения sync conflicts.

## Task 3 — status card на телефоне и Windows

Files: новые `src/presentation/planner-v2/sleep/androidAlarmReportModel.ts` / `.test.ts`; существующие `SleepPreparationPage.tsx` / `.test.tsx` и соответствующий текущий sleep CSS при необходимости.

Interface: `androidAlarmReportView(state: SleepScheduleState, now: Date, localStatus?: WakeAlarmStatus)` возвращает tone, label, checkedAt / nextSignal labels и nextAction. UI использует report отдельно от локального `WakeAlarmStatus`; native supported не подменяется на Windows. Текущий локальный ERROR или отсутствие разрешений имеют приоритет перед старым сохранённым success.

Steps:

1. RED read-model tests: текущий success, stale после изменения / следующего дня, disabled, permissions, error, not-confirmed, отсутствие report, время в timezone расписания. Старое подтверждение явно не зелёное.
2. Расширить существующий `AlarmStatusPanel`: «Телефон подтвердил будильник на HH:MM», дата сигнала, «Проверено на телефоне: …»; stale «Изменения ещё не подтверждены»; empty предлагает открыть LifeOS на Android, проверить статус и дождаться синхронизации. Failure имеет конкретное действие на телефоне. Время обозначает последний известный ответ, не присутствие телефона онлайн.
3. Сохранить реальные local permissions controls, пробный сигнал и подтверждение слышимости; не выдавать их за постановку расписания. Существующие labels обновить в тестах только где изменился согласованный смысл.
4. GREEN targeted view/page tests, typecheck. Существующий status card archetype и Graphite/Jade tokens, controls ≥44 px, keyboard focus и читабельный timestamp.

## Task 4 — ограниченный E2E, общий gate и итоговый review

Files: `tests/e2e/current.sleep-preparation.spec.ts` / `current.sleep-recording.spec.ts` только при соответствующем сценарии; отчёт `docs/codex/reports/2026-10-10-sleep-guide-and-alarm-confirmation.md`.

Steps:

1. Browser regression через production storage: Android report после capture/apply уже доказанного Task 2 читается Windows gateway; current/stale/permissions/error/empty, desktop/mobile. Проверить отсутствие console/page errors и overflow, touch targets, keyboard focus, reduced motion; сохранить screenshots и сравнить с текущим экраном.
2. `npm run test:fast`, затем один `npm run verify`: успешные exit 0 всех stages. Scoped `npm run test:e2e -- tests/e2e/current.sleep-preparation.spec.ts tests/e2e/current.sleep-recording.spec.ts`. Полный E2E не запускать без найденной межсценарной причины.
3. Один итоговый read-only reviewer проверяет пункты 6/8 и их интеграцию с 1–3. Исправления — только необходимые; повторять проверки лишь для затронутого кода / обнаруженной причины.
4. `git diff --check`, diff и status review. Отчёт: фактические checks, screenshots, ограничения native QA; сохранить текущую версию и накопленные изменения для будущего выпуска.

## Review Focus

В итоговом review найдено и исправлено обновление уже открытого экрана: `useSyncContentChanged('sleepSchedules')` перечитывает расписание и report без перезагрузки, откладывает чтение до окончания локальной команды и отменяет устаревший ответ. Первый ввод закрепляет дату, часовой пояс и автоматический режим формы; ручной выбор «Утро / Вечер» продолжает действовать. При подтверждении новой ночи `SleepObservationInput.timeZone?` передаёт исходный пояс черновика. Проверка использует production `applyPulled` в `tests/fixtures/sleep-alarm-sync.html` / `.tsx`, включая incoming ERROR и смену timezone при несохранённом вводе.

Integration test выбирает последний `sleep_schedule` payload по `revision`, а не по порядку UUID в IndexedDB `getAll()`. Обратные synthetic event IDs и фиксированные даты воспроизводят прежнюю ошибку выбора детерминированно.

Порт 4173 занят чужим preview приложения «Финансист». Scoped E2E используют временный wrapper `../artifacts/run-sleep-e2e.mjs` на 4185 через существующий `runManagedE2e` и `playwright.managed.config.ts`; сохранены deadlines, progress и cleanup собственных процессов. Команда: `node ../artifacts/run-sleep-e2e.mjs tests/e2e/current.sleep-preparation.spec.ts tests/e2e/current.sleep-recording.spec.ts`. Общая инфраструктура репозитория и чужой процесс не изменены.

- Поздний native ack после новых настроек: service race test Task 1.
- Старый success после permission failure: outcome overwrite + UI tests Tasks 1/3.
- Windows стирает Android факт: unsupported service + production sync integration Tasks 1/2.
- Повреждённый optional report блокирует будильник или даёт false success: mapper tests Task 2.
- Новый день / skip / wake override оставляет зелёный старый ack: identity + read-model/browser tests Tasks 1/3/4.

Физический Android и доставка при заблокированном экране — NOT RUN на этом этапе: нужны телефон и native сборка при общем выпуске. Browser/mobile и синтетический supported gateway не являются доказательством постановки на реальном телефоне.
