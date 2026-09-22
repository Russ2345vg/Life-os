# LifeOS Account Sync — release evidence

- Дата проверки: 2026-09-22
- Версия клиента: 1.0.4
- Пакет приложения: `com.lifeos.desktop`

## Объём выпуска

Версия добавляет необязательный LifeOS-аккаунт с email/password, привязку каждого устройства к
отдельной auth-сессии, подтверждение recovery key, сквозное шифрование предметных данных,
возобновляемое подключение и безопасный выход. Local-only режим остаётся доступен без аккаунта и
без Supabase.

Production-флаг `VITE_LIFEOS_ACCOUNT_SYNC_ENABLED` по умолчанию выключен. Этот документ не
разрешает публикацию клиента, применение миграции к hosted Supabase или изменение hosted Auth.

## Проверки текущего дерева

| Проверка                   | Результат   | Доказательство                                                                     |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Account/application target | PASS        | 8 тестов; локальный Supabase round-trip корректно SKIP без локального backend      |
| TypeScript                 | PASS        | `npm run typecheck`, exit 0                                                        |
| Account desktop/mobile E2E | PASS        | 4 сценария: 1440×900, 390×844 и 360×800; keyboard, overflow, live regions, console |
| Реальный route smoke       | PASS        | `#/v2/account` открывается и переживает reload в local-only состоянии              |
| Native Rust sync tests     | PASS        | `cargo test ... sync_`: 12 passed                                                  |
| pgTAP/RLS                  | UNCONFIRMED | `ECONNREFUSED 127.0.0.1:54322`; local Supabase/Docker не запущен                   |
| Полный R9/R10 gate         | PASS        | 1350 unit/integration, 55 infra, 1 alpha, build/format/diff и 68 E2E               |

Детерминированный Playwright fixture вызывает настоящий `AccountSync` application-контракт и не
изменяет DOM напрямую. Local Supabase integration test принимает только loopback URL, создаёт
одноразового анонимного пользователя, сохраняет его идентичность при переводе в подтверждённый
аккаунт, связывает две разные `session_id`, проверяет recovery, encrypted records/attachment,
offline convergence и немедленную блокировку отозванной сессии. Тест удаляет пользователя и blob
в teardown.

## Нативные артефакты

### Windows x64

- NSIS: `src-tauri/target/release/bundle/nsis/LifeOS_1.0.4_x64-setup.exe`
- Размер: 7 592 053 bytes
- SHA-256: `F5DA5A67D988303ACDDE10DB36FF588B0C467833A276581B72EEC8CFFAC3B3A7`
- Authenticode: `NotSigned`. Updater artifact намеренно отключён для локальной сборки, потому что
  приватный updater key отсутствует; публикация этой сборки запрещена.
- Установка: PASS, silent update exit 0 в `%LOCALAPPDATA%\LifeOS\LifeOS.exe`; file version 1.0.4,
  процесс успешно запущен.
- Installer не очищал каталог `%LOCALAPPDATA%\com.lifeos.desktop`; профиль
  WebView/IndexedDB остался на месте. Содержимое предметных данных требует визуальной проверки
  пользователем в установленном приложении.

### Android universal

- APK: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- Размер: 64 527 469 bytes
- SHA-256: `56E37607EC1BC28CC9C55D4AAC39F2A7A68F4035FB8E11ABB2E1C7BD835A64B2`
- Package/version: `com.lifeos.desktop`, versionName 1.0.4, versionCode 1000004, minSdk 24,
  targetSdk 36.
- ABI: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`.
- APK Signature Scheme v2: PASS. Signer:
  `CN=LifeOS, OU=LifeOS, O=LifeOS, L=Chita, ST=Zabaykalsky Krai, C=RU`; certificate SHA-256:
  `F3669CD0CA91CD17670E01A284D07493330BCAF32D4993CFBB88CA5099D92C69`.
- Установка: PASS на Samsung SM-A235F. После повторного подключения `adb install -r` вернул
  `Performing Streamed Install Success`; package до и после обновления — versionName 1.0.4,
  versionCode 1000004. Удаление приложения и очистка данных не выполнялись. Запуск
  `com.lifeos.desktop/.MainActivity` успешен, окно приложения подтверждено как текущее в фокусе.

Сборка сама по себе не является публикацией.

## Порядок rollout

1. Применить additive backend migration до установки клиента с включённым account sync.
2. В hosted Supabase настроить email confirmation, SMTP и шаблоны писем; проверить их на тестовом
   проекте.
3. Выполнить pgTAP/RLS и физический двухустройственный сценарий на тестовом проекте.
4. Зафиксировать результат test-project gate в этом документе.
5. Только после этого собрать production-клиент с
   `VITE_LIFEOS_ACCOUNT_SYNC_ENABLED=true` и отдельно согласовать публикацию.

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

Пока локальный/тестовый Supabase не поднят и production-флаг выключен, физическая установка может
подтвердить обновление, сохранность прежних локальных данных и запуск приложения, но не полный
двухустройственный account flow.

Текущие Windows- и Android-установки подтверждают upgrade и запуск без команды очистки профиля.
Полный account flow остаётся ручным gate тестового backend.

## Стоп-граница

Production migration, hosted Auth configuration, публикация installers и включение флага требуют
отдельного явного разрешения пользователя после просмотра этих доказательств.
