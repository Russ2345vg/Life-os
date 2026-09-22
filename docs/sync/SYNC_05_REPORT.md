# SYNC-05 — Attachments, Recovery, Backups

Дата: 2026-09-07…08. Рабочий проект: `D:/LifeOS-App`.

## SYNC-05 STATUS

**PASS.** Реализация, hosted Storage/RLS и физическая Windows ↔ Galaxy A23 приёмка
SYNC-05 завершены. STOP gate достигнут. SYNC-06 не начат.

Утверждённое задание: `C:/Users/Руслан/Downloads/LifeOS_SYNC_05_Codex_Task.md`.
Архитектурный source of truth: `C:/Users/Руслан/Downloads/LifeOS_Sync_v1_Design.md`.
Предсуществующие незакоммиченные SYNC-01…04 и остальные изменения сохранены.
Commit, push и публикация не выполнялись. После явного разрешения пользователя применена
Storage migration, установлен APK и запущены обе сборки на текущих профилях. Созданы
зашифрованные snapshots текущих данных в связанном Supabase. Изменения и восстановления
предметных записей выполнялись только для отдельных `SYNC05-QA-*` fixtures.

## ATTACHMENT INVENTORY

- **SYNC BINARY NOW:** `Goal.coverImage` в Goal Album и `Walk.photo`; существующие persistent
  IndexedDB records, data URL + MIME + размер, лимит приложения 5 МиБ.
- **REFERENCE ONLY:** структурные связи WalkCapture/journal, встроенная подстановка обложки.
- **LOCAL CACHE / DERIVED:** bundled backgrounds, presentation caches.
- **TEMPORARY:** результат FileReader/camera до сохранения application-командой.
- **NOT IMPLEMENTED:** отдельные коллекции Goal gallery, journal/project/goal files,
  filesystem media repository. Новые продуктовые виды вложений не добавлялись.

## STORAGE / CRYPTO

- Оба существующих bucket `lifeos-attachments` и `lifeos-snapshots` приватные: свежая
  read-only проверка связанного Supabase подтвердила `public=false`.
- Использован существующий native key ring, HKDF purpose namespace и XChaCha20-Poly1305.
  AAD связывает purpose, space, object ID, key epoch, immutable version и snapshot schema/kind.
  MIME, размер, image data и snapshot manifest находятся внутри ciphertext.
- Native regression проверяет обе цели шифрования, random nonce, wrong key, tamper,
  подмену AAD/version и историческую epoch. Recovery использует существующий secure key-ring path;
  отдельная криптосистема или plaintext fallback не создавались.
- Пути: `space UUID / opaque attachment-or-snapshot UUID / immutable version`.
  Upload использует supported Storage API, `upsert:false`; повтор сравнивает существующий ciphertext.
  UPDATE/DELETE policy и hard cleanup не добавлены.
- Применена [additive INSERT policy](../../supabase/migrations/20260907010000_sync_05_encrypted_storage.sql)
  и [SQL-проверка active/foreign/pending/revoked](../../supabase/tests/database/sync_05_storage_test.sql).
  Версия `20260907010000` записана в migration history проекта `oytsyvmlkngsmpevbbct`.
  SQL PASS до и после установки; rollback fixtures удалены откатом транзакции.
- [Storage HTTP acceptance](../../supabase/tests/sync_05_storage_http.mjs) — PASS для обоих buckets:
  active upload/download с точным совпадением ciphertext; duplicate/overwrite/delete не меняют
  байты; foreign/pending/revoked upload/read denied; public URL и plaintext filename path denied.
  Финальный SQL подтвердил revoked status, installed policy/migration и два private bucket.
  [Полный HTTP manifest](evidence/SYNC_05_http_final.json) содержит 16 проверок и отметку completion.
- HTTP fixture использует стандартный AES-GCM только для синтетических тестовых байтов Storage;
  это не production crypto и не доказательство native E2EE. Production XChaCha проверен Rust-тестом
  и реальным обменом изображениями между устройствами. Новые app blobs — encrypted envelopes;
  содержимое старых чужих объектов вне задания не сканировалось.
- HTTP fixtures retained: два запуска, шесть anonymous test identities, четыре пространства,
  пять devices (четыре active, один revoked), четыре encrypted objects по 137 байт (548 байт всего).
  [Первый запуск](evidence/SYNC_05_http_initial.json) остановлен до pending/revoked после уточнения
  denial-проверки на новый path; он не объявлен полным PASS. Tokens/fixture keys не записывались.

## ATTACHMENT QUEUE

Durable IndexedDB queue регистрируется в одной транзакции с parent mutation/outbox.
UUID и версия сохраняются при retry; superseded files tombstoned и сохраняют локальные байты.
Lease 120 секунд, bounded foreground batch, exponential backoff с jitter, retry после restart.
Transfer отделён от structured sync. Ошибка квоты/сети не откатывает родительскую запись.
Проверка ciphertext roundtrip, AEAD и внутреннего SHA-256 предшествует materialization;
повреждение переводит запись в quarantine. MIME соответствует действующему `image/*` contract.
Живой parent/queue проверяются в транзакции: завершение старой передачи не возвращает удалённое фото.
Storage HTTP ограничен временем и размером; structured/auth запросы этим wrapper не изменены.

## PRODUCT ATTACHMENTS

| Тип                 | Автоматическая проверка                                                     | Физическая приёмка    |
| ------------------- | --------------------------------------------------------------------------- | --------------------- |
| Goal Album cover    | Две IDB, upload/download, edit без technical ref, restart, quarantine/retry | PASS, оба направления |
| Walk photo          | Две IDB, upload/download, edit без technical ref, restart, quarantine/retry | PASS, оба направления |
| Другие binary types | N/A по inventory                                                            | N/A                   |

Structured events содержат только immutable attachment reference; data URL туда не попадает.

## RECOVERY HISTORY

Список и inspect проигравших версий, отдельное подтверждение restore.
Restore — новая локальная mutation через existing registry/recorder/HLC/outbox.
История сохраняется; запись помечается resolved атомарно.
Synthetic regression проверяет восстановление controlled conflict, новую revision и convergence
второй изолированной IDB. Неизвестные/неполные legacy payload не выдаются за восстановимые.

## RECENTLY DELETED

Before-image удерживается в tombstone metadata. UI показывает срок доступности 30 дней;
старые tombstones без payload видны как невосстановимые. Manual restore создаёт новую revision.
Stale remote decision перепроверяется внутри apply transaction и не отменяет более новый restore.
Hard cleanup не выполняется ни для записей, ни для файлов, ни для снимков.

## BACKUPS

- Manual, daily, weekly и pre-restore snapshots; локальный read-back/decrypt/hash до `verified`.
- Daily/weekly catch-up при открытом приложении, включая offline; один снимок на UTC day/week.
  Local verified и cloud verified различаются; cloud upload имеет durable retry metadata.
- Retention metadata: manual без автоматического удаления, daily 30 дней, weekly 84 дня,
  pre-restore 30 дней. Удаление отложено; reference/device-cursor cleanup не реализовывался.
- Снимок охватывает existing structured registry и значимые настройки; непереданные изображения
  включаются внутрь encrypted snapshot, подтверждённые облачные — immutable references.
- Restore preview: дата, совместимость schema, counts, add/change/delete, локальная доступность фото.
- **Перед любым restore обязателен проверенный pre-restore snapshot.** Ошибка его создания
  предотвращает apply. Fingerprint перечитывается и проверяется повторно в write transaction.
- Apply валидирует domain records/связи и ограничение одной активной прогулки/рутины.
  Изменения records, outbox, tombstones и attachment queue атомарны в IndexedDB.
  Значимые localStorage settings используют существующий durable staging/materialization path.
- Schema mismatch, повреждение, отсутствующая обязательная связь или изменившийся preview
  не должны уничтожать текущее состояние. Полный restore реальных данных не выполнялся.
- Cloud discovery принимает только успешно расшифрованный и проверенный manifest.
- Лимит native plaintext snapshot — 64 МиБ, transport envelope — 96 МиБ. При превышении
  создание отклоняется до restore. Собственный streaming cipher не добавлялся; большой архив
  требует отдельного решения. Исходные фото сохраняются в существующем persistent IDB.

## REAL DEVICE

Windows release и Galaxy A23 `SM-A235F` / Android 14 / arm64, существующее пространство
`10ca7d74-e986-42d1-ba23-5981fc06dd6b`, retained key epoch 3 — **PASS**:

| Проверка                           | Результат и доказательство                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows → Android cover            | Золотой checkerboard в `SYNC05-QA-WINDOWS-COVER-V2`; [Android screenshot](evidence/SYNC_05_native_android_received.png)                                                                |
| Android → Windows cover            | Зелёный checkerboard; native download/decrypt/integrity, `available-local`; [Windows screenshot](evidence/SYNC_05_native_windows_received.png)                                         |
| Windows → Android Walk photo       | Короткая completed QA-прогулка, золотое фото; [Android screenshot](evidence/SYNC_05_native_android_walk.png)                                                                           |
| Android → Windows Walk replacement | Зелёный файл выбран через системный Files, «Фото сохранено»; точное совпадение PNG/data URL на Windows; [Windows screenshot](evidence/SYNC_05_native_windows_walk.png)                 |
| Offline → restart → reconnect      | Android goal/image создан без Wi-Fi/data, force-stop/relaunch сохранил локальную обложку; reconnect доставил файл. Повторная offline revision после restart также доставлена           |
| Controlled conflict restore        | Разные изменения одной QA-цели при offline Windows; обе competing revision 4. Losing Android version inspected и restored новой revision 5; conflict row retained/resolved             |
| Recently Deleted                   | Та же QA-цель удалена revision 6; исчезла с Android. Inspect/restore создал revision 7 и вернул цель с обложкой на Android; [screenshot](evidence/SYNC_05_native_android_restored.png) |
| Manual snapshot / preview          | Manual snapshot verified локально и в облаке; preview: 30 records, 0/0/0 изменений, 3/3 media; cancel без apply; [screenshot](evidence/SYNC_05_native_preview.png)                     |
| Mandatory pre-restore              | Два verified snapshots перед conflict/deleted restore, затем оба cloud-verified; timestamps сохранены в native evidence                                                                |
| Windows restart persistence        | Реальный stop/relaunch; те же image hashes, queue IDs, resolved conflict, revision 7 и семь verified cloud snapshots; outbox пуст                                                      |

[До перезапуска](evidence/SYNC_05_native_before_restart.json) и
[после перезапуска](evidence/SYNC_05_native_after_restart.json) — metadata-only projections:
без ключей, auth sessions, ciphertext или plaintext snapshots. QA-цели и короткая прогулка
сохранены для проверки; hard cleanup не выполнялся. Сеть телефона возвращена к исходному
состоянию: mobile data enabled, Wi-Fi disabled. Полный restore реального профиля не выполнялся;
full apply/failure сценарии покрыты изолированными синтетическими тестами.

Первую попытку обмена исказил оставшийся старый Windows SYNC-04 процесс: мягкий `taskkill`
сообщил отправку сигнала, но PID продолжал работать с той же IDB. Наблюдался incoming parent
без attachment queue. После завершения точного старого PID проверен единственный SYNC-05
процесс, и новые нормальные QA-mutations подтвердили оба направления. Это была ошибка
окружения приёмки; serializer не менялся ради симптома. Production bundle совпал SHA-256 с dist.
Существующие семь unresolved conflicts дают старый общий badge «Ошибка синхронизации»;
новые очереди пусты и last-success обновляется. Это не новый транспортный отказ.

## REGRESSION

Consolidated verify: typecheck, lint, full unit/integration (365 файлов / 3053 теста),
infra (55 тестов), alpha (1 тест) и production build — PASS. Формат сначала остановился
на созданном CLI cache JSON; после исправления отдельный `npm run format:check` — PASS,
`git diff --check` — PASS. Полный suite повторно не запускался. Локальные Supabase cache/linkage
теперь исключены из Git и formatter; миграции остаются проверяемыми исходниками.

После consolidated suite добавлены проверки immutable SDK retry, tampered/future-schema preview
и body-abort: целевой прогон 3 файлов / 4 тестов — PASS. Runtime после build не менялся.
Финальные `npm run typecheck` и bounded scoped ESLint последних изменённых файлов — PASS.
Ссылки отчёта, формат документации, `git diff --check` и итоговый `git status --short` проверены.
Независимое read-only review: четыре исходных замечания и два уточнения Storage timeout
исправлены и покрыты регрессиями; незакрытых замечаний к этим исправлениям нет.
`npm run test:e2e` — PASS, полный набор 162 scenarios, 1013.61 секунд; предусмотренные
project-specific skip сохранены. Новые SYNC-05 desktop/mobile tests входят в этот набор.
Owned server завершён, порт 4173 освобождён. Primary Windows tree cleanup сообщил Access denied;
managed fallback подтвердил выход собственного root и освобождение порта (RECOVERED/PASS).
Windows native release build — PASS (141.88 секунд),
`src-tauri/target/sync05-windows/release/lifeos.exe`.
Первый build упёрся в занятый `target/release/lifeos.exe`: его использует запущенный LifeOS.
Использован изолированный CARGO_TARGET_DIR с копией build cache; при сборке приложение не закрывалось.
Frontend повторно не пересобирался: использован свежий `dist` из успешного production build.
NSIS/update package/signing/publication Windows не выполнялись.
Android arm64 release APK — PASS (193.84 секунды),
`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`.
В APK проверено наличие только `lib/arm64-v8a/liblifeos_lib.so`.
Первый Android packaging был заблокирован попыткой wrapper скачать Gradle; завершён с
установленным `D:/Android/GradleHome` и разрешённым доступом к локальному cache/localhost.
APK установлен на Galaxy A23 через `adb install -r` — Success, данные сохранены.
Обе сборки запущены для описанной выше native приёмки.
После приёмки проверенный Windows EXE также скопирован в стандартный локальный build path
`src-tauri/target/release/lifeos.exe`; SHA-256 совпал с проверенным артефактом ниже.
Предыдущий EXE сохранён в игнорируемом build directory, его процесс завершён.

После исходного consolidated gate изменены только SQL test fixture (обязательные encrypted device
name поля), hosted HTTP helper и усиление одного attachment test. Receiver в metadata-edit test
теперь configured, проверяются реальная outgoing mutation, сохранение reference и отсутствие
дополнительного события при materialization: `test:target` — 1 файл / 3 теста PASS.
Product runtime после успешных build/E2E не менялся; повтор полного suite не требуется.
Заключительные typecheck (29.20 с), scoped ESLint (3.13 с), Node syntax check HTTP helper,
формат затронутых файлов и Git whitespace check — PASS. Node globals HTTP helper явно
импортированы после первого scoped lint; протокол проверок не изменён. Финальный независимый
read-only review отчёта, native/HTTP evidence и усиленного теста — без материальных замечаний.

SHA-256 артефактов:

- Windows EXE: `FC02369D4B177496D0668EC4C7B3CCB035465063C8527BE9B7211F143AE9DEC0`.
- Android APK: `B46297B591A206D8D1EE2D3FFF078AA630793F0513CA19FF459B469EF3DFA683`.
  Уже проверены targeted recovery/attachment/coordinator/Storage abort regressions,
  `test:fast` (146 файлов / 1483 теста), native binary crypto (1 test), isolated browser
  manual snapshot/preview на desktop/mobile (2 tests).

Browser fixture использует реальный recovery service, IDB adapter и UI, но test-only crypto
и offline transport. Native E2EE проверяется отдельно Rust-тестом.
Визуально просмотрены [desktop](evidence/SYNC_05_desktop.png) и
[mobile](evidence/SYNC_05_mobile.png): вертикальная композиция, читаемые состояния,
кнопки помещаются, horizontal overflow отсутствует. Это не approved новый макет.

## KNOWN VERIFICATION DEBT

**SYNC-04 physical acceptance debt retained for final SYNC-06 acceptance.**

SYNC-04 больше не используется как блокер SYNC-05. Свежая read-only проверка Supabase
подтвердила наличие актуальной structured push RPC с `p_origin_device_id`; старый отчёт SYNC-04
описывает прежнее состояние. Его физический долг сохраняется для SYNC-06.

## STOP GATE — доказательства

`LOCAL PASS` означает synthetic/native/IDB проверку; это не физический hosted PASS.

| №   | Критерий                       | Статус                                                       |
| --- | ------------------------------ | ------------------------------------------------------------ |
| 1   | Existing Sync Engine reused    | PASS                                                         |
| 2   | Attachment inventory complete  | PASS                                                         |
| 3   | Stable opaque IDs              | LOCAL PASS                                                   |
| 4   | Encryption before upload       | Native + transport LOCAL PASS                                |
| 5   | Private Storage only           | HOSTED SQL + HTTP PASS                                       |
| 6   | Foreign/pending/revoked denied | HOSTED SQL + HTTP PASS                                       |
| 7   | Durable queue                  | LOCAL PASS                                                   |
| 8   | Restart-safe retry             | LOCAL PASS                                                   |
| 9   | Parent survives file failure   | LOCAL PASS                                                   |
| 10  | Integrity verification         | LOCAL PASS                                                   |
| 11  | Corrupt blob fails closed      | LOCAL PASS                                                   |
| 12  | Goal Album image sync          | LOCAL + PHYSICAL PASS, оба направления                       |
| 13  | Walk photo sync                | LOCAL + PHYSICAL PASS, оба направления                       |
| 14  | Offline resume                 | LOCAL + PHYSICAL PASS                                        |
| 15  | Conflict history restore       | LOCAL + PHYSICAL PASS; retained history, new revision        |
| 16  | Recently Deleted restore       | LOCAL + PHYSICAL PASS; Android convergence                   |
| 17  | Stale event cannot restore     | LOCAL PASS                                                   |
| 18  | No premature hard cleanup      | PASS: cleanup deferred                                       |
| 19  | Manual snapshot                | LOCAL + PHYSICAL PASS                                        |
| 20  | Daily logic                    | LOCAL PASS                                                   |
| 21  | Weekly logic                   | LOCAL PASS                                                   |
| 22  | Snapshot E2EE                  | Native + PHYSICAL cloud roundtrip PASS                       |
| 23  | Snapshot verification          | LOCAL + PHYSICAL cloud PASS                                  |
| 24  | Restore preview                | Browser desktop/mobile + native Windows PASS                 |
| 25  | Mandatory pre-restore          | LOCAL + PHYSICAL PASS                                        |
| 26  | Fail-safe restore              | LOCAL PASS: transaction/fingerprint/invariants               |
| 27  | Retained epoch key recovery    | Native key-ring regression PASS; real epoch 3 roundtrip      |
| 28  | Quota isolation                | LOCAL PASS                                                   |
| 29  | User data preserved            | PASS: only QA-record mutations; encrypted backups authorized |
| 30  | Secret/plaintext scan          | Scoped source scan PASS; remote inventory не сканировался    |
| 31  | SYNC-04 debt documented        | PASS                                                         |
| 32  | SYNC-06 not started            | PASS                                                         |

## REAL BLOCKERS

Незакрытых блокеров SYNC-05 нет. Предыдущие отказы auto-review на remote mutation и запуск
с реальными snapshots сняты явными разрешениями пользователя; отказанные действия до
разрешения не выполнялись. Ограничение размера snapshots и deferred hard cleanup описаны выше.
Общий UX-текст пилота, оформление и полный долг SYNC-04 остаются для SYNC-06.

**SYNC-05 завершён. Готов к SYNC-06 — Final Sync UX and End-to-End Acceptance.**

**STOP. SYNC-06 не начат.**
