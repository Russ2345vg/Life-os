# SYNC-04 — первоначальный отчёт (исторический)

Этот документ сохраняет результаты первоначального расширения registry. Его статусы заменены
актуальным [SYNC_04_REPORT.md](SYNC_04_REPORT.md): date-singleton identity исправлена, существующий
Windows signing key найден и использован. Нижележащие исходные блокеры не являются текущим статусом.

Дата: 2026-09-07. Worktree: `D:/LifeOS-App`. Исходный HEAD: `4e7e0bfd79d50ec9f773e9ffe08027e7c931590b`.

## Статус

**PARTIAL — STOP gate не пройден. SYNC-05 не начат.**

Расширение реализовано через существующий SYNC-03 engine, но регистрация типов не означает
доказанную сходимость двух независимо заполненных устройств. Найден реальный конфликт между
требованием сохранять разные stable IDs и существующими уникальными предметными индексами.
Кроме того, не подтверждена физическая приёмка Windows ↔ Galaxy A23 и недоступна подпись Windows
updater-артефакта. Код не объявляется готовым к production activation или к SYNC-05.

## Inventory

- 21 существующий предметный IndexedDB store: все классифицированы `SYNC NOW`.
- 10 технических sync stores: локальное состояние engine, не дополнительные синхронизируемые сущности.
- 5 известных localStorage keys: только проекция `eveningRitual` из `lifeos.local-settings.v1` синхронизируется. Четыре остальных ключа и остальные поля настроек остаются локальными.
- Итого registry: 22 типа, из них 3 прежних pilot и 19 дополнительно включённых.
- `DERIVED`: аналитика, счётчики, рекомендации, проекции истории/Goal Album, системный каталог упражнений.
- `DEFER TO SYNC-05`: `Goal.coverImage`, `Walk.photo`, файлы/blob и выполнение attachment queue.
- Отсутствуют отдельные stores Habits/check-ins, reusable templates, Goal Album metadata, агрегатов аналитики и файлов. Новые хранилища для них не создавались.

Подробная карта: [SYNC_04_STRUCTURED_DATA_MAP.md](SYNC_04_STRUCTURED_DATA_MAP.md).

## Registry expansion

В таблице PASS означает автоматический adapter/store contract, **не физический двухсторонний тест**.
Проверены canonical wire round-trip, сохранение ID, повторная нормализация, невалидный ID,
отсутствие `version`/бинарных полей, remote apply и сохранение ссылок. Schema wire/envelope — 1.
Journal сохраняет старую локальную форму без собственного `schemaVersion`; версия явно задана envelope.

| Тип                            | Adapter / ID | Ссылки round-trip | Wire schema | Tombstone                                               |
| ------------------------------ | ------------ | ----------------- | ----------- | ------------------------------------------------------- |
| `day`                          | PASS         | PASS              | 1           | N/A в текущем UI                                        |
| `decision`                     | PASS         | PASS              | 1           | Soft-delete — upsert                                    |
| `life_action`                  | PASS         | PASS              | 1           | Archive/complete — upsert                               |
| `action_session`               | PASS         | PASS              | 1           | N/A                                                     |
| `sphere`                       | PASS         | N/A               | 1           | Archive — upsert                                        |
| `journal_entry`                | PASS         | PASS              | 1           | Append-only; correction — новая запись                  |
| `routine_block`                | PASS         | PASS              | 1           | PASS, shared capture/apply                              |
| `routine_occurrence_override`  | PASS         | PASS, orphan-safe | 1           | Общий delete path; отдельная физическая QA не выполнена |
| `routine_occurrence_execution` | PASS         | PASS, orphan-safe | 1           | Completion — upsert                                     |
| `walk`                         | PASS         | PASS              | 1           | PASS, сохранение Capture history                        |
| `walk_capture`                 | PASS         | PASS, orphan-safe | 1           | Processing — upsert                                     |
| `evening_cycle`                | PASS         | PASS              | 1           | Completion/skip — upsert                                |
| `morning_cycle`                | PASS         | PASS              | 1           | Completion/skip — upsert                                |
| `exercise_definition`          | PASS         | N/A               | 1           | Archive — upsert; SYSTEM не отправляется                |
| `tomorrow_plan`                | PASS         | PASS              | 1           | Status — upsert                                         |
| `preparation_plan`             | PASS         | PASS              | 1           | Status — upsert                                         |
| `preparation_rule`             | PASS         | N/A               | 1           | Active state — upsert                                   |
| `recommendation_application`   | PASS         | PASS              | 1           | Applied/dismissed — upsert                              |
| `user_settings`                | PASS         | N/A               | 1           | Запрещён, только versioned upsert                       |

Прежние `direction`, `project`, `goal` сохранены в том же registry и покрыты текущими adapter/engine tests.

## Settings и local-first engine

- Explicit allowlist: **YES** — `eveningRitual`; UI density/default section/reduced motion/weekday, sidebar, filters, selection и updater timestamp остаются локальными.
- Allowlisted preference / local-only fields: **PASS в тестах**, физический обмен не подтверждён.
- Existing engine reused: **YES**. Second engine/transport/crypto/schema: **NO**.
- Local save waits for network: **NO**. IndexedDB domain writes и Outbox фиксируются одной транзакцией.
- Все 21 store проходят synthetic capture → durable Outbox → restart; remote apply проверен с включённым capture и не создаёт echo.
- Bootstrap: проверенный pre-sync snapshot, legacy pilot gate, per-type checkpoints, страницы по 100 ID, повторное чтение текущей записи/meta в общей write-транзакции. Concurrent save/delete не заменяется старым результатом сканирования.
- Настройки: pending-materialization marker фиксируется с shadow/meta/cursor. localStorage изменяется после commit. Проверены abort, restart между commit и materialization, более поздняя локальная правка и гонка reconciliation с remote commit.
- Cursor, applied ledger, crypto, HLC, revisions, deterministic conflict и tombstone resolver остаются существующими SYNC-03 механизмами.

## Conflict / delete

- Новый тип Decision: применение победителя и сохранение losing payload — **PASS в store test**.
- HLC/device tie-break и запрет stale resurrection — **PASS в существующих resolver/integration tests**.
- Реальная двухсторонняя offline conflict/convergence приёмка новых типов — **NOT VERIFIED**.
- Archive/complete/cancel/soft-delete не превращены в физический tombstone.
- Walk/routine deletion сохраняет orphan-safe исторические записи, включая последующее remote применение истории без родителя.
- Ошибка dependency/mapper/IndexedDB откатывает domain/meta/conflict/ledger/cursor вместе.

## Проверки

### Автоматические

- Первичный SYNC/compatibility targeted-набор: 31 файл / 124 теста; обнаруженный snapshot proxy-call mismatch исправлен, затронутые 3 файла / 26 тестов затем прошли.
- Focused SYNC-04 + engine: 13 файлов / 80 тестов PASS до финальных race regressions; дополнительные актуальные capture/apply/settings/bootstrap проверки PASS (4 файла / 33 теста).
- Общий unit/integration прогон перед последними race fixes: 358 файлов / 3008 тестов PASS; infra 6 / 55 PASS; alpha 1 PASS. Это промежуточные результаты, не замена финальному gate.
- Финальный `npm run verify`: **PASS (exit 0)** — typecheck, lint (0 errors / 13 прежних warnings), 358 файлов / 3016 unit/integration tests, infra 6 файлов / 55 tests, alpha 1 test, web build, format и `git diff --check`.
- Supabase local pgTAP/RLS: **PASS — 3 файла / 129 тестов**, `.\node_modules\.bin\supabase.cmd test db`, существующая локальная тестовая БД. Новые grants/RPC/schema не добавлялись.
- Полный `npm run test:e2e`: **FAIL**, один timeout из 160 сценариев — desktop WALK-14 long data/literal analytics 1920×1080. Остальные сценарии завершились PASS/SKIP. Прогон занял 905,81 с; managed teardown подтвердил освобождение 4173.
- Изолированный тот же WALK-14: **PASS — 1/1, 7,66 с**. Причина первого timeout не доказана; результат полного suite не переименован в PASS. Полный suite автоматически повторно не запускался. Эти browser результаты предшествуют последним settings/bootstrap race fixes.

### Builds

- Web production: **PASS**, TypeScript + Vite, 684 modules.
- Windows `npm run tauri -- build --ci`: **FAIL (exit 1)**. Release executable и NSIS installer созданы, но полный gate остановлен отсутствием `TAURI_SIGNING_PRIVATE_KEY`. Updater signing config не обходилась, ключи не заменялись. Этот native build предшествует последним race fixes.
- Android `npm run tauri -- android build --apk --ci --target aarch64`: **PASS (exit 0)** после разрешения загрузки штатного Gradle вне сетевого sandbox. Использованы существующие Android identity/signing config; установка не выполнялась. APK: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`, 17 537 136 bytes. Rust release + APK packaging прошли; warnings SDK XML/deprecated Gradle features не скрыты. Целевая проверенная ABI — aarch64, не все платформы.

### Real device и безопасность

- `adb devices -l`: список устройств пуст. Galaxy A23 не подключён.
- Android → Windows, Windows → Android, двусторонний offline merge, linked entities, полное закрытие/перезапуск обеих production apps: **NOT VERIFIED**.
- Local source/secret scan: приватные ключи/service-role литералы и debug logging decrypted content в проверенных production sync source не найдены; signing/env files не tracked. Проверки не читали реальные дневники/цели и не публиковали содержимое пользовательской БД.
- Transport по-прежнему получает encrypted envelope. Утверждение «в реальном Supabase новых plaintext записей нет» не выдаётся за выполненную live-проверку: production SYNC-04 отправка в этой задаче не выполнялась.
- RLS foreign/pending/revoked denial подтверждён локальными SQL tests, не новым физическим сценарием.
- Фото/файлы не отправляются. Имеющаяся локальная Goal cover/Walk photo сохраняется при remote structured update; у новой удалённой записи binary отсутствует. Отдельного stable attachment-ID в этих record models пока нет — его перенос не заявляется.
- Данные устройств не очищались и не заменялись. Приложения не удалялись/не переустанавливались. Signing identity, package identifier, release и Git remote не менялись. Commit/push не выполнялись; исходный dirty tree сохранён.

## STOP gate — 32 критерия

| №     | Критерий                                           | Итог                                                                    |
| ----- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | Pilot works                                        | PASS, автоматические regression tests                                   |
| 2–4   | Inventory/classification/registry                  | PASS                                                                    |
| 5     | No second engine                                   | PASS                                                                    |
| 6–7   | IDs / relationship round-trip                      | PASS, fixtures; first-merge constraint ниже                             |
| 8–10  | Local-first / no echo / shared engine              | PASS, tests                                                             |
| 11    | E2EE path                                          | PASS, прежний encrypted protocol/transport                              |
| 12    | Live Supabase plaintext absence                    | NOT VERIFIED, новая production отправка не выполнялась                  |
| 13    | New-type offline different-object merge            | PARTIAL: distinct-ID unique-index collision                             |
| 14–15 | Deterministic conflict / losing version            | PASS, tests; physical acceptance не выполнена                           |
| 16–18 | Tombstones / no resurrection / state semantics     | PASS, representative tests; physical acceptance не выполнена            |
| 19    | Restart-safe bootstrap                             | PASS, checkpoints + race/batch tests                                    |
| 20    | First merge of existing device data                | FAIL: уникальные domain indexes                                         |
| 21–24 | Allowlist / preference / local UI / derived policy | PASS, tests/source inventory                                            |
| 25    | Attachments excluded                               | PASS                                                                    |
| 26    | Windows production build                           | FAIL: updater signing key недоступен                                    |
| 27    | Android production build                           | См. финальный результат ниже                                            |
| 28    | Existing user data preserved                       | Устройства не изменялись; synthetic migration/snapshot regressions PASS |
| 29    | RLS denial                                         | PASS, local SQL tests                                                   |
| 30    | Secret/plaintext scan                              | Static scan PASS; live content audit не выполнялся                      |
| 31    | Real Windows ↔ Galaxy A23                          | NOT VERIFIED: ADB device отсутствует                                    |
| 32    | SYNC-05 not started                                | PASS                                                                    |

## Реальные блокеры

1. **Identity policy / first merge.** Например, два Day с разными ID и одной датой конфликтуют с `days.byDate (unique)`. Аналогичные ограничения есть у morning/evening cycles, tomorrow/preparation plans, routine occurrence keys и normalized Sphere/Exercise names. Локальная запись сохраняется, входящий event не применяется, cursor не продвигается. Общая quarantine не решает предметную сходимость. Требуется согласовать модель сохранения обеих записей/конфликтов и связанных ID; удалять индексы или объединять по именам без такого решения нельзя.
2. **Windows signing.** Нужен доступ к существующему updater signing key через штатное окружение сборки; не новый ключ и не отключение подписи.
3. **Physical acceptance.** Нужен подключённый Galaxy A23 и доступ к обеим существующим enrolled installations для сценариев A–I без очистки данных.
4. **Browser evidence.** Полный suite имел один неподтверждённый timeout, изолированный сценарий прошёл. Полный PASS на финальной ревизии не заявляется.

## Финальные результаты

- `npm run verify`: **PASS**, итоговый код 0, 3016 unit/integration tests.
- Android arm64 release build: **PASS**, итоговый код 0.
- APK signature: `apksigner verify --verbose --print-certs` **PASS**, APK Signature Scheme v2; SHA-256 артефакта `2339F4579BA2870BFFE8F873CA67F7482464362407EE9EAD079BB108006C1EE0`. Signing certificate SHA-256: `f3669cd0ca91cd17670e01a284d07493330bcaf32d4993cfbb88ca5099d92c69`.
- Windows полный native production gate: **FAIL**, отсутствует штатный updater signing key.
- Полный browser gate: **FAIL / не подтверждён на финальном коде**, один исходный timeout; isolated scenario PASS.
- Real-device acceptance: **NOT VERIFIED**, `adb devices -l` повторно пуст.
- Diff review, static source/bundle scan и `git diff --check` выполнены; production fixtures/private-key patterns в `dist` не найдены. Репозиторий остаётся dirty с сохранёнными исходными незакоммиченными изменениями; commit/push не выполнялись.
- Независимый read-only review выявил bootstrap и settings interleavings; они воспроизведены RED и исправлены с регрессиями. Review не выдавал разрешения на production merge при оставшейся first-merge коллизии.

**STOP: SYNC-04 остаётся PARTIAL. Фразу о готовности к SYNC-05 не использую, поскольку обязательные критерии не доказаны.**
