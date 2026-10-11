# Сон и подъём: пункты 6 и 8

Завершение: 11.10.2026. Пользователь одобрил короткий дизайн пункта 6 и дизайн/план пункта 8. Один исполнитель и один независимый read-only reviewer. Ветка `codex/batched-updates-20261010`, исходный HEAD `ecd77b0af6639ce6ea79f0e6a60549aa47cfb180`. Накопленные изменения пунктов 1–3 сохранены; их отдельный отчёт — [sleep-quick-entry](2026-10-10-sleep-quick-entry.md).

## Сделано

- Пошаговая подготовка показывает один невыполненный пункт, прогресс и следующий шаг. «Готово — следующий» переходит дальше только после сохранения. Ошибка оставляет текущий пункт для повтора. Последний пункт завершает подготовку; прежние варианты завершения с пропусками и возврата к списку сохранены.
- Таймер шага: 1–120 целых минут, исходно 3; пауза, продолжение и сброс. Остаток рассчитывается по времени окончания. Истечение не отмечает пункт выполненным; выход из режима сбрасывает только таймер, сохранённые пункты остаются.
- Последний реальный ответ Android сохраняется вместе с расписанием и передаётся через существующий `sleep_schedule` sync. Android и Windows показывают результат, время проверки, дату следующего сигнала и нужное действие. Windows не создаёт Android-подтверждение и не стирает полученное.
- Изменение расписания, разового подъёма, звука, подавления напоминаний или следующего сигнала делает старое подтверждение неактуальным. Поздний ответ не подтверждает изменённое расписание. ERROR и отсутствие разрешений не показываются как success.
- Уже открытый экран обновляется после incoming sync без перезагрузки. Несохранённые времена, дата и исходный часовой пояс сохраняются; ручное переключение «Утро / Вечер» действует сразу.

## Контракты и файлы

Сохранены record schema v1, версия IndexedDB, native API, sync registry/transport и зависимости. Необязательный повреждённый report игнорируется при сохранных основных данных. Произвольный native error text и дополнительные сведения об устройстве не передаются. `SleepObservationInput.timeZone?` сохраняет исходный пояс новой ночи, если настройки изменились во время ввода.

- Guide: `sleep/SleepPreparationGuide.tsx`, `sleepPreparationGuideModel.ts`, `sleep-preparation-guide.css` и их тесты.
- Alarm contract/application: `domain/sleep/AndroidAlarmReport.ts`, `SleepSchedule.ts`, `application/sleep/WakeAlarmConfirmation.ts`, `SleepScheduleService.ts` и тесты.
- Storage/sync: `SleepScheduleRecord.ts`, `SleepScheduleRecordMapper.ts`, `AndroidAlarmReportMapper.test.ts`, `SleepAlarmReportSync.test.ts`.
- Presentation: `SleepPreparationPage.tsx` / тест, `sleep/androidAlarmReportModel.ts` / тест, `wakeManagementModel.ts`, `wake-management.css`.
- Draft timezone: `SleepObservationService.ts` / тест. Browser regression: существующие sleep E2E, `tests/fixtures/sleep-alarm-sync.html` / `.tsx` с production `applyPulled`.
- Документы: одобренные дизайны пунктов 6/8, план пункта 8 и этот отчёт. Ранее изменённые файлы пунктов 1–3 сохранены.

## Итоговые проверки

Все результаты ниже получены после последней правки product source. Каталог evidence относительно репозитория: `../artifacts/sleep-guide-qa/`.

| Этап                                                | Результат                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Новые guide/alarm/storage/sync/read-model регрессии | RED → GREEN; включены в финальный общий набор                                                    |
| Детерминированный порядок sync payload              | RED → GREEN, 1/1, exit 0; `sync-order-red.log`, `sync-order-green.log`                           |
| Ручной вид и incoming sync с несохранённым вводом   | 4/4 desktop/mobile, exit 0; `manual-mode-green.log`                                              |
| `npm run test:fast`                                 | PASS, 125 files / 1202 tests, exit 0; `test-fast-final.log`                                      |
| **`npm run verify`**                                | **PASS, exit 0**; `verify-final-green.log`                                                       |
| typecheck                                           | PASS, exit 0, 31.91 s                                                                            |
| lint                                                | PASS, 0 errors / 13 существующих warnings, exit 0, 43.31 s                                       |
| full unit/integration                               | PASS, 340 files / 2385 tests, exit 0, 58.30 s; 1 существующий opt-in local Supabase test skipped |
| test:infra                                          | PASS, 7 files / 68 tests, exit 0, 11.86 s                                                        |
| test:alpha                                          | PASS, 1 file / 1 test, exit 0, 9.75 s                                                            |
| production Vite build                               | PASS, exit 0, 2.80 s                                                                             |
| format:check                                        | PASS, exit 0, 63.26 s                                                                            |
| git diff --check                                    | PASS, exit 0                                                                                     |
| Scoped sleep E2E                                    | PASS, 38/38, 0 retries/skipped, exit 0, 218.82 s; `e2e-final-green.log`                          |

Scoped E2E: `tests/e2e/current.sleep-preparation.spec.ts` и `current.sleep-recording.spec.ts`, существующие проекты desktop 1440×900 и mobile 390×844. Порт 4173 занят чужим preview «Финансиста», поэтому использован временный wrapper `node ../artifacts/run-sleep-e2e.mjs` на 4185 через существующий managed lifecycle/config. Собственный порт освобождён; чужой процесс и инфраструктура репозитория не изменены.

Проверены сохранение/reload, timer pause/resume/expiry, отказ записи и retry, actual production sync capture/apply/reopen, incoming ERROR и timezone change, stale status, прежняя запись ночи и календарь. Browser QA включает keyboard/focus, reduced motion, controls ≥44 px, отсутствие horizontal overflow и неожиданных page/console errors.

## Визуальная проверка

Reference: текущий вечерний экран `../artifacts/sleep-quick-entry-qa/` и принятая Graphite/Jade поверхность. Сохранены final full-page и card screenshots, визуально проверены guide desktop/mobile, подтверждение, stale и failure. Первоначальная серая главная кнопка исправлена использованием действующего `planner-primary`; подтверждение зелёное, stale/permissions имеют цвет внимания, ERROR — красный. Текст и кнопки помещаются на mobile, таймер не доминирует над текущим действием. Неожиданных оставшихся расхождений в затронутых блоках нет.

Основные screenshots в evidence:

- `desktop-guided-preparation.png`, `mobile-guided-preparation.png`, `desktop-guided-card.png`, `mobile-guided-card.png`.
- `desktop-android-confirmation.png`, `mobile-android-confirmation.png`, `desktop-android-confirmation-card.png`, `mobile-android-confirmation-card.png`.
- `desktop-android-stale-card.png`, `mobile-android-stale-card.png`; desktop/mobile `android-error-card.png`, `android-permission_required-card.png`, `android-not_confirmed-card.png`.

## Review и диагностика

Reviewer обнаружил P2: incoming report не обновлял уже открытый экран. Исправлен production sync subscription, защищён ввод; новая browser-регрессия воспроизвела RED и прошла GREEN. Reviewer подтвердил исправление.

Итоговые проверки выявили ещё два конкретных случая: новый integration test выбирал последний payload по случайному UUID-порядку `getAll()`, а закрепление режима черновика блокировало ручное переключение вида. Test fixture теперь детерминированно создаёт обратный порядок IDs, payload выбирается по revision; explicit mode имеет приоритет над AUTO pinning. Исходные failures воспроизведены, targeted исправления и новый финальный gate прошли. Тот же reviewer проверил эти поправки без замечаний. Assertions, thresholds, deadlines и retries не ослаблялись.

## Границы и следующий выпуск

Полный E2E — NOT RUN по LifeOS Testing Stage Gate: изменения ограничены sleep flow, общая схема/миграция, routing, shell и browser infrastructure не менялись. Общий unit/integration gate и все sleep-сценарии выполнены.

Native Windows/Android build, физический телефон, постановка/срабатывание при заблокированном экране — NOT RUN: необходимы native сборка и телефон при общем выпуске. Mobile Chrome и supported synthetic gateway не подтверждают работу системного AlarmManager на реальном устройстве.

Версия остаётся **1.0.44**. Commit, push, release, установка и изменение update feed не выполнялись. Реализация накоплена для следующего общего выпуска Windows/Android по указанию пользователя.
