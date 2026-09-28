# Исправление Android-обновлений LifeOS 1.0.22

На подключённом Samsung Galaxy A23 было установлено LifeOS 1.0.20
(`versionCode=1000020`). Карточка нового выпуска не появлялась, потому что
`TauriApplicationUpdateGateway` прекращал проверку на любой платформе кроме Windows.
Нативные команды Android уже существовали, но интерфейс их не вызывал.

В Android-ветке gateway теперь вызывается `android_check_update` с существующим
GitHub-каналом `android-latest.json`. Доступный выпуск проходит через общий
`ApplicationUpdateService` и существующую карточку обновления. Загрузка APK и открытие
системного установщика происходят только после пользовательского действия.

Открытие установщика возвращает `installer-opened`, а не успешное завершение установки.
Сервис сохраняет предложение и возможность повторить установку после отмены.
Windows-контракт завершения установки сохранён. Зависимости и пользовательское
хранилище не менялись; новый UI и дополнительные настройки не добавлялись.

## Проверки

- До исправления Android-сценарии gateway падали; до изменения результата установки
  регрессионный тест сервиса получал `installed` вместо ожидаемого `available`.
- Targeted gateway/service/notice: 19/19 PASS.
- Scoped `current.updates.spec.ts`: 8/8 PASS, desktop и mobile, 24.92 s.
- `npm run verify:full`: exit 0. Typecheck, lint, build, format и Git hygiene — PASS;
  unit/integration — 1633 passed, 1 штатный skip; infra — 55 passed; alpha — 1 passed.
- Полный E2E: 194 passed, 2 platform skips, 925.20 s, exit 0.
  Полный прогон выбран по релизному критерию R12 перед публикацией установщиков.
  Owned-порт 4173 освобождён, E2E не выполнялся одновременно с native-сборкой.
- Нативный контракт отсутствия обновления проверен по используемому Tauri SDK:
  Android `Invoke.resolve()` возвращает JSON `null`, Rust принимает его как `None`.
- Независимый read-only review текущих 11 файлов: блокирующих замечаний нет.
- Runtime-код после успешного gate не менялся.

## Установщики и публикация

Релизный коммит: `3300f919132a7509c67acc6789fa494cedd61e81`.
Ветка `codex/motion-release-1.0.19` и новый аннотированный тег `v1.0.22` отправлены
атомарно в `Russ2345vg/Life-os`; удалённая ветка и peeled tag проверены.

`npm run release:publish -- 1.0.22 --owner Russ2345vg --prepare-only`: PASS,
637.63 s. Подписанные Windows x64 и universal Android собраны из релизного runtime-кода.

| Пакет                               | Размер, bytes | SHA-256                                                            |
| ----------------------------------- | ------------: | ------------------------------------------------------------------ |
| `LifeOS_1.0.22_x64-setup.exe`       |       7631594 | `5b5f39d890869d3f141ad61b1b0b1b89c1bbb06d4276180cfbd24322815e6e78` |
| `LifeOS_1.0.22_android_release.apk` |      65605773 | `3ed166abc39758122efaafa494ba6f3d13509340b4c186b5acae1ba4062e0b31` |

Windows FileVersion/ProductVersion — `1.0.22`; встроенная updater-подпись совпадает
с `latest.json`. Android: `com.lifeos.desktop`, versionName `1.0.22`, versionCode
`1000022`, min SDK 24. APK содержит `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`.
`apksigner verify --verbose --print-certs`: PASS, прежний RSA 4096 ключ, v2 signature.
Certificate SHA-256:
`f3669cd0ca91cd17670e01a284d07493330bcaf32d4993cfbb88ca5099d92c69`.

Создан новый GitHub release `398242116`. До публикации размеры и SHA-256 всех шести
assets совпали с локальными файлами. Выпуск опубликован `2026-09-28T12:47:13Z`,
не draft и не prerelease, отмечен latest. Старые теги и выпуски не перезаписаны.
Публичный latest API возвращает `v1.0.22`. Оба манифеста и полные EXE/APK скачаны:
HTTP 200, размеры и SHA-256 совпадают; digest всех шести assets также проверен.

- [Выпуск 1.0.22](https://github.com/Russ2345vg/LifeOS-Releases/releases/tag/v1.0.22).
- [Android APK](https://github.com/Russ2345vg/LifeOS-Releases/releases/download/v1.0.22/LifeOS_1.0.22_android_release.apk).
- [Windows x64](https://github.com/Russ2345vg/LifeOS-Releases/releases/download/v1.0.22/LifeOS_1.0.22_x64-setup.exe).
- [Исходники v1.0.22](https://github.com/Russ2345vg/Life-os/tree/v1.0.22).

## Подключённый телефон

Выполнен `adb install -r` подписанного APK: `Success`, exit 0, 6.95 s.
Удаление приложения, очистка данных, downgrade и изменения записей не выполнялись.
После установки Android сообщил `versionName=1.0.22`, `versionCode=1000022`,
`lastUpdateTime=2026-09-28 21:47:52`.

На других телефонах с 1.0.20/1.0.21 исправление нужно установить один раз вручную
поверх LifeOS. После этого проверка нового выпуска выполняется при запуске.
Если установлен актуальный выпуск, карточка обновления отсутствует по контракту.

Появление будущего обновления на физическом телефоне ещё требует проверки после
выхода следующей версии. Browser-сценарии и mocked native IPC не заменяют эту QA.
Подмена опубликованной версии или фиктивное предложение обновления не выполнялись.
