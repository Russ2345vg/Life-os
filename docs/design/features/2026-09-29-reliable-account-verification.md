# Надёжный аккаунт — проверка реализации

Проверка: 29–30.09.2026.

Scope: [контракт](2026-09-29-reliable-account.md), [план](../../superpowers/plans/2026-09-29-reliable-account.md),
[исходный аудит](../../sync/2026-09-29-account-login-audit.md). Active worktree: `D:/LifeOS-App`.
Главный агент — единственный автор; независимые исследования и review были read-only.
Предсуществующие Memory/Today/action/voice изменения сохранены и не входят в verdict этого патча.

## Что исправлено

- Вход принимает существующий пароль без локального registration minimum. Создание и смена
  пароля сохраняют диапазон 12–128. Ошибки email confirmation, credentials, rate limit,
  native storage, сети и deadline получают безопасные сообщения.
- Установленный Supabase SDK может очистить `auth-token-user` через отдельный native slot;
  прежний session slot и allowlist произвольных ключей сохранены.
- Auth/REST/Storage имеют deadline 20/30/60 секунд до завершения чтения body и ограничение
  2/16/96 MiB. Запоздалый ответ входа после abort не сохраняет сессию.
- Новая сессия существующего владельца требует восстановления доверия устройства. Gate ждёт
  текущие transfers перед сменой credentials и блокирует structured sync, hints, photos и maintenance.
  Исходные данные, ключи и очередь сохраняются; candidate повторно используется при retry/restart.
- Password reset завершает verify/update в отдельном SDK client без main auth storage.
  Проверяются email/user id; успешная смена возвращает ко входу. Timeout не выдаётся за
  доказательство того, что пароль на сервере остался прежним.
- UI показывает недоступность аккаунта в browser preview, повторный вход, device recovery,
  ошибки/retry и завершённый reset. Busy защищает от повторной отправки, поля секретов очищаются.
- Account trust operations требуют подтверждённого email и неанонимной сессии.

## Свежие проверки

Unit/integration: 240 файлов, 1840 PASS, 1 существующий skip. Infra: 55 PASS, alpha: 1 PASS.
Typecheck, lint, build, format и Git hygiene прошли. Read-only review не выявил блокеров;
главный агент подтверждает готовность account патча к handoff с ограничениями ручной QA ниже.

| Проверка                                                                        | Результат                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Targeted account/recovery/coordinator/persistence/recorder/outbox               | GREEN; последние два service-файла — 45 тестов               |
| Auth/storage/timeout/reset, включая установленный SDK                           | GREEN; late response и изоляция main storage проверены       |
| AccountSyncPage render                                                          | 17 PASS                                                      |
| `npm run test:fast` после финального изменения guards                           | 91 файл, 979 PASS                                            |
| Scoped account E2E desktop/mobile                                               | 10/10 PASS; после UI refinement 4/4 затронутых сценария PASS |
| Bounded `cargo test --manifest-path src-tauri/Cargo.toml --lib auth_storage_`   | 2 PASS                                                       |
| `rustfmt --edition 2021 --config skip_children=true --check` двух native файлов | PASS                                                         |
| Стадии `npm run verify`                                                         | PASS по стадиям; продолжение после диагностики описано ниже  |

Полный E2E не запускался: изменены состояния аккаунта и авторизация транспорта; общая схема
предметного хранения, routing и startup не менялись. Account flow покрыт scoped desktop/mobile.
Регрессии проверяют owner isolation, snapshot/candidate retry, сохранение recording context и
outbox во время recovery, отсутствие удаления key ring, stale encrypted event replay,
pause/drain и отсутствие sync до server activation.

## Browser и Правило №38

Актуальный `#/v2/account` активного worktree открыт без credentials. Browser preview показывает
причину недоступности native auth, console warn/error пусты. Desktop и managed mobile screenshots
просмотрены. Проверены 1440×900, 390×844 и 360×800: без overflow, controls ≥44 px.
Native CUA resize дал корректные DOM widths, но масштабированный screenshot не использован
как самостоятельное доказательство mobile fidelity; viewport восстановлен.

Форма остаётся главным визуальным центром; вторичные действия текстовые. Иерархия, статусы,
surface и jade accent взяты из текущего premium UI. Семантика не зависит только от цвета:
ошибки и успех объясняются текстом. Видимый keyboard focus, loading/busy, local/unavailable,
error/retry и success проверены. Новых motion/glow/palette нет; reduced motion сохраняется
существующим CSS. Отдельное визуальное APPROVED для этой стандартной формы не присваивалось.

## Ограничения и ручная QA

Конкретная причина отказа входа пользователя не установлена без его ошибки/реального устройства.
Исправлены воспроизведённые независимые дефекты; настоящий Windows/Android + hosted account
round-trip не выполнялся. После установки новой сборки требуется проверить вход, повторный вход
с recovery key, доставку письма/reset и синхронизацию между двумя устройствами.

Новая metadata optional; старые записи читаются без изменения store/version. Старый клиент
не умеет новые account states: downgrade после их записи не заявляется как совместимый.
Reset password не восстанавливает утраченный E2EE recovery key.

Native cold build первоначально достиг bounded deadline; проверено отсутствие owned процессов.
Полная crate artifact сборка затем достигла disk-space limit. Удалены только два созданных
задачей артефакта в проверенном workspace target; узкий `--lib` прогон прошёл. Эти результаты
не являются Windows/Android release build или проверкой hardware keystore.

Первый `verify` прошёл typecheck и остановился на lint временных диагностических файлов.
Исправлены только unused variable/import в task scratch; gate продолжен с lint без повторного
typecheck. Логи: `.superpowers/sdd/2026-09-29-account-sync/verify.log` и `verify-resume.log`.
Первый infra прогон выявил существующую timing race: отмена через фиксированные 500 мс может
прийти ещё в `vite-startup`, хотя тест ожидает `playwright`. Этот файл не менялся. Изолированный
сценарий прошёл; один повтор только infra группы дал 55 PASS. Причина нестабильности теста
документирована, но сам инфраструктурный тест не исправлялся в этом account патче.
Fast Refresh и предупреждение build о размере bundle не скрыты. Commit, push, публикация, server/template
changes и пользовательские credentials не выполнялись.

Owned QA server остановлен; освобождение `127.0.0.1:5180` подтверждено. Managed E2E teardown
подтвердил освобождение порта 4173; после первоначальной Windows cleanup ошибки runner сообщил
RECOVERED. Чужие процессы не завершались. Финальный scoped formatter и diff/status проверены.
