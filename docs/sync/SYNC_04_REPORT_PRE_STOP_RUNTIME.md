# SYNC-04 — итоговый STOP-gate отчёт

Дата: 2026-09-07. Worktree: `D:/LifeOS-App`.
Исходный HEAD: `4e7e0bfd79d50ec9f773e9ffe08027e7c931590b`.

## Вердикт

### Последнее продолжение: согласованная legacy-политика

Дефект автоматического повторного открытия завершённой подготовки воспроизведён и исправлен в
`PreparationService` без изменения wire protocol. RED: 3 failures; GREEN: 31 focused/application/
identity tests. `test:fast`: 145 files / 1482 tests PASS. Свежий `npm run verify`: exit 0,
360 files / 3039 tests, infra 55, alpha 1, typecheck/lint/build/format/diff PASS.
Первый verify остановился из-за lint сохранённых generated Playwright assets; артефакты перемещены
в уже исключённый `src-tauri/target`, конфигурация lint не менялась.

Свежий Windows signed build: exit 0, 2026-09-07 13:12:55 Asia/Chita.
Setup: 6,524,622 bytes, SHA-256 `FF124761269B1D45748FD67C5C9685A68DBFF1C0AC2651FA48FBD870AF7D8BF2`;
`.sig`: 416 bytes. Использован прежний ключ. Уже запущенный Android arm64 release rebuild также
завершился с exit 0; свежий APK создан. Отдельная повторная проверка APK certificate после этого
rebuild не выполнялась. Новый полный E2E после этого изменения не запускался.

Пользователь разрешил закрытие старого Windows-окна. Оно закрыто штатно. Запуск по обычному пути
через UI helper выбрал старую установленную программу; она закрыта повторно. Запуск через точный
`process:D:/LifeOS-App/src-tauri/target/release/lifeos.exe` успешен, фактический executable path
подтверждён read-only проверкой процесса. До чтения нового UI пользователь нажал Escape и остановил
Computer Use. Дальнейшее управление окнами/физическая приёмка остановлены. Свежий APK не установлен,
данные не очищены. Последний ADB check — устройство отсутствует, запрос подключения отправлен.

Текущий итог: legacy completion blocker исправлен и проверен автоматически; общий SYNC-04 PARTIAL.
Таблицы consolidated gate ниже сохраняют предыдущий прогон, не являются свежей аттестацией E2E/
Android/physical acceptance после legacy-fix. Дальнейшая приёмка требует возобновления пользователем.

**SYNC-04 STATUS: PARTIAL. Не готово: обязательный STOP gate не закрыт. SYNC-05 не начат.**

Исправлена identity пяти date-singleton типов, пройдены автоматические sync/SQL/verify gates и
обе native release-сборки. Однако полный E2E имеет один timeout, физическая двусторонняя приёмка
не выполнена, а review обнаружил отдельную несовместимость cache provenance подготовки.
Зелёные тесты identity не выдаются за доказательство всех production-сценариев.

Первоначальный отчёт сохранён как [SYNC_04_REPORT_INITIAL.md](SYNC_04_REPORT_INITIAL.md).
Inventory и связи: [SYNC_04_STRUCTURED_DATA_MAP.md](SYNC_04_STRUCTURED_DATA_MAP.md).

## Обязательные 12 результатов

| №   | Проверка                                 | Результат | Доказательство / ограничение                                                                                                                  |
| --- | ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | singleton-per-date logical identity      | PASS      | Пять реальных singleton типов; domain date; physical IDs сохраняются                                                                          |
| 2   | same-date different-ID dedup             | PASS      | Все пять типов: одна локальная запись, 0 conflicts, без нарушения unique index                                                                |
| 3   | same-date conflict convergence           | FAIL      | HLC-конвергенция и loser retention в focused tests PASS; полная сходимость подготовки после application read не закрыта из-за provenance ниже |
| 4   | Windows updater signing                  | PASS      | `tauri build --ci`, exit 0; существующий REL-05 key, setup + `.sig`                                                                           |
| 5   | Galaxy A23 real bidirectional acceptance | FAIL      | Не выполнена; connected/authorized ADB не является acceptance                                                                                 |
| 6   | WALK-14 root cause established           | NO        | Три controlled PASS; исходного trace нет, историческая причина не доказана                                                                    |
| 7   | full E2E                                 | FAIL      | 128 passed, 31 skipped, 1 WALK-10 timeout; isolated WALK-10 затем PASS                                                                        |
| 8   | SQL/RLS                                  | PASS      | Локальный Supabase: 3 файла, 129 assertions, exit 0                                                                                           |
| 9   | main verify                              | PASS      | 359 файлов / 3035 unit/integration tests, infra 55, alpha 1; весь command exit 0                                                              |
| 10  | user data preserved                      | YES       | Не было clear/reset/uninstall, замены БД или записей synthetic acceptance в реальные данные                                                   |
| 11  | photo/file sync enabled                  | NO        | Goal cover / Walk photo / blobs остаются локальными                                                                                           |
| 12  | SYNC-05 started                          | NO        | Не начинался                                                                                                                                  |

## Реализованное исправление identity

Ровно пять типов имеют одну логическую запись на дату:

- `day`: `date`;
- `morning_cycle`, `evening_cycle`: `dateKey` и согласованный родитель Day;
- `tomorrow_plan`: `targetDateKey`, target Day и согласованные source Day / cycle;
- `preparation_plan`: дата target Day / TomorrowPlan, согласованный cycle.

В encrypted payload используется `lifeos:singleton:<entity type>:<DayDate YYYY-MM-DD>`.
Transport object ID остаётся непрозрачным UUID. Массового изменения local IDs нет.
Apply сначала разрешает unique logical-date key, обновляет найденную physical запись, переводит
явные внешние/внутренние ссылки и сохраняет aliases в существующем `sync_settings`.
Поддержаны legacy physical-ID payloads, рестарт aliases и tombstones. Pending ciphertext не переписывается.
Перепривязка physical ID/alias на другую дату и противоречивые parent dates отклоняются атомарно.

При эквивалентном содержимом — dedup без конфликта. При расхождении используется существующий
HLC/revision resolver, проигравшее содержимое сохраняется в прежнем conflict store.
Ссылки вложенных reflection/preparation items сохраняют локальный parent ID; user text не заменяется.
Несколько Walk/Decision/routine records на дату не склеиваются. Name/title identity не вводилась.

Текущий registry: 21 существующий domain IndexedDB store + одна allowlisted проекция
`eveningRitual` из localStorage = 22 типа, включая прежние три pilot-типа. Новый engine,
новые предметные stores, зависимости, схема БД или UI не добавлялись этим исправлением.

Затронутые основные модули: `StructuredSyncIdentity`, `IndexedDbPilotMutationRecorder`,
`IndexedDbPilotSyncStore`, transaction scopes `LifeOsIndexedDb`, локальные sync record metadata,
порт `PilotSyncStore` / вызов `PilotPullEngine`; focused identity/apply tests.
Широкие исходные незакоммиченные изменения предыдущих этапов сохранены и не присваиваются этому патчу.

## Свежие проверки

| Проверка                                                  | Результат    | Детали                                                                                                                                 |
| --------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `test:target -- StructuredSyncIdentity.test.ts`           | PASS         | 19 tests                                                                                                                               |
| Related sync/persistence targeted run                     | PASS         | 35 files / 216 tests; затем добавлены ещё 3 negative identity tests, включённые в свежий verify                                        |
| `npm run verify`                                          | PASS, exit 0 | typecheck 23.77s; lint 32.42s, 0 errors / 13 существующих warnings; tests 3035 / 125.18s; infra 55; alpha 1; build; format; diff check |
| `supabase test db`                                        | PASS, exit 0 | 3 files / 129 assertions; локальная Docker DB, не production migration                                                                 |
| Полный `npm run test:e2e`                                 | FAIL, exit 1 | 160 total: 128 passed / 31 skipped / 1 failed; command 1040.10s                                                                        |
| Isolated WALK-10 без параллельной native build            | PASS, exit 0 | 1 test / 14.13s; runner 17.05s; порт 4173 освобождён                                                                                   |
| Windows `tauri build --ci`                                | PASS, exit 0 | Existing updater key; NSIS setup и signature созданы                                                                                   |
| Android `tauri android build --apk --ci --target aarch64` | PASS, exit 0 | Web + Rust arm64 + Gradle release APK                                                                                                  |
| `apksigner verify --verbose --print-certs`                | PASS         | APK Signature Scheme v2; прежний release certificate                                                                                   |
| `git diff --check`                                        | PASS         | Нет whitespace errors; исходные LF/CRLF warnings не ошибки                                                                             |

SQL и Android сначала встретили ограничения sandbox (служебный telemetry file / Gradle network).
После разрешённого повторения той же штатной команды gates прошли. Это не исправления продукта,
не замена toolchain и не повторные foundation-аудиты.

### E2E: установленное и неустановленное

Три controlled исходных WALK-14: 8.11s, 7.60s, 7.52s, все PASS в одинаковом selector/project,
без увеличения timeout и без изменения кода. В полном suite WALK-14: 22 PASS, 14 project-mismatch skips,
0 failures. Исходный `long data and literal analytics 1920x1080` — PASS, 6.532s.
Отдельный `UI journey 1920x1080 reflection` — PASS, 18.904s.
Исторического failure trace нет: точную причину прежнего WALK-14 timeout восстановить нельзя.

Единственный новый timeout — desktop WALK-10 capture. Trace показывает сохранённую мысль,
продолжающийся таймер, отсутствие page/console errors и задержку на `02-saved-confirmation` screenshot.
Перед ней `readRecords('walks')` занял 17.106s; наблюдаются большие интервалы без продуктовых операций,
включая 49.071s перед screenshot. Timeout 30s зарегистрирован приблизительно через 99.5s от старта.
Это сильный признак нарушения scheduling/тайминга host/runner/browser в период прерывания сессии,
но конкретная причина Windows/OS не доказана. Последующие teardown ошибки — следствия timeout.

После завершения build запущен только точный упавший WALK-10 — PASS 14.13s.
Полный suite повторно не запускался; isolated PASS не меняет его FAIL.
Trace/report сохранены до targeted run; затем перемещены без удаления в
`src-tauri/target/sync04-stop-e2e.local/`, исключённый из Git, ESLint и Prettier.

### Native артефакты

Windows: `src-tauri/target/release/bundle/nsis/LifeOS_1.0.2_x64-setup.exe`, 6,524,278 bytes,
и `.exe.sig`, 416 bytes, 2026-09-07 12:34 Asia/Chita.
Setup SHA-256: `716952869BFA0C844AC89553813D9EBB302217768A80601BCB0061E67A14F22F`.
Существующий REL-05 public key совпал с текущим Tauri config. Private key не создавался,
не публиковался, не добавлялся в Git/отчёт; secret environment использовалось только Windows build.
Релиз не публиковался. Это updater signature, не заявление о Windows Authenticode.

Android: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`,
17,538,432 bytes, 2026-09-07 12:44:38 Asia/Chita.
SHA-256: `419086748855BA9EF596F867D71308A84FA24A9159E22FB8F04F7D9716200BF1`.
Certificate SHA-256: `f3669cd0ca91cd17670e01a284d07493330bcaf32d4993cfbb88ca5099d92c69`.
Gate пересобирал aarch64. Другие ABI этим прогоном не аттестованы.
На телефон свежий APK не устанавливался.

## Оставшиеся блокеры

### 1. Preparation legacy policy — исправлено после согласования

Архитектурный review, затем runtime regression подтвердили путь потери plan-level completion:
`PreparationPanel` → `PreparationService.getOrGenerate()` → сравнение `generationSignature` →
`PreparationPlan.synchronize()` → `IN_PROGRESS`, `completedAt = null`, persisted version increment.
Это возможно для receiver cycle `PREPARING`; history при `COMPLETED` cycle защищена ранним возвратом.
Статусы/даты отдельных items сохраняются, но завершённость самого плана может быть сброшена и отправлена обратно.

Подпись генерации содержит `ruleId:localOptimisticVersion`. Sync apply использует receiver-local
optimistic versions. Номера версий разных устройств не являются доказательством равного содержания.
Sender `{R, v5, title A}` и receiver `{R, v2, title A}` требуют технического rebasing;
receiver `{R, v2, title B}` с тем же входящим токеном требует настоящего пересчёта.
Старый payload не позволяет различить эти случаи. Возможна и одинаковая версия при разном содержимом.
Перевод только Tomorrow version уже реализован; слепая подмена rule versions намеренно не внесена.

Пользователь согласовал консервативную legacy-политику: без portable provenance завершённость
сохраняется, автоматическое чтение не открывает план повторно. Все текущие signatures используют
device-local versions. Guard добавлен в существующий optimistic reread loop `PreparationService`,
после проверки TomorrowPlan ID и перед `synchronize()`. Domain, wire protocol и схема не менялись.
Незавершённые планы пересчитываются как прежде. Явные item/core команды могут изменить и открыть
план повторно. Новые правила сами по себе не отзывают завершённость legacy-плана — это согласованный
компромисс, не доказательство равенства входных данных разных устройств.

`StructuredSyncPreparationLegacy.test.ts`: настоящий IndexedDB/sync apply, разный physical plan ID,
один stable rule ID с версиями 2 и 7, одинаковое либо разное содержание правил. До исправления
3/4 теста падали: `COMPLETED` превращался в `IN_PROGRESS`, явный edit получал лишнее увеличение версии.
После исправления все 4 PASS; вместе с application/identity — 31 PASS. Подтверждены неизменные
completedAt/items/version/signature/Outbox при чтении и рестарте, одна mutation при явном edit,
прежний пересчёт IN_PROGRESS. Read-only final review не выявил must-fix. Это synthetic regression,
не утверждение о проверке реальных данных Galaxy.

### 2. Physical Windows ↔ Galaxy A23

Galaxy A23 SM_A235F был подключён и авторизован, затем временно исчезал; последний ADB read снова
показывает `device`. Существующая production installation — 1.0.2, последнее обновление 2026-09-05.
В существующем Sync UI наблюдалось доверенное encrypted enrollment. Это не проверка новых типов.
Старая надпись про три pilot-типа есть также в текущем UI source; она не используется как доказательство версии APK.

Windows installed `D:/LifeOS/lifeos.exe` показывает startup error «Локальное хранилище недоступно».
Свежий workspace binary собран, но не запущен на том же профиле: старое окно остаётся открытым.
Первоначальная попытка закрыть окно была отклонена auto-review. Затем пользователь отдельно разрешил
закрытие; окно закрыто штатным Alt+F4, отсутствие окна и процесса подтверждено. Обход через kill не
выполнялся. Захват screenshot Windows вернул `SetIsBorderRequired ... 0x80004002`; accessibility tree
доступен и подтвердил startup error. Свежая сборка после legacy-fix ещё ожидает проверки на профиле.

Relationships, Android → Windows, Windows → Android, offline merge, restart persistence,
representative conflict/delete/tombstone и same-date convergence на обеих production installations
остаются NOT VERIFIED. Не делались clear/reset/uninstall/reinstall, загрузка фиктивной БД или
вмешательство в реальные записи. Отдельное ограничение — найденный preparation compatibility blocker.

### 3. Полный E2E

Один полный финальный suite остаётся FAIL, хотя упавший selector отдельно прошёл.
Для дальнейшего полного запуска потребуется обоснованный следующий gate после устранения блокеров,
а не слепой повтор ради зелёного результата.

## Безопасность и STOP

Фото/файлы не включены. Реальные sync данные не выгружались в отчёт; production cloud audit новых
типов не заявляется. В этом исправлении не менялись ключи, dependencies, version/package ID,
release endpoints или Git remote. Commit/push/publish не выполнялись.

**STOP: SYNC-04 PARTIAL; physical acceptance не подтверждена, есть известный compatibility blocker
и красный full E2E. Готовность к SYNC-05 не заявляется.**
