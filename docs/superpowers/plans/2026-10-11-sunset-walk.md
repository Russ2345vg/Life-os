# Прогулка перед закатом — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Выбирать город, показывать начало связанных прогулок за 15 минут до расчётного заката и получать напоминание на Windows/Android после закрытия LifeOS.

**Architecture:** Один чистый TypeScript-расчёт NOAA/Meeus разрешает дату города в абсолютные моменты заката и прогулки. Application строит общий read model для экранов и сохраняемый календарь на 400 дней; Android AlarmManager и Windows Task Scheduler доставляют уведомления без WebView. Город хранится локально на каждом устройстве: существующий формат синхронизации старых клиентов удаляет неизвестные поля, поэтому новый формат сервера в эту задачу не включается.

**Tech Stack:** Текущие React/TypeScript, IndexedDB, Tauri/Rust, Android/Kotlin; Windows COM/WinRT bindings. Новые JS-библиотеки и серверные сервисы не нужны; прямая Windows-зависимость `windows = 0.61.3` нужна для системных Task Scheduler/Toast APIs, эта версия уже присутствует транзитивно в Cargo.lock.

**Spec:** [Утверждённый дизайн](../../design/features/2026-10-11-sunset-walk.md).

Статус: APPROVED пользователем; реализация и проверки завершены 12.10.2026. Фактические результаты и оставшаяся ручная platform QA — в [отчёте](../../../artifacts/visual-qa/sunset-walk/README.md). Сохраняется ранее выбранный способ: главный агент реализует сам, один итоговый независимый read-only review. База: `77e35d354ec00d0b91d3b0e9031bc7aa775b87bd`, ветка `codex/batched-updates-20261010`.

## Global Constraints

- Встроенный default: Борзя, Забайкальский край, Россия; Open-Meteo ID `2026126`, latitude `50.39138`, longitude `116.53355`, timezone `Asia/Chita`. Не путать с Борзей в Амурской области (`6779633`).
- Начало и уведомление ровно на 15 минут раньше отображаемого до минуты расчётного заката. Длительность прогулки и фактическая история сохраняются.
- Правило и reminders включены по умолчанию для связанных планов; доставка возможна при существующих OS permissions. Отсутствие разрешения, backend или реального receipt означает неподтверждённый статус, UI предлагает разрешить уведомления явным действием.
- Город и включение напоминаний локальны устройству; weekly walk preferences продолжают существующую зашифрованную синхронизацию без изменения payload. UI сообщает: «Город настроен на этом устройстве».
- Покрытие уведомлений — сегодня и следующие 399 дат города. Открытие приложения или смена настройки продлевает его. Windows ежедневно пополняет ближайшую очередь из сохранённой таблицы, Android ставит следующий сигнал после предыдущего/boot; по истечении 400 дней требуется открыть LifeOS. Этот срок показывается в статусе, бессрочная доставка не заявляется.
- Не переносить встречи молча, не искать прогулки по подстроке названия, не менять sleep alarms, DND, архив/завершённые действия и текст заметок.
- Все изменения в активном LifeOS worktree; сохранять dirty baseline. Не выпускать, не устанавливать приложение и не менять живой Supabase в рамках реализации без соответствующей команды пользователя.
- Проверки по `AGENTS.md`/`TEST_MATRIX.md`: scoped тесты, один общий `verify`, один итоговый review. Полный E2E только при документированном дополнительном основании.

## Review Focus

1. Две одноимённые Борзи и устаревший ответ поиска: выбор конкретного региона не перезаписывается поздним ответом — Task 1/6.
2. Дата компьютера отличается от города, DST и прогулка перед полуночью: абсолютный момент и день расписания согласованы — Task 1/2.
3. Смена города/disable одновременно с preview или native dispatch: старое расписание не применяется и не доставляется — Task 2–5.
4. Старый sync payload, offline и повторный запуск: локальный город не теряется, weekly targets продолжают синхронизироваться — Task 1/3/6.
5. Закрытие процесса, reboot, отсутствие permissions и истечение покрытия: никаких дублей/ложного «Запланировано» — Task 3–6.

---

### Task 1: Расчёт заката и локальная настройка города

**Files:** Create `src/domain/walk/SunsetWalkSchedule.ts`, `src/application/walk/SunsetWalkSettings.ts`, `src/application/ports/CitySearchGateway.ts`, `src/infrastructure/location/OpenMeteoCitySearchGateway.ts`, `src/infrastructure/persistence/IndexedDbSunsetWalkSettingsStore.ts` и соседние `.test.ts`; create `src/infrastructure/persistence/SunsetWalkSettings.integration.test.ts`; test existing `src/infrastructure/sync/MeaningfulLocalSettingsSync.test.ts`.

**Interfaces:**

- `WalkCity { id: string; name: string; region: string; country: string; latitude: number; longitude: number; timeZone: string }`.
- `SunsetWalkSettings { city: WalkCity; enabled: boolean; remindersEnabled: boolean; revision: number }`; `SunsetWalkSettingsStore.read(): Promise<SunsetWalkSettings>` / `write(value: SunsetWalkSettings): Promise<void>`, ключ `sunset-walk-settings:v1` в существующем `sync_settings`, без DB version migration.
- `calculateSunsetWalk(cityDate: string, city: WalkCity): SunsetWalkDay`, где union результата — `{ kind: 'available'; cityDate: string; sunsetAt: number; walkStartAt: number }` либо `{ kind: 'no-sunset'; cityDate: string }`; epoch milliseconds, минутная точность.
- `CitySearchGateway.search(query: string, signal?: AbortSignal): Promise<readonly WalkCity[]>`; `SunsetWalkSettings.get()`, `save(input: Pick<SunsetWalkSettings, 'city' | 'enabled' | 'remindersEnabled'>): Promise<SunsetWalkSettings>`; неизменённое сохранение не увеличивает revision.

- [x] Добавить RED tests: default ID/координаты/timezone; `walkStartAt === sunsetAt - 15 * 60_000`; `sunsetAt % 60_000 === 0`; даты Борзи по сезонам; DST Европы; UTC±12/14; Tromsø без заката; невалидные date/координаты/timezone отклоняются. До реализации сохранить независимо проверенные сезонные reference values с источником в fixtures теста; допуск астрономического сравнения ≤2 минуты, разность прогулка/закат всегда ровно 15.

  ```ts
  expect(settings.city.id).toBe('2026126');
  expect(settings.city.timeZone).toBe('Asia/Chita');
  expect(day.kind).toBe('available');
  if (day.kind === 'available') {
    expect(day.sunsetAt % 60_000).toBe(0);
    expect(day.sunsetAt - day.walkStartAt).toBe(900_000);
  }
  ```

- [x] Запустить `npm run test:target -- src/domain/walk/SunsetWalkSchedule.test.ts src/application/walk/SunsetWalkSettings.test.ts`; ожидается FAIL новой функции/контракта.
- [x] Реализовать локальный NOAA/Meeus расчёт с высотой солнца −0.833°, выбирать событие внутри календарной даты города, округлять закат к ближайшей минуте, затем вычитать 15. Timezone разрешать существующим `Intl`, без постоянного UTC offset.
- [x] Реализовать валидируемые settings/store и поиск Open-Meteo: минимум 3 символа, `language=ru`, `count=10`, timeout 10 секунд, отмена запроса. Проверить условия провайдера перед включением; платный доступ не вводить. Не выбирать первый результат автоматически.
- [x] Добавить tests сохранения/reload/offline, двух Борзей, malformed/timeout ответа и неизменности сериализованного sync record при смене города; weekly targets не сбрасываются.
- [x] Запустить новые domain/application/adapter/persistence tests плюс `MeaningfulLocalSettingsSync.test.ts`; ожидается PASS. Самопроверить diff; оставить изменения для общего финального проверенного commit.

### Task 2: Одинаковое время во всех планах, связь действий и автопилот

**Files:** Create `src/application/walk/WalkScheduleProjection.ts` + test; modify `src/application/walk/WalkPlanning.ts`, `WalkServices.ts`, `src/domain/life-action/LifeAction.ts`, `src/application/planner/RecurringActions.ts`, `AutopilotConstraints.ts`, `PreferenceDayAutopilot.ts`, `AutopilotGuard.ts`, `src/application/queries/GetTimeSchedule.ts`, `src/app/composition/createLifeOsApplication.ts`; extend соответствующие существующие тесты.

**Interfaces:**

- `WalkScheduleProjection.forPlannerDate(date: string, plannerTimeZone: string): Promise<WalkScheduleDay>`; `WalkScheduleDay { date: string; settingsRevision: number; kind: 'available' | 'no-sunset' | 'disabled'; city: WalkCity; sunsetAt: number | null; walkStartAt: number | null; startMinute: number | null }`.
- Привязка к дню: проверить соседние city dates и выбрать `walkStartAt`, попадающий в выбранную дату planner timezone; подпись города всегда показывает его местное время. Read model времени действий использует этот слот для `walkPlan`, распорядок — для assignment `kind: 'walk'`; остальные используют сохранённое время.
- `LifeAction.setWalkPlan(value: WalkPlanMetadata | null): void` для незавершённых draft/ready; `WalkPlanning.linkAction(input: { actionId: EntityId; targetMinutes: number | null; scope: 'action' | 'series' }): Promise<void>` через existing planning transaction, с проверкой статуса и журнала. Series требует существующую active rule, меняет её `walkPlan` и будущие разрешённые occurrences, используя текущую recurrence reconciliation.
- `buildTimeScheduleDay` получает optional read model эффективного времени; прежние вызовы/обычные действия совместимы. Autopilot guard включает revision и разрешённый слот города, apply повторно проверяет их.

- [x] Добавить RED tests: сегодня/завтра различны по дате; один фиксированный защищённый walk slot при action + routine representation; конфликт с встречей виден; длительность сохраняется; completed/started/history не меняются; обычное действие с «прогулка» в названии не затрагивается; linking и series сохраняют заметки/даты/чужие overrides.
- [x] Запустить новые projection tests и затронутые `GetTimeSchedule.test.ts`, autopilot/recurrence tests через `test:target`; ожидается новая регрессия FAIL.
- [x] Реализовать общий read model и связь через application, переиспользовать `RecurringActions` и unit of work. Не записывать рассчитанное время обратно в исторические данные или как постоянное время recurrence rule.
- [x] Подключить слот к preview/readback и проверке apply. Смена settings инвалидирует уже показанный preview; no-sunset не оставляет вчерашний слот; disabled возвращает ручной режим. Несколько представлений одной прогулки не создают несколько protected blocks.
- [x] GREEN тех же tests + `npm run test:fast`. Зафиксировать actual paths выбранных существующих tests в evidence; не запускать пустые selectors.

### Task 3: Нативный контракт и согласование расписания

**Files:** Create `src/application/ports/WalkReminderGateway.ts`, `src/application/walk/WalkReminderCoordinator.ts`, `src/infrastructure/notifications/TauriWalkReminderGateway.ts`, `src-tauri/src/walk_reminder_contract.rs` и соседние tests; modify `WalkServices.ts`, composition и `src-tauri/src/lib.rs`.

**Interfaces:**

- `WalkReminderConfiguration { schemaVersion: 1; revision: number; cityId: string; timeZone: string; enabled: boolean; fromCityDate: string; throughCityDate: string; days: readonly { cityDate: string; sunsetAt: number | null; walkStartAt: number | null }[] }`, ровно 400 непрерывных дат.
- `WalkReminderReceipt { revision: number; state: 'scheduled' | 'disabled' | 'permission-required' | 'unsupported' | 'expired' | 'error'; nextTriggerAt: number | null; throughCityDate: string | null; checkedAt: number; message: string | null }`.
- Gateway `reconcile(config: WalkReminderConfiguration): Promise<WalkReminderReceipt>` / `status(): Promise<WalkReminderReceipt>`; Tauri commands `walk_reminder_reconcile`, `walk_reminder_status`. Coordinator `reconcile(): Promise<WalkReminderReceipt>` вызывается на startup/settings save, последовательно; старый async ответ не заменяет receipt текущего revision.

- [x] RED tests валидатора/native JSON parity: 400 дат, лимиты timestamp/разности, unsupported schema, duplicate/nonordered dates, просроченные таблицы, payload size limit 128 KiB. Ошибка входа не удаляет последнее валидное расписание.
- [x] RED coordinator tests смены города во время reconcile, disable, повторного запуска, отсутствия native backend и stale receipt; native permission state не подменяется успехом browser mock.
- [x] Реализовать построение/передачу таблицы одним расчётом Task 1, хранить native config атомарно вне WebView. Сначала проверить input, затем отменить прежние будущие owned notifications и подтвердить новое расписание; при частичной ошибке вернуть error. Не сохранять tokens/accounts/secret keys в native config.
- [x] GREEN targeted TS tests и `cargo test --manifest-path src-tauri/Cargo.toml walk_reminder_contract`; ниже adapters должны реализовать этот же JSON-контракт, без второго астрономического алгоритма.

### Task 4: Android — доставка после закрытия и reboot

**Files:** Create `src-tauri/src/android_walk_reminder.rs`; create `LifeOsWalkReminderScheduler.kt`, `LifeOsWalkReminderReceiver.kt`, `WalkReminderSchedulePolicy.kt` в `src-tauri/gen/android/app/src/main/java/com/lifeos/desktop/`; create `WalkReminderSchedulePolicyTest.kt` в соседней `src/test/java/com/lifeos/desktop/`; modify существующие `LifeOsAlarmPlugin.kt`, `LifeOsAlarmBootReceiver.kt`, `AndroidManifest.xml`, `src-tauri/src/lib.rs`.

**Interfaces:** Kotlin scheduler `reconcile(configuration): WalkReminderReceipt`, `restorePersisted(): WalkReminderReceipt`, `dispatch(cityDate: String, revision: Long): Unit`; чистая policy выбирает следующий future non-null trigger, проверяет revision и occurrence ledger. Rust Android adapter возвращает Task 3 receipt.

- [x] RED native policy tests: повторные reconcile/boot/receiver дают один сигнал на дату; старый revision/disable подавляют доставку; no-sunset пропускается; после последней даты expired; overdue событие старше 5 минут пропускается; exact-alarm и notification permissions проверяются отдельно.
- [x] Запустить `src-tauri/gen/android/gradlew.bat -p src-tauri/gen/android :app:testUniversalReleaseUnitTest --tests com.lifeos.desktop.WalkReminderSchedulePolicyTest --console=plain`; ожидается FAIL нового поведения.
- [x] Реализовать separate `lifeos-walk` notification channel и один AlarmManager exact trigger; PendingIntent идентифицируется date/revision. Receiver под блокировкой проверяет config/ledger, отправляет «Пора на прогулку» и ставит следующий сигнал; boot/package replacement/time change пересогласуют сохранённую таблицу. Force-stop не обещает доставки до открытия приложения.
- [x] Интегрировать существующий permission flow без DND/full-screen требований для обычного уведомления. Будильник сна, ringing service и sleep event receivers не менять.
- [x] GREEN новых и существующих Android unit tests; собрать актуальный APK. Реальная проверка с отдельным разрешением выполнена на Android-эмуляторе: закрытый процесс, уведомление, disable/restart и stale revision — PASS. Физический телефон и полный reboot/locked boot — NOT RUN, отдельно отражены в отчёте; эмулятор не перезапускался. Test trigger в диагностике не меняет production sunset time.

### Task 5: Windows — headless dispatch и пополнение очереди

**Files:** Create `src-tauri/src/windows_walk_reminder.rs`, `windows_walk_tasks.rs`, `windows_walk_toast.rs`, `src-tauri/windows/walk-reminder-hooks.nsh`; modify `src-tauri/src/main.rs`, `lib.rs`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`; tests чистой queue/dispatch policy внутри новых Rust modules.

**Interfaces:** `handle_walk_reminder_cli(args: &[String]) -> Result<bool, String>` вызывается перед `lifeos_lib::run()`, true означает выполненный headless режим. Только фиксированные modes `--walk-reminder-maintain` / `--walk-reminder-dispatch <cityDate> <revision>`; собственный prefix Task Scheduler `LifeOS-Walk-`, отдельный AUMID `com.lifeos.desktop.walk`.

- [x] RED Rust tests планирования 14 ближайших дат, revision/disable, повторного dispatch, skipped overdue >5 минут, пустого/no-sunset дня и expired coverage. Не принимать произвольную executable path/command через payload; только текущий LifeOS executable.
- [x] Запустить `cargo test --manifest-path src-tauri/Cargo.toml windows_walk`; ожидается FAIL нужной policy.
- [x] Добавить необходимую Windows binding dependency и разделить native config/queue/identity. Daily и logon maintenance tasks запускают LifeOS без окна, перечитывают durable table и выставляют максимум 14 dated one-shot tasks; missed maintenance запускается при следующем доступном старте ОС. Dispatch использует WinRT immediate Toast, валидирует config revision и durable occurrence ledger, затем завершается. Не полагаться на ограниченный `ToastNotifier.AddToSchedule` контракт WinRT-framework приложения для NSIS Win32.
- [x] Зарегистрировать per-user desktop notification identity/shortcut и текущий путь exe, используя COM/WinRT без shell-built команд и без elevation. NSIS hooks удаляют только owned tasks/identity при uninstall; upgrade обновляет путь/очередь. Save/read status проверяют существование tasks и системную доступность notifications; ошибки регистрации не дают scheduled.
- [x] GREEN Rust tests и Windows native build. В отдельном тестовом профиле проверить shortcut identity, запуск headless без main WebView, доставку при завершённом процессе, повторный dispatch/disable, реальный запуск maintenance — PASS. Настоящий logoff/logon — NOT RUN, сохранён для ручной QA отдельной сессии; logon trigger зарегистрирован и проверен. Не завершать пользовательский фокус или установленное приложение ради проверки; install/uninstall QA требует отдельного разрешения на тестовый экземпляр.
- [x] Проверить затронутый NSIS/config контракт командой `npm run test:release`; до native production build выполнить `npm run release:windows -- check`. Если configuration/installer hooks меняют ожидаемое поведение, добавить regression в существующие release tests без публикации пакета.

### Task 6: Настройка, общий UI и итоговая проверка

**Files:** Create `src/presentation/planner-v2/walks/SunsetWalkSettings.tsx` + test; modify `walks/WalkPlan.tsx`, `PlannerToday.tsx`, `PlannerActionList.tsx`, `PlannerActionPanel.tsx`, `PlannerActionTimeSheet.tsx`, `RoutineLanding.tsx`, `AutopilotPreferencesForm.tsx`, `RoutinePages.tsx`; локальные CSS additions только при необходимости; extend `tests/e2e/current.walks-planning.spec.ts`, `current.autopilot-tomorrow.spec.ts`; create `tests/e2e/current.sunset-walk.spec.ts`.

**UI contract:** Функция существующего раздела прогулок → выбрать город и знать точное начало → current settings/form archetype → graphite/jade → главный центр «Прогулка HH:MM · Закат HH:MM» → reuse `walk-panel`, `walk-form`, current inputs/status → mobile одна колонка, короткие подписи timezone → существующее approved направление общей поверхности, отдельного макета не требуется → scoped desktop/mobile + native delivery evidence.

- [x] До TSX/CSS изменений открыть `/#/v2/walks/plan` и autopilot, сохранить baseline 1440×900 / 390×844 в `artifacts/visual-qa/sunset-walk/`, проверить текущие компоненты/cascade/computed styles и design Rule №38.
- [x] RED UI tests: ambiguous city results требуют выбора; loading/empty/error/retry; поздний ответ игнорируется; offline сохранённый город виден; keyboard/focus; текущий revision receipt, permission-required/expired/unsupported; единое время today/tomorrow и отсутствие horizontal overflow.
- [x] Реализовать компактную форму города/automatic mode/reminders и статус покрытия. Показывать обе timezone, если planner и город различаются. Для unmarked действия добавить явное «Связать с прогулкой» и выбор текущего действия/серии; manual time controls linked walk объясняют автоматическое правило и позволяют отключить его через общую настройку. Native status refresh вызывается отдельно на текущем устройстве.
- [x] Заменить ручную walk start настройку автопилота на общий слот при enabled rule; оставить длительность и ручной fallback при disabled. Read models Task 2 используются всеми затронутыми строками, один UI не вычисляет другое время.
- [x] GREEN scoped TS tests; `npm run test:e2e -- tests/e2e/current.sunset-walk.spec.ts tests/e2e/current.walks-planning.spec.ts tests/e2e/current.autopilot-tomorrow.spec.ts` на `desktop-chrome` и `mobile-chrome`. Сохранить after screenshots, comparison и console/keyboard checks; чужие занятые порты не освобождать принудительно.
- [x] Выполнить один `npm run verify`; проверить Rust/Android результаты Task 4/5 и реальные native delivery evidence. Успех browser tests/build не считать доказательством закрытого приложения. После предоставления доступа Android delivery QA выполнена на отдельном разрешённом QA-пакете эмулятора; доставка при закрытом процессе подтверждена.
- [x] Один итоговый независимый read-only review всего diff на соответствие spec, ownership, compatibility и delivery. Исправлять подтверждённые замечания и повторять только затронутые checks; gate повторять после влияющих правок, не из-за нового отчёта.
- [x] Обновить этот план фактическими результатами/ограничениями, выполнить `git diff --check`, проверить status. Общий feature commit только после обязательных PASS; при недоступном native QA явно сохранить PARTIAL/NOT RUN, не объявлять доставку подтверждённой. Push, подпись, установку и публикацию оставить до отдельной команды пользователя.

## Принятые границы и handoff

Город нужно выбрать на каждом устройстве отдельно; default Борзя одинаков. Запас автономных напоминаний — 400 дней, и его конец виден пользователю. Эти два технических ограничения представлены для review вместе с планом, а не скрываются за обещанием бессрочной синхронизации/доставки. Реализация начинается после подтверждения, что план описывает желаемый результат.
