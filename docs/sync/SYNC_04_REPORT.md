# SYNC-04 — итоговый STOP-gate отчёт

Дата: 2026-09-07. Worktree: `D:/LifeOS-App`.

## Вердикт

### SQL fallback continuation: foundation history восстановлена, SYNC-03.1 ожидает уточнения DROP

После прямого разрешения пользователя выполнен Management API SQL fallback, эквивалентный
официальному CLI v2.75.0 `migration repair <versions> --status applied`.
Семантика проверена по `internal/migration/repair/repair.go`, `pkg/migration/history.go`,
`pkg/migration/file.go`, `pkg/parser/token.go` и `state.go` официального тега v2.75.0.
Для явно заданных versions repair использует INSERT(version,name,statements) с
ON CONFLICT(version) DO UPDATE name/statements; migration statements сохраняются как текст,
но не исполняются. Режим repairAll и его TRUNCATE не использовались.

Hosted history до записи: `version text PRIMARY KEY`, `statements text[]`, `name text`,
0 строк, 0 пользовательских triggers. Foundation statements из reference CLI history
сверены с полным содержимым текущих local files; различия переводов строк нормализованы.

Доказательства фактического применения:

- `20260903000000`: 9 foundation tables, indexes, FORCE RLS, private helpers и policies;
  оба foundation storage buckets существуют и private.
- `20260904000000`: device/E2EE columns, constraints, RPC definitions и grants;
  pgcrypto в extensions; пропущенных device backfill значений нет.
- `20260904010000`: event/object revision/HLC schema, pilot RPCs и Realtime policy;
  invalid revision/backfill rows нет; старая 10-аргументная push RPC присутствует.

Свежий hosted catalog до repair совпал с ранее сравненным reference catalog в ожидаемых
объектах; ранее отмеченные более строгие hosted service-role grants сохранены.
Разрешённая транзакция содержала только три history UPSERT, lock/statement timeout и COMMIT.
Результат exit 0. Независимое перечитывание подтвердило version/name/statements:
`20260903000000` (68), `20260904000000` (74), `20260904010000` (23).
`npx supabase migration list --linked` exit 0: три foundation local/remote совпадают;
единственная отсутствующая remote version — `20260906010000`.
Повторный полный public/private catalog после repair идентичен до-repair, включая RLS/grants.
Пользовательские таблицы не изменялись, foundation SQL не выполнялся.

SYNC-03.1 прочитана полностью: заменяет старую 10-аргументную push RPC новой 11-аргументной
и назначает EXECUTE grants. Она содержит `DROP FUNCTION IF EXISTS` старой сигнатуры.
Последний запрос пользователя явно запрещает любой DROP, поэтому миграция НЕ применена:
требуется уточнить разрешение только этого DROP FUNCTION в составе атомарной замены RPC.
DROP TABLE/SCHEMA, TRUNCATE, reset или удаление пользовательских данных не требуются.
Physical acceptance не возобновлялась; verify/E2E/build/signing не повторялись; SYNC-05 не начат.

### CLI connectivity continuation: timeout подтверждён через session pooler

Linked ref повторно подтверждён: `oytsyvmlkngsmpevbbct`.
`npx supabase migration list --linked` прошёл до и после repair: remote versions пусты.
CLI уже использует официальный session pooler
`aws-1-eu-west-1.pooler.supabase.com:5432`, а не direct connection.
Direct hostname `db.oytsyvmlkngsmpevbbct.supabase.co` вернул `ENOTFOUND` из текущей сети;
pooler разрешается в IPv4, TCP connect к порту 5432 успешен.

`npx supabase migration repair 20260903000000 --status applied --linked`
завершился exit 1, `LegacyDbExecError: effect/sql/SqlError: Connection error`.
Уже установленная официальная Go-версия уточнила ошибку команды
`npx --yes supabase@2.75.0 migration repair 20260903000000 --status applied --linked`:
`read tcp 192.168.0.111:42390->18.202.64.2:5432: wsarecv` timeout, exit 1.

Read-only server activity подтверждает авторизованные CLI-сессии через Supavisor,
без blocking pids, с `ClientRead`: новая CLI остановилась после `SET LOCAL lock_timeout`,
Go CLI дошла до metadata INSERT. Успешный repair не подтверждён: финальный migration list
по-прежнему показывает отсутствие всех remote versions. Следовательно, проблема возникает
после TCP connect/authentication, а не доказывает полную недоступность порта или нехватку пароля.
Точный виновник между сетевым путём, pooler и клиентским протоколом пока не установлен.

По условию пользователя — STOP после воспроизведения timeout через официальный pooler.
Не требуется публиковать или повторно вводить password: CLI уже авторизуется.
Следующий безопасный шаг — проверить тот же CLI на другом сетевом пути к pooler;
если результат сохранится, требуется диагностика Supavisor/CLI, а не слепое увеличение timeout.
Management API использован только для read-only activity, не для history writes.
Другие foundation repairs, db push/dry-run и physical acceptance не запускались.
Foundation SQL не переисполнялся; пользовательские данные сохранены, SYNC-05 не начат.

### Management API continuation: точное восстановление версий не подтверждено

После отдельного разрешения Management API выполнены только read-only проверки.
Свежая history содержит 0 записей. Свежий hosted catalog полностью совпадает с ранее
прочитанным: 9 таблиц, 96 колонок, 78 constraints, 22 индекса, 9 policies, 25 функций.
Foundation-схема существует; push RPC всё ещё имеет старые 10 аргументов без
`p_origin_device_id`. SYNC-03.1 фактически не применена.

Проверен актуальный официальный OpenAPI `https://api.supabase.com/api/v1-json`.
`PUT /v1/projects/{ref}/database/migrations` документирован как запись history без
выполнения SQL, но его body поддерживает только `query`, `name`, `rollback`, без
параметра `version`. `Idempotency-Key` документирован только как ключ дедупликации,
не как номер migration. `PATCH /v1/projects/{ref}/database/migrations/{version}`
меняет только `name` и `rollback` существующей записи. Поэтому документированный
способ восстановить именно три локальные версии через эти endpoints не установлен.

Записывающие API calls не отправлялись: неподтверждённые параметры, экспериментальные
history rows и raw SQL repair не использовались. Это ограничение подтверждённого
API-контракта, а не установленная ошибка OAuth permissions (403 не получен).
Требуемый write scope по спецификации — `database:write`, fine-grained permission —
`database_migrations_write`; наличие этих прав само по себе не решает передачу версии.

STOP: нужен поддерживаемый repair с явной локальной `version` либо восстановление
работоспособности ранее неуспешного штатного CLI `migration repair`. Миграция не
применена, physical acceptance не возобновлялась, код и migration files не менялись.
Ранее зелёные verify/E2E/build/signing не повторялись. Пользовательские данные сохранены.

### Hosted continuation: авторизация успешна, migration workflow заблокирован

Supabase CLI browser login завершён; project `oytsyvmlkngsmpevbbct` подтверждён как
`LifeOS Sync`, `ACTIVE_HEALTHY`; текущий worktree связан с ним. Access token не выведен.

Начальное hosted migration history отсутствовало: `schema_migrations` не существовала.
Dry-run предложил все четыре локальные версии, включая уже развёрнутые foundation migrations.
Read-only catalog comparison с локальной reference DB подтвердил совпадение 96 колонок,
78 constraints, 22 индексов и 9 RLS policies. Определения существующих функций совпадают,
кроме ожидаемой старой push RPC. Hosted service-role grants более ограничены; они сохранены.

Штатный `migration repair --status applied` для проверенных версий
`20260903000000`, `20260904000000`, `20260904010000` не завершился успешно:
CLI 2.116.0 вернул `LegacyDbExecError: Connection error`; официальный CLI 2.75.0
уточнил `read tcp ...:5432: wsarecv` timeout. Одиночный repair также failed.
CLI создал таблицу migration history, но финальное read-only чтение подтверждает 0 записей.
Разрешённая `20260906010000` не применена; foundation SQL повторно не выполнялся.

Отдельная SSL диагностика без credentials обнаружила недоверенную CA chain; с публичным
Supabase Root 2021 CA TLS verification проходит. Это не устранило CLI repair timeout,
поэтому CA не объявляется доказанной единственной причиной сбоя migration workflow.
Management API read-only query работает. SQL-write через Management API не выполнялся,
поскольку пользователь разрешил применение только штатным migration workflow.

Galaxy A23 по-прежнему authorized в ADB. Физические сценарии остаются непроверенными;
код LifeOS и migrations в этом продолжении не менялись, зелёные suites не повторялись.
Данные не очищались; SYNC-05 не начинался.

**SYNC-04 STATUS: BLOCKED.** Полный автоматический gate зелёный, но обязательная физическая
Windows ↔ Galaxy A23 приёмка не может быть выполнена до применения уже существующей production
миграции `supabase/migrations/20260906010000_sync_03_1_outbox_rematerialization.sql`.
SYNC-05 не начат.

## Найденный и исправленный runtime-дефект

На существующем Windows-профиле structured bootstrap стабильно падал до network transport с
`TypeError: Illegal invocation`. Причина: mutation-capture возвращал `IDBTransaction` через Proxy,
но setter `transaction.oncomplete` получал Proxy как receiver. WebView2 требует настоящий native
`IDBTransaction` receiver.

Исправление минимальное: `createMutationCapturingTransaction` теперь пересылает property setters
через `Reflect.set(target, property, value, target)`. Добавлен regression test, моделирующий native
brand check. RED воспроизвёл `Illegal invocation`; GREEN — 8/8 targeted tests PASS.

На свежем Windows release runtime исправление подтверждено на прежнем профиле:

- `structured-bootstrap`: `complete`;
- type checkpoints: 22;
- quarantine: 0;
- существующие пользовательские данные и encrypted enrollment сохранены.

## Production blocker

После успешного bootstrap клиент сформировал 13 encrypted pending events и дошёл до реального
Supabase transport. Production RPC вернул `404 PGRST202`: серверная функция
`lifeos_sync_push_pilot_event` имеет старую сигнатуру без `p_origin_device_id`, а текущий клиент и
готовая миграция используют новую сигнатуру.

`lifeos_sync_pull_pilot_events` вернул 200, `lifeos_sync_ack_pilot_cursor` — 204; trust RPC также
отвечали 200. Следовательно, это не отсутствие сети, не ADB и не crypto/enrollment failure.
Первоначально локальный CLI не был авторизован. В последнем продолжении вход и link завершены;
текущий blocker — запись migration history через Postgres, описанная выше.

До устранения этого mismatch нельзя честно проверить Android → Windows, Windows → Android,
relationships, offline merge, conflict convergence, tombstone/delete, singleton-per-date
convergence и restart persistence. Синтетические QA-записи не создавались.

## Свежие проверки текущего кода

- Regression target: PASS, 8/8.
- `npm run verify`: PASS, exit 0; 360 files / 3040 tests, infra 55, alpha 1,
  typecheck/lint/build/format/git diff check PASS.
- Один свежий полный `npm run test:e2e`: PASS, exit 0; 160/160 обработаны,
  129 passed / 31 expected skipped; 797.98 s; порт 4173 освобождён.
- Прежний проблемный WALK-14 `long data and literal analytics 1920x1080`: PASS, 6.44 s.
- Windows release executable: свежая сборка текущего кода PASS (`tauri build --no-bundle --ci`).
- Windows updater signing: ранее PASS на этом SYNC-04 worktree; после данного frontend bugfix
  подписанный installer повторно не создавался, потому что signing credentials в текущем окружении
  отсутствуют и физическая приёмка использует release executable.
- Android arm64 APK: свежая сборка текущего кода PASS.
- Galaxy A23 `SM_A235F`: ADB authorized; APK обновлён через `adb install -r`, `Success`,
  `lastUpdateTime=2026-09-07 15:59:30`. Uninstall/clear не выполнялись.

## Обязательный итог

- physical Windows ↔ Galaxy A23 acceptance: **FAIL** — blocked by undeployed production RPC migration
- Android -> Windows: **FAIL** — not executable until transport accepts push
- Windows -> Android: **FAIL** — not executable until transport accepts push
- offline merge: **FAIL** — not verified physically
- conflict convergence: **FAIL** — not verified physically
- tombstone/delete: **FAIL** — not verified physically
- singleton-per-date convergence: **FAIL** — not verified physically
- restart persistence: **FAIL** — not verified physically
- full E2E: **PASS**
- main verify: **PASS**
- Windows signing: **ранее PASS**
- Android build: **PASS**
- user data preserved: **YES**
- SYNC-05 started: **NO**

Фото, файлы, Goal covers и Walk photos не синхронизировались. Второй Sync Engine не создавался.
Commit/push/publish не выполнялись. Предыдущий промежуточный отчёт сохранён в
`docs/sync/SYNC_04_REPORT_PRE_STOP_RUNTIME.md`.

## STOP

Для продолжения требуется применить к Supabase project `oytsyvmlkngsmpevbbct` существующую
миграцию `20260906010000_sync_03_1_outbox_rematerialization.sql`, затем возобновить только
физическую Windows ↔ Galaxy A23 приёмку. SYNC-05 самостоятельно не начинать.
