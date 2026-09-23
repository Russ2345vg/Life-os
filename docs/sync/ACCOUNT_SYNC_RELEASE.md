# LifeOS Account Sync — release evidence

- Дата проверки: 2026-09-23
- Версия клиента: 1.0.12
- Пакет приложения: `com.lifeos.desktop`

## Объём выпуска

Версия добавляет необязательный LifeOS-аккаунт с email/password, привязку каждого устройства к
отдельной auth-сессии, подтверждение recovery key, сквозное шифрование предметных данных,
возобновляемое подключение и безопасный выход. Local-only режим остаётся доступен без аккаунта и
без Supabase.

Account-флаг `VITE_LIFEOS_ACCOUNT_SYNC_ENABLED=true` включён в собранных клиентах 1.0.12.
Hosted-миграции применены к проекту `LifeOS Sync`; публикация неподписанного Windows installer
по-прежнему не разрешена.

Hotfix 1.0.11 восстанавливает регистрацию после подтверждения email вне приложения: сохранённая
сессия сверяется с pending-установкой, экран сразу переходит к созданию пароля, а незавершённая
настройка больше не показывается как потеря соединения.

Версия 1.0.12 добавляет повторный показ, копирование и скрытие recovery key на готовом аккаунте.
Ключ извлекается только по явному действию пользователя из защищённого хранилища текущего
устройства и не сохраняется в предметной базе или журнале.

## Hosted rollout

- `20260922010000_sync_07_accounts.sql` и
  `20260922020000_sync_07_1_pending_device_policy.sql` применены через Supabase CLI.
- Повторный `supabase migration list --linked` подтвердил совпадение всех семи local/remote
  миграций.
- Публичный `GET /auth/v1/settings` подтвердил: signup разрешён, email provider включён,
  подтверждение email обязательно (`mailer_autoconfirm=false`), anonymous bootstrap включён.
- OpenAPI-каталог требует secret key, поэтому проверка наличия RPC опирается на применённые
  миграции и локальный pgTAP. Потенциально изменяющие hosted RPC-вызовы без пользовательской
  сессии не выполнялись.
- Наличие custom SMTP и доставка реального письма не раскрываются публичным settings endpoint;
  это проверяется первой пользовательской регистрацией.

## Проверки текущего дерева

| Проверка                   | Результат | Доказательство                                                                   |
| -------------------------- | --------- | -------------------------------------------------------------------------------- |
| Account/application target | PASS      | 21 тест сервиса и экрана, включая повторный показ recovery key                   |
| Local Supabase round-trip  | PASS      | 1 реальный auth/RPC/Storage-сценарий с двумя `session_id`                        |
| TypeScript                 | PASS      | `npm run typecheck`, exit 0                                                      |
| Account desktop/mobile E2E | PASS      | 6 сценариев: 1440×900, 390×844 и 360×800; recovery, keyboard, overflow и console |
| Реальный route smoke       | PASS      | `#/v2/account` открывается и переживает reload в local-only состоянии            |
| Native Rust sync tests     | PASS      | `cargo test`: 15 passed                                                          |
| pgTAP/RLS                  | PASS      | 6 файлов, 155 тестов после чистого `supabase db reset`                           |
| Полный R9/R10 gate         | PASS      | 1358 passed + 1 skipped, 55 infra, 1 alpha, build/format/diff и 70 E2E           |

Детерминированный Playwright fixture вызывает настоящий `AccountSync` application-контракт и не
изменяет DOM напрямую. Local Supabase integration test принимает только loopback URL, создаёт
одноразового анонимного пользователя, сохраняет его идентичность при переводе в подтверждённый
аккаунт, связывает две разные `session_id`, проверяет recovery, encrypted records/attachment,
offline convergence и немедленную блокировку отозванной сессии. Тест удаляет пользователя и blob
в teardown.

Перед выпуском 1.0.10 нормализация email дополнена удалением недопустимых пробельных и невидимых
formatting-символов. Account-формы читают фактические значения HTML-полей при submit, чтобы
WebView-autofill без React change event не отправлял устаревшее пустое значение. Реальный hosted
flow также подтвердил два контракта Supabase: анонимная сессия содержит пустой `email` и pending
адрес в `new_email`, а PKCE подтверждение использует отдельные flow/index/legacy storage keys.
LifeOS теперь разбирает pending email и хранит PKCE-значения в отдельных строго разрешённых
native secure-store slots, не перезаписывая основной auth session token.

Установленная Windows 1.0.11 открыла сохранённый pending enrollment, распознала уже подтверждённую
сессию и автоматически показала «Создайте пароль». Поле «Код из письма» и ошибочный статус
«Нет соединения» отсутствуют. Создание пользовательского пароля остаётся ручным шагом владельца.

Установленная Windows 1.0.12 сохранила профиль готового аккаунта. На реальном account-экране
подтверждены показ, копирование и повторное скрытие recovery key; значение ключа не выводилось в
журнал проверки. После QA ключ оставлен скрытым, а приложение открыто на нужном блоке безопасности.

## Нативные артефакты

### Windows x64

- NSIS: `src-tauri/target/release/bundle/nsis/LifeOS_1.0.12_x64-setup.exe`
- Размер: 7 589 172 bytes
- SHA-256: `B9857D28A6C50F7B0F725BBD7A1D78D7FF7946EE315770EA975540D3CB669422`
- Authenticode: `NotSigned`. Updater artifact намеренно отключён для локальной сборки, потому что
  приватный updater key отсутствует; публикация этой сборки запрещена.
- Установка: PASS, silent update exit 0 в `%LOCALAPPDATA%\LifeOS\LifeOS.exe`; file version 1.0.12,
  процесс успешно запущен.
- Installer не очищал каталог `%LOCALAPPDATA%\com.lifeos.desktop`; профиль
  WebView/IndexedDB остался на месте. Содержимое предметных данных требует визуальной проверки
  пользователем в установленном приложении.

### Android universal

- APK: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- Размер: 64 530 341 bytes
- SHA-256: `CF522EECF2BA865CF650946A9D0349558C37D0CB39CFDFDCB66D928C674CA529`
- Package/version: `com.lifeos.desktop`, versionName 1.0.12, versionCode 1000012, minSdk 24,
  targetSdk 36.
- ABI: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`.
- APK Signature Scheme v2: PASS. Signer:
  `CN=LifeOS, OU=LifeOS, O=LifeOS, L=Chita, ST=Zabaykalsky Krai, C=RU`; certificate SHA-256:
  `F3669CD0CA91CD17670E01A284D07493330BCAF32D4993CFBB88CA5099D92C69`.
- Установка 1.0.12: PENDING. Перед сборкой `adb devices -l` вернул пустой список. Последняя
  подтверждённая установленная Android-версия — 1.0.8;
  удаление приложения и очистка данных не выполнялись.

Сборка сама по себе не является публикацией.

## Состояние rollout

1. Additive backend migrations: PASS.
2. Hosted email confirmation, email provider и anonymous bootstrap: PASS по публичным settings.
3. Локальные pgTAP/RLS и двухсессионный encrypted round-trip: PASS.
4. Account-enabled Windows 1.0.12 build, обновление без очистки профиля и повторный показ
   recovery key на готовом аккаунте: PASS.
5. Android 1.0.12 build/signature: PASS; установка ожидает повторного подключения телефона к ADB.
6. Hosted registration request: PASS. Доставка OTP не подтверждена; создание пароля и физический
   двухустройственный recovery-flow требуют ручной приёмки пользователем.

Legacy anonymous access остаётся включённым на измеряемое окно миграции, чтобы уже установленные
клиенты не потеряли синхронизацию до принятия аккаунта.

## Rollback

При ошибках enrollment клиентский rollback — выключить создание/подключение аккаунта через
`VITE_LIFEOS_ACCOUNT_SYNC_ENABLED`, сохранив local-only работу и существующие данные. После появления
account-owned spaces backend migration нельзя откатывать destructively: удаление account/session
полей нарушит доступ и восстановление. Исправление backend выпускается следующей additive
миграцией.

## Обязательная ручная приёмка

На Windows и Android с тестовым backend проверить:

1. существующие локальные направления, цели, задачи и действия сохраняются после обновления;
2. регистрация принимает текущий local space без создания второго пространства;
3. второе устройство до recovery не читает записи и attachment, после recovery получает их;
4. офлайн-правка второго устройства сходится на первом;
5. безопасный выход удаляет читаемые локальные данные только текущего устройства;
6. первое устройство остаётся активным после выхода или отзыва второго.

Локальный Supabase подтвердил RLS и двухсессионный зашифрованный round-trip. Account-флаг в
установленных клиентах включён. Физическая установка подтверждает обновление, сохранение профиля
и запуск приложения; hosted двухустройственный flow требует пользовательского email, OTP и
сохранения recovery key.

Текущая Windows-установка подтверждает upgrade и запуск без команды очистки профиля. Android
1.0.12 подготовлен, но не установлен из-за отсутствия устройства в ADB. Полный account flow
остаётся ручным gate тестового backend.

## Стоп-граница

Production migrations и account-enabled локальные установки завершены по явному разрешению
пользователя. Push и публичная публикация installer не выполнялись. Windows installer остаётся
без Authenticode; до публичного распространения также нужно подтвердить реальную доставку email.
