# SYNC-06 — Final UX and End-to-End Acceptance

## SYNC-06 STATUS

**BLOCKED — код и доступные проверки завершены, итоговый physical master не выполнен.**

Galaxy A23 подключён, но защищён системным PIN-экраном. ADB подтвердил `showing=true` /
`mIsShowing=true`; безопасный `dismiss-keyguard` открыл ввод PIN. Пользователю отправлена
просьба разблокировать телефон вручную; ответа пока нет. PIN не запрашивался и не вводился.
Это физическое действие, а не нехватка разрешения на реализацию.

Дополнительно: действующая настроенная установка не показывает принимающую QR-форму.
Scanner доступен только ненастроенной native installation. Физический scan/pending→active
и полный recovery import ещё не подтверждены; очистка/переустановка профиля или замена
trust identity ради PASS не выполнялись. Нужна отдельная безопасная ненастроенная native
установка для этого сценария. Уже действующая пара epoch 3 не считается доказательством scan.

Утверждённые source: `LifeOS_SYNC_06_Codex_Task.md` и `LifeOS_Sync_v1_Design.md` из Downloads.
[План](../superpowers/plans/2026-09-08-lifeos-sync-06-final-ux-e2e.md),
[дизайн-контракт](../design/features/2026-09-08-sync-06-final-ux.md),
[руководство](SYNC_V1_USER_GUIDE.md).
SYNC-04 физический долг остаётся здесь, предыдущие этапы не перезапускались.
Dirty baseline сохранён; commit, push, публикации и следующего этапа нет.

## FINAL UX

- Sync screen: реализован и проверен в native Windows и browser desktop/mobile.
  Статус, устройства, защита, вложения, snapshots, conflicts и Recently Deleted используют
  прежние application services и durable stores.
- Global indicator: один видимый индикатор; desktop — существующий нижний слот sidebar,
  mobile — компактная строка. Offline нейтрален; green требует успешного обмена и пустых очередей.
- Devices: native список current/active/revoked, платформы и дат проверен. Реальный отзыв
  текущих trusted устройств в этом этапе не выполнялся; серверные ограничения проверены SQL.
- QR: native Windows создание, отрисовка, пятиминутный countdown и отмена PASS; payload 299
  символов, постоянный recovery/private/space key не обнаружен. Физический Android scan — pending.
- Recovery key: native reveal/hide PASS; секрет скрыт по умолчанию. Добавлен импорт `.txt`.
  Реальный download/import/re-enrollment на A23 не проверен, не заявлен PASS.
- Conflicts: читаемые метки, даты, retention, inspect/restore; прежняя история сохраняется.
  Новое same-base столкновение двух физических устройств и losing-version restore — pending.
- Recently Deleted: native Windows inspect/restore новой synthetic цели PASS; новая revision,
  обязательный проверенный pre-restore snapshot, обложка возвращена.
- Backups: native manual create/verify/cloud roundtrip/preview/cancel PASS; daily/weekly
  metadata видна, политика покрыта unit/integration.

[Browser desktop](evidence/SYNC_06_desktop.png), [browser mobile](evidence/SYNC_06_mobile.png),
[native Windows](evidence/SYNC_06_native_windows_settings.png).
Имена устройств и списки профиля на native screenshot закрыты масками.
Проверены wrap, отсутствие horizontal overflow, доступность 44px controls и focus в E2E.
Физический Galaxy A23 visual review ещё не выполнен. Новый approved/locked mockup не заявлен.

## IMPLEMENTATION / DEFECTS

- Metadata-only status source кеширует небольшие проекции; commit invalidation читает только
  изменившиеся technical stores. UI не копирует большие image/snapshot blobs в общий status.
- Commit observer публикует фактические успешные writes только после transaction complete;
  работает при capture suppression, игнорирует abort и изолирует исключения слушателей.
- Goal/Walk media обновляются после materialization. Retry проверяет space/membership/state/lease
  атомарно и использует существующий transfer engine.
- Online transport failure отделён от offline; ошибка чтения status не маскируется как local mode.
  Foreground lifecycle не опрашивает сеть в скрытой вкладке.
- Review выявил повторное открытие Sync вместо «Ещё»: shell теперь погашает одноразовый запрос.
  Desktop/mobile roundtrip regression PASS.
- Full E2E выявил лишние 52px над locked evening scene: desktop indicator перенесён в sidebar.
  Точный сценарий 1280×720 и последующий полный suite PASS. Вечерняя бизнес-логика не менялась.
- В разделе «Ещё» заменена устаревшая подпись SYNC-02 об отсутствии синхронизации записей.
  После этой текстовой правки 11 связанных тестов и production build/typecheck прошли;
  поведение не менялось, повтор полного E2E не требовался.
- Старые SQL01/02 ожидали отсутствие любых Storage uploads. Assertions обновлены до точного
  allowlist существующей immutable INSERT policy SYNC-05; public write denial сохранён.
  pgTAP failure теперь вызывает SQL exception; negative probe подтвердил exit 1.

## STRUCTURED SYNC

| Проверка                                             | Итог этого этапа                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Android → Windows hierarchy / representative records | НЕ ПРОВЕРЕНО: A23 locked                                          |
| Windows → Android                                    | НЕ ПРОВЕРЕНО в новом master                                       |
| Relationships                                        | Полные registry tests PASS; physical graph pending                |
| Offline different-object merge                       | Tests PASS; physical pair pending                                 |
| Same-object convergence / losing-version restore     | Tests PASS; physical pair pending                                 |
| Singleton-per-date                                   | Tests PASS; physical pair pending                                 |
| Tombstone anti-resurrection                          | Tests PASS; native Windows delete/restore PASS; stale A23 pending |
| Restart                                              | Native Windows PASS; Android restart/catch-up pending             |

Кандидат для singleton — `2000-01-15`: на Windows Day/EveningCycle отсутствует.
Перед выполнением необходимо проверить отсутствие на Android. Безопасный UI-путь:
Распорядок → День → прошлая дата → Вечер → выйти, не запускать цикл.
Он создаёт planned Day, но не сохраняет preview EveningCycle. Future date этот путь отвергает.
В текущем этапе synthetic Day/Journal не создавались.

## ATTACHMENTS

Windows synthetic goal `SYNC06_TEST_WINDOWS_OFFLINE_20260908` создан через обычную форму
с PNG из существующих app icons при отключённой сети в native WebView:

1. Локальный save: Goal revision 1, обложка доступна, Outbox 1, attachment `pending-upload`.
2. Приложение полностью закрыто в этом состоянии.
3. Новый запуск с сетью: тот же attachment ID стал `uploaded`, cloudVerified=true, Outbox 0,
   parent ID/version и обложка сохранились; UI показал «Вложение синхронизировано».

[До restart](evidence/SYNC_06_native_offline_before_restart.json),
[после](evidence/SYNC_06_native_offline_after_restart.json),
[native UI](evidence/SYNC_06_native_windows_attachment.png).
Android→Windows и Windows→Android media в новом master не проверены; прежний SYNC-05 physical
PASS не подменяет эту приёмку. Tamper/quota/permission/retry/parent preservation покрыты
актуальным full unit/integration, native binary crypto и hosted Storage policies.

## RECOVERY / BACKUPS

- Synthetic Goal удалён штатно: tombstone revision 2.
- Recently Deleted → inspect → restore → confirmation: восстановлена цель с обложкой,
  revision 3, предварительно добавлен проверенный pre-restore snapshot.
- Cleanup снова штатно удалил только эту цель: tombstone revision 4, Outbox 0.
- [Доказательство delete/restore/cleanup](evidence/SYNC_06_native_deleted_restore.json).
- Manual snapshot `1b153a04-4be0-4c40-94f0-ff6612e7a4f9`: local/cloud verified;
  свежий preview added/changed/deleted=0, предупреждение о pre-restore видно, отмена PASS.
  [Evidence](evidence/SYNC_06_native_backup.json).
- Daily / weekly: актуальные unit/integration PASS; existing native verified daily/weekly видны.
- Полный restore apply выполнен только в изолированном browser synthetic state:
  реальные recovery service/store/UI, verified pre-restore, атомарный apply, 4/4 UX E2E.
  Fixture crypto test-only; native E2EE отдельно доказан Rust tests и native cloud roundtrip.
- Полный restore реального профиля не выполнялся.

Windows restart проверен отдельно до synthetic create: cursor 72, Outbox 0, очередь и snapshots
сохранены, исходные record fingerprints совпали. [Assertions](evidence/SYNC_06_windows_restart_assertions.json).
Один первый launch завис до HWND/WebView с нулевым CPU; один контролируемый relaunch того же EXE
восстановил запуск. Следующие два restart также прошли. Причина первого stall не установлена;
это не выдаётся за исправленный product defect. Runtime/source/config/PE diagnostics не нашли
ошибочной platform config или отсутствующей импортируемой DLL.

## SECURITY

- Plaintext user content / private keys на сервере: не обнаружены в проверенных schema/envelope
  и opaque-path assertions; decrypted content или secret значения запросы не выводят.
- Hosted SQL01 (54 assertions), SQL02 (45), SQL03 (30), SQL05 private/active/pending/revoked/
  foreign/opaque-path assertions — PASS. Fixtures завершаются ROLLBACK.
- SQL06 read-only privacy — PASS: ciphertext/nonces, отсутствие plaintext/secret columns,
  private buckets, UUID/UUID/version Storage paths. Финальная проверка после cleanup: 73 encrypted events, 46 encrypted objects,
  9 attachment blobs, 11 snapshot blobs — PASS.
- Crypto: 7 native Rust tests PASS — fresh nonce, authenticated metadata/ciphertext tampering,
  intended recipient, recovery derivations, retained epoch и binary integrity.
- [Secret scan](evidence/SYNC_06_secret_scan.json): 1461 candidate files; единственное совпадение —
  намеренно недопустимый synthetic secret в SupabaseConfig rejection test. Реальных credential
  literals / tracked signing or environment secret files не найдено. Это scoped scan, не
  заявление об аудите всех внешних логов или локального диска.
- QR и recovery root не записывались в evidence/logs. Native screenshots маскированы.

## BUILDS / TESTS

| Проверка                       | Результат                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Targeted status/cache          | 1 файл / 3 PASS                                                                               |
| Fast                           | 146 файлов / 1485 PASS                                                                        |
| `npm run verify`               | PASS: typecheck, lint, 368 файлов / 3063 tests, 55 infra, 1 alpha, build, format, Git hygiene |
| После финальной layout-правки  | 7 shell tests, 6 targeted E2E, production build/typecheck, scoped lint/format/diff PASS       |
| После финальной правки текста  | 11 SectionPages tests, production build/typecheck PASS                                        |
| Полный `npm run test:e2e`      | PASS: 135 passed, 31 planned project-specific skips, 0 failed, 0 flaky; 1017.21 с             |
| Native crypto                  | 7/7 PASS                                                                                      |
| Hosted SQL/RLS/Storage         | PASS; negative TAP probe ожидаемо exit 1                                                      |
| Windows production final       | PASS, 102.97 с; включает финальную правку текста                                              |
| Android arm64 production final | PASS, 126.05 с; `adb install -r` Success; включает финальную правку текста                    |
| `git diff --check`             | PASS; независимый read-only review не выявил материальных замечаний                           |

[E2E counts](evidence/SYNC_06_e2e_stats.json), [artifact SHA-256 / ABI](evidence/SYNC_06_builds.json).
APK содержит только arm64-v8a; package `com.lifeos.desktop`, версия 1.0.2 и signing сохранены.
Native Windows запущен из `src-tauri/target/release/lifeos.exe`.
Последний запуск из ограниченной среды создал окно без WebView/CDP; запуск того же EXE вне
ограниченной среды сразу прошёл native health и переход к Sync. Это указывает на влияние
среды запуска, но не устанавливает причину ранее наблюдавшегося pre-WebView stall.
NSIS/updater publication/signing changes не выполнялись.

Первый verify остановился на формате редактировавшегося E2E-файла; исправленный verify PASS.
Первый полный E2E с подтверждённым layout failure остановлен на своём Playwright PID при
scenario 111/166; следующий полный прогон на исправленном коде PASS. Это не hang/retry masking.
Managed teardown сообщал primary Windows tree Access denied, затем exact owned root exited и
порт 4173 released: RECOVERED/PASS. Чужие процессы не завершались.
Остались 13 прежних lint warnings в morning/evening и existing Vite/Gradle warnings.

## REAL DEVICE ACCEPTANCE / CLEANUP

- Galaxy A23 SM-A235F / Android 14 / arm64 подключён; финальное обновление установлено.
- Master A–I Windows↔A23 **не выполнен** из-за заблокированного телефона.
- Windows original record fingerprints после всех synthetic операций совпали с baseline;
  активных SYNC06 test records 0, Outbox 0, quarantine 0.
  [Cleanup assertions](evidence/SYNC_06_cleanup_assertions.json).
  После запуска окончательной сборки сравнение повторно прошло:
  [final build restart](evidence/SYNC_06_final_build_restart.json).
- Android данные не очищались; использован только install -r с прежней подписью. Чтение
  Android profile и финальная UI-проверка ожидают unlock.
- Приглашения отменены, recovery export panel скрыт, network override снят.
- Сохранены manual/pre-restore backups и retained synthetic tombstone/media согласно retention.
  Direct Storage cleanup не выполнялся. Исходный app icon не менялся.
- Временные скрипты диагностики удалены после фиксации evidence; build outputs/evidence сохранены.

## PASS CRITERIA — 32 пункта

| №   | Критерий                         | Доказательство / статус                                                       |
| --- | -------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Windows + A23 usable UX          | Windows/browser PASS; physical A23 pending                                    |
| 2   | Global indicator                 | PASS, native + desktop/mobile E2E                                             |
| 3   | Device management                | UI/SQL PASS; реальный новый lifecycle pending                                 |
| 4   | QR/recovery UX                   | Windows invitation/reveal PASS; Android scan/import pending                   |
| 5   | Structured bidirectional         | Physical master pending                                                       |
| 6   | Relationships                    | Tests PASS; physical graph pending                                            |
| 7   | Offline merge                    | Tests PASS; physical pair pending                                             |
| 8   | Conflict convergence             | Tests PASS; physical pair pending                                             |
| 9   | Losing-version restore           | Tests PASS; новое physical collision pending                                  |
| 10  | Tombstone anti-resurrection      | Tests PASS; stale A23 pending                                                 |
| 11  | Recently Deleted restore         | Native Windows PASS; A23 convergence pending                                  |
| 12  | Singleton date convergence       | Tests PASS; physical pair pending                                             |
| 13  | Bidirectional attachments        | Новый physical pair pending                                                   |
| 14  | Offline attachment resume        | Native Windows PASS; A23 pending                                              |
| 15  | Corrupt attachment fails closed  | Native crypto + transfer tests PASS                                           |
| 16  | Parent survives transfer failure | Transfer tests + Windows offline PASS                                         |
| 17  | Manual backup                    | Native local/cloud PASS                                                       |
| 18  | Daily/weekly logic               | Tests PASS                                                                    |
| 19  | Snapshots encrypted/verified     | Native crypto + manual cloud roundtrip PASS                                   |
| 20  | Restore preview                  | Native Windows + browser PASS                                                 |
| 21  | Mandatory pre-restore            | Native history restore + isolated full apply PASS                             |
| 22  | Isolated safe apply              | Desktop/mobile E2E PASS                                                       |
| 23  | Restart persistence              | Windows PASS; A23 pending                                                     |
| 24  | Foreign/pending/revoked RLS      | Hosted SQL PASS                                                               |
| 25  | Server privacy                   | Scoped SQL/native crypto PASS; scope described above                          |
| 26  | Secrets not tracked/logged       | Scoped scan/guarded evidence PASS                                             |
| 27  | Windows production               | PASS                                                                          |
| 28  | Android production               | PASS + update installed                                                       |
| 29  | verify                           | PASS + targeted validation of last layout change                              |
| 30  | Full E2E                         | PASS, 135/31/0                                                                |
| 31  | Real Windows↔A23 master          | BLOCKED, PIN unlock required                                                  |
| 32  | Real user data preserved         | Windows fingerprints PASS; Android install-r preserved, physical read pending |

## KNOWN LIMITATIONS

- Нет always-running closed-app Android sync: обмен при открытом приложении, catch-up при start/resume.
- Нет iOS, multi-user collaboration и server-side plaintext search.
- Подтверждение Android installation/update остаётся системным.
- Hard cleanup Storage отложен; attachment limits и history/snapshot retention описаны в руководстве.
- Принимающий scanner нельзя проверить на уже configured A23 без отдельной безопасной
  ненастроенной native installation. Это не разрешение на сброс текущего профиля.
- Первый Windows pre-WebView stall не воспроизвёлся после relaunch; причина остаётся неизвестной.

## RELEASE READINESS

**LifeOS Sync v1 ready for normal use: NO.**

Продолжение SYNC-06 требует ручной разблокировки A23 и завершения перечисленного physical master.
Код, успешные gates и сохранённые backups повторно пересоздавать не требуется без новых изменений.
Независимый review проверил соответствие отчёта evidence, исправление sidebar и честность
разделения Windows/browser PASS и незавершённой физической приёмки; материальных замечаний нет.
Следующий этап не начат. Итоговый PASS/STOP закрытия SYNC-06 не заявлен.
