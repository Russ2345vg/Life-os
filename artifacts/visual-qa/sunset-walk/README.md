# Прогулка перед закатом — результаты реализации

Проверено 12.10.2026. База: LifeOS 1.0.46, commit
`77e35d354ec00d0b91d3b0e9031bc7aa775b87bd`.
Изменения подготовлены локально, без публикации автообновления.

## Поведение

- Борзя, Забайкальский край — встроенный город по умолчанию; другой город выбирается с регионом и страной.
- Расчётный закат округляется до минуты; прогулка и уведомление начинаются ровно за 15 минут до него.
- Связанные действия, распорядок, сегодня, календарь и автопилот на сегодня/завтра используют одну проекцию. Несколько представлений занимают один слот с максимальной сохранённой длительностью; конфликт с встречей остаётся видимым.
- Импортированные действия без walkPlan привязываются явно: одно действие или серия. История, заметки и фактически начатые/завершённые действия сохраняются.
- Город настраивается отдельно на каждом устройстве. Выбранный город и расчёт работают offline; сеть нужна для поиска нового города. Формат зашифрованной синхронизации не изменён.
- Нативный календарь содержит 400 дат. Android ставит следующий точный alarm, Windows пополняет очередь из 14 ближайших дат системной задачей. Открытие приложения продлевает календарь.

## Проверки

| Проверка                                                    | Фактический результат                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Полный npm run verify                                       | PASS, exit 0                                                                                                                              |
| Typecheck / lint / production build / format / diff hygiene | PASS; lint: 0 ошибок, 17 Fast Refresh warnings                                                                                            |
| Полный TS unit/integration                                  | 357 файлов PASS, 2503 теста PASS; 1 предсуществующий SKIP                                                                                 |
| Infra / alpha                                               | 68 / 1 PASS                                                                                                                               |
| Scoped E2E desktop/mobile                                   | Все 10 выбранных scenario/project executions PASS: 8 в основном прогоне, 2 после исправления заполнения обязательных полей timezone-теста |
| Android Kotlin                                              | 27 тестов, 6 suites PASS                                                                                                                  |
| Rust                                                        | 23 PASS; opt-in Windows first-use test дополнительно запущен и PASS (обычный cargo test оставляет его ignored)                            |
| Release scripts                                             | 24 PASS                                                                                                                                   |
| Production account/sync config                              | PASS, accounts enabled                                                                                                                    |
| Windows Tauri release build и NSIS bundle                   | PASS после последнего native исправления                                                                                                  |
| Android ARM64/x86_64 release libraries и APK                | PASS; отдельный QA APK также собран и запущен                                                                                             |
| Итоговый независимый read-only review                       | Выполнен; подтверждённые замечания исправлены, затронутые проверки повторены                                                              |

Логи находятся в локальном игнорируемом каталоге
`.superpowers/sdd/2026-10-11-sunset-walk/`: `verify-final.log`,
`e2e-review.log` + `e2e-timezone.log`, `android-green.log`,
`native-final-green.log`, `windows-first-use.log`,
`windows-native-final.log`, `windows-bundle-final.log`,
`release-tests-final.log`, `production-config-final.log`.

Последняя правка после полного verify касается только Windows Rust-регистрации
уведомлений; для неё свежие Rust regression/tests, production build, NSIS bundle
и реальная системная доставка прошли. TS/application/UI после verify не менялись.
Документация проверена отдельно. Полный E2E не запускался: scope по AGENTS.md.

## Реальная доставка Android

Авторизованный эмулятор `emulator-5554`, Android 16/API 36, x86_64.
Отдельный пакет `com.lifeos.desktop.sunsetqa` («LifeOS Walk QA»), без данных основной LifeOS.

1. Реальный native bridge сначала сообщил permission-required для EXACT_ALARM и NOTIFICATIONS. Разрешения выданы только QA-пакету.
2. QA-календарь из 400 дат поставлен через настоящий native reconcile: revision 200, первое событие `1791736800000`.
3. Окно закрыто; background process завершён через am kill без force-stop. AlarmManager сохранил RTC_WAKEUP exact trigger с window=0.
4. После срабатывания NotificationManager содержит ровно одно уведомление id 47120/channel lifeos-walk: «Пора на прогулку», «До заката 15 минут. Хорошей прогулки!». Durable ledger содержит 2026-10-12, следующая дата — 2026-10-13.
5. Повторный запуск/status и тот же reconcile сохранили следующий trigger `1791823200000`; revision 199 отклонён. Disable revision 201 вернул disabled/nextTriggerAt=null, будущий alarm отсутствует.
6. QA-приложение удалено с согласия пользователя, отладочное соединение закрыто.

Доказательства: `android-os-qa.log`, `android-notification-after-close.log`.
`android-qa-app.png` показывает загруженную QA-сборку; это **не** снимок уведомления.
Тестовый момент проверяет доставку, не подменяет production-расчёт заката.

## Реальная доставка Windows

Использован ранее отсутствовавший отдельный native calendar прогулок.
Проверка заранее отказалась бы перезаписывать существующий календарь/shortcut.
Установленная LifeOS и другие данные не изменялись; после проверки QA-календарь удалён.

1. Task Scheduler зарегистрировал 14 dated one-shot tasks + daily/logon maintenance: InteractiveToken, LeastPrivilege, только текущий пользователь и фиксированные аргументы.
2. При отсутствии запущенного LifeOS task в момент `1791737280000` запустил headless dispatcher и завершился.
3. WinRT history содержит ровно один toast tag sunset-walk с нужным текстом; durable ledger содержит одну дату.
4. Повторный dispatcher не создал дубль. Реальный запуск maintenance пополнил 14 будущих дат.
5. Remove сначала сохранил disabled, затем удалил собственные tasks/identity/history. Следующий maintain не восстановил очередь. QA fixture удалён, пользовательские данные сохранены.

Доказательство: `windows-delivery-qa.log`, все утверждения PASS.

Нативная проверка обнаружила первопричину first-use HRESULT 0x80070490:
CreateToastNotifierWithId работает, но Setting до первого toast не имеет записи
в notification platform. Исправление использует suppressed toast со сроком 15 секунд,
немедленно удаляет его и повторно читает настоящий Setting; permission не предполагается
и blocked/error не превращаются в scheduled. Свежий opt-in regression использует
уникальный QA AUMID и подтверждает отсутствие записи в истории после регистрации.
Подход соответствует
[PreRegisterIdentityLessApp Microsoft Toolkit](https://github.com/CommunityToolkit/WindowsCommunityToolkit/blob/main/Microsoft.Toolkit.Uwp.Notifications/Toasts/Compat/ToastNotificationManagerCompat.cs).

## Desktop/mobile comparison — Правило №38

Reference: утверждённое направление «Единая рабочая поверхность» и актуальные baseline этой страницы.
Эффективный каскад: tokens → planner-v2 → planner-master → planner-premium;
graphite/jade shared controls сохранены.

- Desktop 1440×900: baseline/after `before-walk-desktop-chrome.png` / `after-walk-desktop-chrome.png`, аналогично autopilot.
- Mobile 390×844: baseline/after `before-walk-mobile-chrome.png` / `after-walk-mobile-chrome.png`, аналогично autopilot.
- Изображения визуально сравнены: существующая композиция и controls сохранены, новый panel показывает город, прогулку/закат, покрытие и честный native/browser status. Desktop — две колонки, mobile — одна; основной control и CTA читаемы.
- Horizontal overflow: отсутствует; page/console errors: отсутствуют. Search доступен с клавиатуры, focus виден; явный выбор одноимённых городов проверен.
- Loading, empty, error/retry, offline saved city, изменение timezone внутри SPA и обновление общего времени проверены scoped E2E.
- Известных блокирующих расхождений с reference нет. Baselines других разделов не обновлялись.

## Границы и оставшаяся ручная QA

- Физический Samsung/ARM64: установка и доставка NOT RUN — пользователь разрешил только отдельную QA-сборку на эмуляторе.
- Полный reboot/locked boot Android и настоящий Windows logoff/logon NOT RUN: общий эмулятор/текущую пользовательскую сессию не перезапускали. Boot receiver wiring и persisted restore реализованы; native recovery после повторного запуска Android и реальный Windows maintenance проверены. Перед широким выпуском желательна эта ручная проверка на отдельном разрешённом устройстве/сессии.
- Force-stop Android, выключенное устройство, запрещённые OS notifications и DND не обходятся. Windows reminders требуют входа пользователя в работающую ОС.
- Release APK ограничен ARM64/x86_64 и используется для проверки. Версия осталась 1.0.46. Windows installer собран без updater signature. Это не опубликованные release assets/feed.
- Push, новая версия, updater-подпись, основная установка и публикация Windows/Android не выполнялись.
