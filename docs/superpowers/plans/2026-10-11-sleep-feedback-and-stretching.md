# Sleep Feedback and Stretching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserved execution method: one inline implementer, then one independent read-only final reviewer.

**Goal:** Добавить утреннюю оценку сна и самочувствия, сохранённый таймер только для выбранной растяжки и время начала вечерней подготовки по одному общему бюджету.

**Architecture:** Расширить существующие SleepObservation и SleepScheduleState необязательными полями. Domain валидирует значения и рассчитывает начало; Application сохраняет через существующие очереди/атомарные repository-команды. Presentation переиспользует текущую страницу сна, историю, controls и guide; существующие codecs и production sync передают новые поля.

**Tech Stack:** TypeScript, React 19, существующие IndexedDB repositories/pilot sync, Vitest/fake-indexeddb, managed Playwright. Без новых зависимостей.

**Spec:** [Утверждённый дизайн от 11.10.2026](../../design/features/2026-10-11-sleep-feedback-and-stretching.md).

## Global Constraints

- Страница `/#/v2/sleep`; накопленные пункты 1–3, 6 и 8, пользовательские пункты и ручные времена сохраняются.
- Версия 1.0.44. Без commit, push, выпуска, установки, native-сборки и изменения release/config/scripts. Прежний dirty baseline сохраняется; этот этап накапливает изменения.
- Качество сна: «Хорошо», «Средне», «Плохо»; самочувствие: «Бодр», «Нормально», «Устал». Оценки независимы, необязательны и не подтверждают часы сна.
- Общее время подготовки, включая растяжку: исходно 30 минут, целые 1–180. Растяжка: исходно 10 минут, целые 1–120. При выбранном пункте общий бюджет не меньше растяжки.
- Выбор растяжки по ID существующего включённого пункта; без угадывания названия, добавления пункта и переписывания старых NightCycle snapshots.
- Таймер только выбранной растяжки; окончание не отмечает DONE. Отсчёт временный, длительность сохраняется и синхронизируется.
- Начало = NightCycle.plannedSleepAt минус общий бюджет; растяжка второй раз не прибавляется. Полные даты, часовой пояс расписания.
- Preferences не меняют SleepSettings.version/updatedAt и не обесценивают актуальный Android alarm report. Native AlarmManager, напоминания и автопилот не меняются.
- Record schema v1, database version и sync entity types `sleep_observation` / `sleep_schedule` сохраняются. Без stores, endpoints, зависимостей и изменений общего sync transport.
- Graphite/Jade, текущие planner controls, ≥44×44 для controls, keyboard/focus/reduced motion, без horizontal overflow. References: `../artifacts/sleep-guide-qa/`, `../artifacts/sleep-quick-entry-qa/` относительно repo.
- Targeted TDD → test:fast → один итоговый verify; scoped sleep E2E в обоих существующих проектах. Полный E2E не требуется без нового основания из AGENTS.md.

## Review Focus

1. Быстрые последовательные оценки/ошибка записи: второй выбор не теряет первый, retry не создаёт дубль и не стирает времена — Task 1 и Task 4.
2. Будущая дата при другом timezone и dirty-форма при sync: оценка не записывается в будущее и не перемонтирует несохранённый ввод — Task 1 и Task 4.
3. Переименование, отключение или удаление выбранной растяжки: ссылка стабильна по ID, недоступная требует выбора, исторический snapshot не меняется — Task 2 и Task 5.
4. Старый/повреждённый optional payload и порядок outbox UUID: основная ночь читается, оценки не выдумываются, последняя revision действительно переносится — Task 3.
5. Отбой после полуночи, перевод timezone, завершённая подготовка и native acknowledgement: начало соответствует полной дате, общий бюджет считается один раз, завершённый вечер не зовёт начать снова, подтверждение будильника сохраняется — Task 2 и Task 5.

---

## File map

- Domain: создать `src/domain/sleep/SleepMorningFeedback.ts` и `SleepPreparationTiming.ts` с тестами; расширить `SleepObservation.ts`/тест и `SleepSchedule.ts`/тест. Types и самостоятельная валидация — в новых небольших файлах; преобразование существующих aggregates — рядом с существующими командами.
- Application: изменить `src/application/sleep/SleepObservationService.ts`/тест и `SleepScheduleService.ts`/тест, сохраняя repository ports.
- Persistence: расширить `src/infrastructure/persistence/records/SleepObservationRecord.ts`, `SleepScheduleRecord.ts`, соответствующие mappers и существующие `SleepObservationPersistence.test.ts`/`SleepSchedulePersistence.test.ts`.
- Sync: создать `src/infrastructure/sync/pilot/SleepFeedbackTimingSync.test.ts`, опираясь на production capture/apply/reopen из `SleepAlarmReportSync.test.ts`; общий transport/registry не менять.
- Morning UI: создать `src/presentation/planner-v2/sleep/SleepMorningFeedback.tsx`/тест и `sleepMorningFeedbackModel.ts`/тест; изменить `SleepObservationChart.tsx`/тест, `sleep-observations.css`, `SleepPreparationPage.tsx`/тест.
- Evening UI: создать `src/presentation/planner-v2/sleep/SleepPreparationTiming.tsx`/тест; изменить `SleepPreparationGuide.tsx`/тест, `sleep-preparation-guide.css`, `SleepPreparationPage.tsx`/тест. Существующие timer functions/model остаются источником старт/пауза/продолжение/сброс.
- Browser evidence: расширить `tests/e2e/current.sleep-recording.spec.ts` и `current.sleep-preparation.spec.ts`; при необходимости дополнить существующий production fixture `tests/fixtures/sleep-alarm-sync.tsx` для входящего feedback/timing sync. Отчёт: `docs/codex/reports/2026-10-11-sleep-feedback-and-stretching.md`.

### Task 1: Утренние оценки в Domain и Application

**Interfaces:**

- `SleepMorningFeedback` в новом domain-файле: readonly `sleepQuality: 'GOOD' | 'OK' | 'POOR' | null`, `energy: 'ENERGETIC' | 'OK' | 'TIRED' | null`, `recordedAt: Date`.
- `SleepMorningFeedbackPatch`: readonly optional `sleepQuality: 'GOOD' | 'OK' | 'POOR'`, `energy: 'ENERGETIC' | 'OK' | 'TIRED'`; пустой patch запрещён.
- `validateSleepMorningFeedback(feedback: SleepMorningFeedback): void`.
- `SleepObservation.morningFeedback?: SleepMorningFeedback`.
- В `SleepObservation.ts`: `setSleepMorningFeedback(previous: SleepObservation | null, input: { id: string; cycleDate: string; nightCycleId: string | null; timeZone: string; patch: SleepMorningFeedbackPatch; now: Date }): SleepObservation`; `clearSleepMorningFeedback(observation: SleepObservation, now: Date): SleepObservation`.
- В service: `setMorningFeedback(input: { cycleDate: string; timeZone?: string; feedback: SleepMorningFeedbackPatch }): Promise<SleepObservation>` и `clearMorningFeedback(cycleDate: string): Promise<SleepObservation | null>`.

- [x] **Step 1 — RED tests.** В `SleepMorningFeedback.test.ts`, `SleepObservation.test.ts`, `SleepObservationService.test.ts` добавить: `partial feedback remains independent and does not confirm sleep` (GOOD/null, затем GOOD/TIRED; все времена, confirmedAt и wakeSource null); `rejects empty and invalid feedback`; `rejects future wake date in the observation timezone`; `clear preserves night identity and times`; `feedback survives confirm, revise, both manual marks and alarm prefill`; `queued choices preserve both fields`; `failed put can retry without duplicate`. Зафиксировать ID `sleep-observation:2026-10-10`, неизменность createdAt/существующего timezone и confirmed-only statistics. Сброс отсутствующей записи возвращает null без создания записи.
- [x] **Step 2 — подтвердить RED.** `npm run test:target -- src/domain/sleep/SleepMorningFeedback.test.ts src/domain/sleep/SleepObservation.test.ts src/application/sleep/SleepObservationService.test.ts`. Ожидается FAIL именно новых отсутствующих контрактов/assertions, не failure среды.
- [x] **Step 3 — реализовать domain-контракты.** Создать type/validator; добавить optional field и две команды observation. Patch меняет только заданный выбор, сохраняет другой; новая запись использует null times/source/confirmation и исходные ID/cycle/timezone. Сброс удаляет поле, не удаляет наблюдение. Валидация будущего подъёма использует cycleDate + 1 календарный день против местной даты `now` в timezone наблюдения; переиспользовать DayDate и `resolveSleepCycleDate(now, timeZone, '00:00')`, без зависимости Domain от Presentation. Explicit projections confirm/manual draft обязаны переносить feedback; revise/native merge сохраняют его.
- [x] **Step 4 — реализовать service-команды.** Использовать существующую `mutate` queue, чтение existing observation/schedule и canonical `observationId`. Приоритет timezone: existing → input → schedule → existing local fallback. Перед save применять domain validation; исключение put пробрасывается, очередь восстанавливается. Не подтверждать ночь и не менять alarm results.
- [x] **Step 5 — GREEN.** Повторить команду Step 2; все старые и новые выбранные тесты PASS. Изучить только свой diff, сохранить изменения без commit согласно Global Constraints.

### Task 2: Общий бюджет времени и стабильная растяжка

**Interfaces:**

- `SleepPreparationTiming`: readonly `totalPreparationMinutes: number`, `stretchingItemId: string | null`, `stretchingMinutes: number`.
- В `SleepPreparationTiming.ts`: `defaultSleepPreparationTiming(): SleepPreparationTiming`, `validateSleepPreparationTiming(timing: SleepPreparationTiming): void`, `calculatePreparationStart(plannedSleepAt: Date, totalPreparationMinutes: number): Date`, `resolveStretchingItem(timing: SleepPreparationTiming, items: readonly SleepPreparationItem[]): SleepPreparationItem | null`.
- `SleepScheduleState.preparationTiming?: SleepPreparationTiming`.
- В `SleepSchedule.ts`: `setSleepPreparationTiming(state: SleepScheduleState, timing: SleepPreparationTiming): SleepScheduleState`.
- В service: `savePreparationTiming(timing: SleepPreparationTiming): Promise<SleepScheduleState>`.

- [x] **Step 1 — RED tests.** В новых domain-тестах и `SleepSchedule.test.ts`/`SleepScheduleService.test.ts`: defaults 30/null/10; границы 1–180 и 1–120 включительно, запрет дроби/NaN/пустого ID; выбранная растяжка 31 при total30 отвергается; total30/stretch10 даёт отбой23:00 → начало22:30. Проверить `2026-10-11 00:10 Asia/Chita` минус30 → `2026-10-10 23:40 Asia/Chita`, отдельный другой timezone и неизменность исходной Date. Save допускает только существующий enabled item; rename сохраняет binding, delete/disable возвращают null из resolver и не переписывают snapshots. После save неизменны settings.version/updatedAt, wakeOccurrences и androidAlarmReport; `isCurrentAndroidAlarmReport` остаётся true, native gateway не вызывается.
- [x] **Step 2 — подтвердить RED.** `npm run test:target -- src/domain/sleep/SleepPreparationTiming.test.ts src/domain/sleep/SleepSchedule.test.ts src/application/sleep/SleepScheduleService.test.ts`. Ожидается FAIL новых timing-контрактов.
- [x] **Step 3 — реализовать domain.** Defaults и диапазоны из Global Constraints. Codec-level validation проверяет значения, но допускает исторически отсутствующий binding; aggregate save отдельно проверяет актуальный enabled catalog. Использовать существующий `changed` для state.version, сохранять settings/native report/snapshots. `calculatePreparationStart` вычитает `totalPreparationMinutes * 60_000` из полной Date, без прибавления stretchingMinutes. Resolver возвращает null для deleted/disabled item; не угадывает имя.
- [x] **Step 4 — реализовать Application.** `savePreparationTiming` через существующий `repository.update(current => ...)`, валидируя актуальный catalog внутри атомарной мутации. Без rebuild schedule и reconcileNative; возвращает сохранённый state, при ошибке не показывает success.
- [x] **Step 5 — GREEN.** Повторить Step 2; PASS, включая native acknowledgement и snapshot assertions. Сохранить diff без commit.

### Task 3: Совместимость хранения и реальная передача optional fields

**Interfaces:** Существующие `SleepObservationRecordMapper.toRecord/fromRecord`, `SleepScheduleRecordMapper.toRecord/fromRecord`, repositories и production pilot capture/apply; типы Tasks 1–2. `recordedAt` в record — ISO string; Domain — Date. Вход из storage — unknown, без any/cast вместо проверки.

- [x] **Step 1 — RED persistence tests.** В существующих persistence suites проверить roundtrip partial feedback и timing; old records без optional fields; неверные enum/оба null/невалидная recordedAt; некорректный timing range/total меньше выбранной растяжки. Повреждённое optional поле игнорируется целиком, основные времена/settings остаются читаемыми; неизвестный ID валидного timing остаётся для UI-состояния «выберите пункт». Save/clear/reopen подтверждают отсутствие поля после сброса, schemaVersion1 и неизменную database version.
- [x] **Step 2 — RED production sync test.** Новый `SleepFeedbackTimingSync.test.ts`: два независимых IDBFactory, реальные repositories/services и configured mutation capture/registry; создать feedback-only ночь, обновить второй выбор, сохранить timing, взять latest payload **по revision**, applyPulled на второе устройство и reopen. Проверить две оценки, ISO→Date, null times/confirmation, saved30/10/binding; подтвердить времена после переноса и снова сохранить feedback. Затем clear и новый payload убирают feedback на втором устройстве. Синтетические фиксированные clock/IDs, event IDs в обратном порядке; не inline-имитация codec/transport и не реальные аккаунты.
- [x] **Step 3 — подтвердить RED.** `npm run test:target -- src/infrastructure/persistence/SleepObservationPersistence.test.ts src/infrastructure/persistence/SleepSchedulePersistence.test.ts src/infrastructure/sync/pilot/SleepFeedbackTimingSync.test.ts`. Ожидается FAIL roundtrip/capture новых полей.
- [x] **Step 4 — расширить только два records/mappers.** Записывать optional fields, читать через отдельную guarded validation и domain validators. Ошибка optional данных не поглощает ошибку обязательной основной записи. Новых stores/schema/registry/server изменений нет; existing payload целиком использует расширенные record codecs.
- [x] **Step 5 — GREEN.** Повторить Step 3; PASS и прежний `SleepAlarmReportSync.test.ts` через отдельный targeted selector. Сохранить diff без commit.

### Task 4: Утренняя карточка и текстовые оценки в истории

**Interfaces:**

- `sleepMorningFeedbackModel.ts`: `morningFeedbackLabels(feedback: SleepMorningFeedback | undefined): { sleepQuality: string | null; energy: string | null }`; текст только из approved enum mapping, не продолжительности.
- `SleepMorningFeedback` component props: `feedback: SleepMorningFeedback | undefined`, `busy: boolean`, `disabledReason: string | null`, `status: string | null`, `error: string | null`, `onSelect: (patch: SleepMorningFeedbackPatch) => void`, `onClear: () => void`, `onRetry: () => void`.
- Page вызывает Task 1 service, используя выбранные observationCycleDate/observationTimeZone и существующую history reload; chart принимает прежний observations prop.

- [x] **Step 1 — RED render/model tests.** В новых model/component suites и `SleepObservationChart.test.tsx`/`SleepPreparationPage.test.tsx`: обе независимые группы, aria-pressed, точные шесть подписей, unset-neutral; pending/saved/error+retry/reset; disabled с пояснением при dirty/future; history содержит обе оценки у правильной даты и «Время сна не записано» при null times, без fact bar/actual duration. Проверить частичную оценку и различение subjective labels от подтверждённых часов.
- [x] **Step 2 — RED browser coverage.** Добавить в `current.sleep-recording.spec.ts` сценарии: оценка без времён → два выбора → смена даты/reload/history → clear; ошибка одного put и retry; dirty HH:mm и входящий sync сохраняют дату/timezone/режим/поля, кнопки оценок disabled до save/reset, затем вновь доступны. Использовать existing failure injection/production fixture; не запускать новый общий сервер/transport.
- [x] **Step 3 — подтвердить RED.** `npm run test:target -- src/presentation/planner-v2/sleep/sleepMorningFeedbackModel.test.ts src/presentation/planner-v2/sleep/SleepMorningFeedback.test.tsx src/presentation/planner-v2/sleep/SleepObservationChart.test.tsx src/presentation/planner-v2/SleepPreparationPage.test.tsx`. Новые render/model assertions FAIL. Новые E2E RED запускать только с их grep, managed lifecycle, без полного старого suite.
- [x] **Step 4 — реализовать UI.** Две native button groups в существующем утреннем потоке рядом с form, heading «Как прошла ночь?». Parent владеет async command/status/retry последнего неуспешного patch; сериализация/busy и dirtyRef запрещают повтор до сохранения, UI не пишет IndexedDB. History reload обновляет feedback без уничтожения manual draft. History text виден на desktop/mobile в существующем списке, schema confirmed chart не меняется. Loading/read error не показывают неподтверждённый success. Reset убирает обе оценки, остаётся вторичным действием.
- [x] **Step 5 — GREEN.** Повторить Step 3 и scoped новые recording E2E в desktop-chrome/mobile-chrome. Сохранить diff без commit.

### Task 5: Настройки времени, начало вечера и таймер только растяжки

**Interfaces:**

- `SleepPreparationTiming` component props: `timing: SleepPreparationTiming`, `items: readonly SleepPreparationItem[]`, `plannedSleepAt: Date | null`, `timeZone: string`, `now: Date`, `completed: boolean`, `busy: boolean`, `error: string | null`, `onSave: (timing: SleepPreparationTiming) => void`. Component использует domain helpers Task 2; null plannedSleepAt предлагает настроить расписание без выдуманного начала.
- `SleepPreparationGuide` сохраняет текущие props и добавляет `stretchingItemId: string | null`, `stretchingMinutes: number`; Page передаёт только binding, разрешённый текущим enabled catalog. Таймер дополнительно требует совпадение current snapshot.id.
- `SleepPreparationStepTimer` получает `minutes: number`; `PreparationTimer` и start/pause/resume/remaining functions прежние. Inline общий editor минут убирается: длительность меняется в timing settings.

- [x] **Step 1 — RED component tests.** В новом `SleepPreparationTiming.test.tsx`, guide/page suites: defaults, total field «Общее время подготовки, включая растяжку», settings «Настроить время», enabled-item select без автопривязки, invalid/saving/error/retry, renamed item с тем же ID, unavailable item hint; start23:00−30=22:30, crossing date label, completed без повторного призыва. Только выбранный current item имеет timer10:00, обычный шаг его не имеет.
- [x] **Step 2 — обновить browser expectations и добавить RED.** В `current.sleep-preparation.spec.ts` существующий timer/guide сценарий перевести на **явно созданную и выбранную растяжку** с сохранёнными2 минутами; сохранить прежние assertions pause/resume/expired-not-DONE/focus/progress/reload. Добавить отсутствие timer на room/bed/water, reset/выход сбрасывает отсчёт, saved duration переживает reload, удалённая/disabled растяжка не назначается другому шагу. Timing save30/10 переносит начало на22:30, отбой00:10 показывает предыдущую дату23:40; актуальный Android proof не меняется.
- [x] **Step 3 — подтвердить RED.** `npm run test:target -- src/presentation/planner-v2/sleep/SleepPreparationTiming.test.tsx src/presentation/planner-v2/sleep/SleepPreparationGuide.test.tsx src/presentation/planner-v2/SleepPreparationPage.test.tsx`. Ожидается FAIL новых expectations; новые E2E — только по grep, не весь suite.
- [x] **Step 4 — реализовать настройки/информацию.** Компактная строка рядом с вечерним checklist: начало/отбой/общие минуты и раскрываемая форма с total, select существующего пункта, stretching duration. Native поля с label/error association; invalid/disabled/save-error states. Parent вызывает Task 2 service и обновляет state после успеха. Начало от текущего вечернего cycle/planned fallback `calculateNightWindow`, форматирование в расписании timezone, дата видна при переходе. После времени начала и пока вечер не завершён — предложение начать; completed включает завершение с пропусками/skip, без повторного призыва. Не менять расписание Today/autopilot/native reminders.
- [x] **Step 5 — ограничить guide timer.** Показывать только на совпавшем snapshot.id и валидном catalog binding. Сохранённые минуты — вход timer; key учитывает ID и длительность для сброса при смене настроек. Start/pause/resume/reset и transient cleanup переиспользуют модель, окончание только status. Другие шаги сохраняют «Готово — следующий», focus и прогресс. No binding/unavailable → спокойное пояснение и доступ к настройкам, без создания пункта.
- [x] **Step 6 — GREEN.** Повторить Step 3, существующие `sleepPreparationGuideModel.test.ts` и scoped новые preparation E2E в обоих проектах. Сохранить diff без commit.

### Task 6: Итоговая проверка дельты и один независимый review

**Evidence:** `../artifacts/sleep-feedback-qa/` относительно repo; desktop-chrome1440×900 / mobile-chrome390×844 из действующего playwright config. Отчёт содержит фактические результаты, exit codes и пути screenshots, не предполагаемые PASS.

- [x] **Step 1 — self-review.** Сверить собственный diff с утверждённым spec, сохранностью dirty baseline, field ownership, no extra deps/any, five Review Focus cases; проверить effective CSS cascade и Design Rule38. Форматировать только изменённые файлы bounded Prettier, не весь repo. Выполнить `git diff --check`.
- [x] **Step 2 — общий контракт.** `npm run test:fast` → PASS, exit0. Он нужен из-за изменений domain/application/records. Диагностировать failure по конкретному тесту, не повторять весь gate без влияющей правки.
- [x] **Step 3 — final scoped browser run.** `npm run test:e2e -- tests/e2e/current.sleep-recording.spec.ts tests/e2e/current.sleep-preparation.spec.ts --project desktop-chrome --project mobile-chrome` → все selected tests PASS, без unexplained skips/page/console errors и overflow. Сохранить снимки morning partial/no-times/error/dirty, evening settings/midnight/guide-stretch/completed; keyboard/focus, ≥44×44, reduced motion. Сравнить с references из Global Constraints, новые панели — с approved UI contract. Не ослаблять существующие assertions ради результата.
- [x] **Step 4 — один canonical gate.** `npm run verify` → exit0: typecheck, lint, full unit/integration, infra, alpha, build:vite, format:check, git diff --check. Отдельно повторять уже входящие этапы не требуется. Чужой4173/4174 не останавливать: при занятости использовать прежний локальный `../artifacts/run-sleep-e2e.mjs` на4185 с тем же managed runner/config/deadlines и selectors; shared scripts не менять. Tests при sandbox temp-rename EPERM запускать через разрешённую эскалацию bounded wrapper, не считать ошибку среды RED.
- [x] **Step 5 — один final read-only review.** Прочитать requesting-code-review skill, передать reviewer approved spec/plan, точные изменённые файлы/dirty baseline и свежие evidence; запрещены запись, собственные gate/servers и несвязанный аудит. Закрыть обоснованные findings самим; после влияющей правки повторить только нужные targeted/scoped checks и утративший актуальность gate. Смена reviewer/отчёт не требуют повторного verify.
- [x] **Step 6 — отчёт и остановка.** Создать `docs/codex/reports/2026-10-11-sleep-feedback-and-stretching.md`, отметить spec/plan tasks по реальному выполнению. Проверить format/docs links, `git diff --check`, `git status --short`. Указать отсутствие physical Android/native проверки: общие source flows проверены mobile browser, физическое устройство относится к будущему выпуску. Без commit/push/release/install; сообщить пользователю расположение новых функций и ожидаемый следующий общий выпуск.

## Plan self-review

- Spec coverage: утренние независимые оценки/даты/reset/preservation — Tasks1/4; timing/binding/native-proof invariants — Task2; codecs/compatibility/sync — Task3; evening guide/info/settings — Task5; UI evidence/gates/report — Task6.
- Interfaces согласованы: morningFeedback и preparationTiming optional в aggregate; record даты ISO; UI не владеет storage; signatures/props у последующих Tasks совпадают с владельцами.
- Каждый из пяти Review Focus закреплён конкретными RED assertions в owning task; будущая дата, broken optional, queued retry, missing item, midnight и native acknowledgement не оставлены общим «проверить edge cases».
- План не расширяет scope на автопилот, медитацию, медицинские выводы, системные напоминания или выпуск. Existing guide timer tests адаптируются под новый approved scope с сохранением поведения pause/focus/progress/no-auto-DONE.
- Статус: план утверждён пользователем 11.10.2026 и выполнен inline одним исполнителем. Один независимый read-only review завершён; замечание цвета ошибки закрыто через RED → GREEN. Финальный `verify` после правки: PASS, exit 0. Результаты и ограничения — [отчёт реализации](../../codex/reports/2026-10-11-sleep-feedback-and-stretching.md). Изменения накоплены без commit/push/release/install.
