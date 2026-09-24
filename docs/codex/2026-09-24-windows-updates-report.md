# Windows updates — выпуск 1.0.17 от 24 сентября 2026

Реализованы проверка новой версии при запуске Windows LifeOS, уведомление с «Обновить»/«Позже»,
прогресс загрузки, повтор после ошибки и защита от повторной установки. Браузер и Android
не вызывают Windows updater. Пользовательские данные и существующий ключ подписи не менялись.

Подписанный Windows-выпуск **1.0.17** опубликован как latest:
`https://github.com/Russ2345vg/LifeOS-Releases/releases/tag/v1.0.17`.
Установщик `LifeOS_1.0.17_x64-setup.exe` имеет размер **7 599 246 байт** и SHA-256
`484807ee2858c75f497ff26bf95095f8f4a39b513417b45988c8d7ee118017d9`.
Локальный проверенный пакет находится в
`src-tauri/target/release-channel/v1.0.17/windows/` вместе с `.sig`, `latest.json`,
`SHA256SUMS.txt` и `prepared.json`. Commit и push исходников не выполнялись.

## Свежие результаты

| Проверка                                                    | Результат                                  |
| ----------------------------------------------------------- | ------------------------------------------ |
| Application service + Tauri adapter targeted                | 9/9 PASS                                   |
| Render targeted                                             | 3/3 PASS                                   |
| `npm run test:release`                                      | 6/6 PASS                                   |
| Targeted browser updates                                    | 6/6 PASS на desktop/mobile                 |
| `npm run verify`: typecheck, lint                           | PASS; прежнее предупреждение voice fixture |
| `npm run verify`: unit/integration                          | 1385 PASS, 1 skipped                       |
| `npm run verify`: infra / alpha                             | 55 PASS / 1 PASS                           |
| `npm run verify`: production build                          | PASS; предупреждение о размере bundle      |
| Финальный `npm run verify` для 1.0.17                       | PASS                                       |
| Scoped Prettier всех файлов этой задачи                     | PASS                                       |
| Финальный `npm run test:e2e`                                | 88 PASS, 2 условных skips, 408.05 секунды  |
| Все 6 updater browser checks в полном E2E                   | PASS                                       |
| `npm run release:windows -- prepare 1.0.17`                 | PASS, exit 0, 152.60 секунды               |
| `npm run release:windows -- publish 1.0.17`                 | PASS                                       |
| SHA-256 prepared receipt + version/signature correspondence | PASS                                       |
| Публичный latest manifest                                   | PASS, SHA-256 совпал с подготовленным      |
| Публичная загрузка installer                                | PASS, HTTP 206 range response              |
| `git diff --check`                                          | PASS                                       |

Managed E2E подтвердил освобождение порта 4173. При teardown runner сообщил RECOVERED:
основной tree cleanup получил Access denied, затем завершил собственный server root и
подтвердил свободный порт. Полный suite повторно не запускался.

## Исторические замечания до финального gate

Форматирование предсуществующих изменений:

- `src/application/sleep/SleepScheduleService.ts`
- `src/application/sleep/WakeAlarmGateway.ts`
- `src/domain/sleep/SleepSchedule.ts`
- `src/infrastructure/alarm/TauriAndroidWakeAlarmGateway.ts`
- `src/presentation/planner-v2/planner-v2.css`
- `src/presentation/planner-v2/PlannerToday.test.tsx`
- `src/presentation/planner-v2/SleepPreparationPage.test.tsx`
- `src/presentation/planner-v2/SleepPreparationPage.tsx`

В первом полном прогоне desktop-chrome и mobile-chrome упал
`current.daily-workflow.spec.ts:327` — `entity menus support hold, cancel scroll gestures,
keyboard and confirmed deletion at mobile widths`: ожидание menuitem «Удалить» превысило
10 секунд после открытия меню с клавиатуры. Код EntityContextMenu в задаче не менялся.
Причиной оказалось отложенное событие прокрутки после открытия меню. Исправление закреплено
desktop/mobile регрессией; итоговый полный прогон прошёл.

## UI review / правило №38

Проверен реальный shell с имитацией native gateway на 1440×900 и 390×844:
уведомление, ошибка проверки, ошибка установки, повтор, busy/success, keyboard dismissal.
Скриншоты `update-available.png` сохранены в соответствующих каталогах `test-results/`.
Проверены отсутствие horizontal overflow, видимый focus, перенос кнопок под текст и понятность
состояний без опоры только на цвет. Кнопки используют существующий минимум 44 px; новых анимаций
нет. Главным содержимым остаётся текущая страница; основной CTA уведомления — золотой по tokens.
Новый banner не меняет текущую оболочку, которая визуально отличается от старого общего reference.
Pixel-perfect соответствие всей страницы этому reference не заявляется.

## После публикации

Старой установленной версии без updater нужен один bootstrap install поверх приложения.
Удаление приложения и очистка данных не требуются. Реальный запуск NSIS поверх предыдущей
версии, restart и сохранность данных на этом компьютере ещё не проверялись; browser E2E этого
не заменяет.

Вердикт: **LifeOS 1.0.17 опубликован и доступен для установки на Windows**.
Инструкция: [WINDOWS_UPDATES.md](WINDOWS_UPDATES.md).
