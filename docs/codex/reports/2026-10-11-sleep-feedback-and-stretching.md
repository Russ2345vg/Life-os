# Сон: утренняя оценка, растяжка и начало вечера — 11.10.2026

Реализованы утверждённые пункты 1, 4 только для растяжки и 5. Дизайн и план согласованы пользователем; один исполнитель, один итоговый независимый read-only review. Изменения сохранены в `codex/batched-updates-20261010` для будущего общего выпуска Windows/Android. Версия остаётся **1.0.44**, HEAD `ecd77b0af6639ce6ea79f0e6a60549aa47cfb180`. Commit, push, release, установка и изменение update feed не выполнялись.

## Пользовательский результат

- **«Сон и подъём» → «Утро»:** карточка «Как прошла ночь?» с независимыми оценками качества сна и самочувствия. Любой один выбор сохраняется сразу; второй необязателен. Есть изменение, сброс и повтор после ошибки. Оценки отображаются в истории и сохраняются после перезапуска.
- Оценки доступны без введённых времён. Они не подтверждают ночь и не создают фактическую длительность сна. Выбранная дата сохраняется; будущая дата запрещена в timezone наблюдения. Несохранённые времена блокируют оценки и защищены от входящей синхронизации.
- **«Вечер» → «Настроить время»:** одно общее время приготовления, уже включающее растяжку; отдельно выбор существующего включённого пункта растяжки и её длительности. Исходно 30 минут всего и 10 минут растяжки; растяжка автоматически по названию не выбирается.
- Начало подготовки считается одним вычитанием общего бюджета из планового отбоя. Например, 23:00 − 30 минут = 22:30. При переходе через полночь показывается правильная дата. После завершения или пропуска вечера повторного предложения начать нет.
- Таймер есть только на выбранном шаге растяжки. Длительность сохраняется; отсчёт сбрасывается при выходе или перезапуске. Пауза, продолжение и сброс работают; истечение времени не отмечает действие выполненным.
- Переименование сохраняет связь по ID; отключение/удаление требует нового выбора. Исторические snapshots не переписываются. Preferences не меняют версию/время native-настроек и не обесценивают актуальное подтверждение будильника Android.

## Изменения и сохранность

Domain/application владеют проверками, датами, очередью записи оценок и атомарным сохранением preferences. UI использует существующие repository-команды, controls, историю и модель таймера; доступ к IndexedDB в UI не добавлен.

Добавлены необязательные `morningFeedback` и `preparationTiming`. Codecs читают старые schema-v1 записи; повреждённая добавка игнорируется без потери основной ночи. Новых stores, миграций, sync entity types, endpoints, зависимостей и shared transport/config/scripts нет. Реальный production capture/apply/reopen перенос новых полей проверен между двумя независимыми IndexedDB.

Предыдущий dirty baseline сохранён перед реализацией. Точная дельта, включая untracked-файлы, находится в [current-task.diff](C:/Users/isako/.codex/visualizations/2026/10/09/01a11ead-a4ca-7593-acb9-4cce64eae4cb/artifacts/sleep-feedback-qa/current-task.diff), список файлов — [changed-files.json](C:/Users/isako/.codex/visualizations/2026/10/09/01a11ead-a4ca-7593-acb9-4cce64eae4cb/artifacts/sleep-feedback-qa/changed-files.json). Основные группы: sleep domain/services, persistence records/mappers, production sync regression, страница сна и новые morning/timing компоненты, guide, два scoped E2E-файла и существующий sync fixture. Остальной накопленный код сохранён.

## Проверки

Evidence: `C:/Users/isako/.codex/visualizations/2026/10/09/01a11ead-a4ca-7593-acb9-4cce64eae4cb/artifacts/sleep-feedback-qa/`.

| Этап                                               | Фактический результат / журнал                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Domain/service оценки                              | RED → GREEN; 3 файла / 34 теста, exit 0; `task1-green.log`                                                            |
| Domain/service timing                              | RED → GREEN; 3 файла / 53 теста, exit 0; `task2-green.log`                                                            |
| Persistence/production sync                        | RED → GREEN; 4 файла / 29 тестов, exit 0; `task3-green.log`                                                           |
| Утренний UI                                        | RED → GREEN; 4 файла / 14 тестов и 6 desktop/mobile E2E, exit 0; `task4-green.log`, `task4-e2e-green.log`             |
| Evening UI/guide                                   | RED → GREEN; 4 файла / 20 тестов и 6 desktop/mobile E2E, exit 0; `task5-green-final.log`, `task5-e2e-green-final.log` |
| `npm run test:fast`                                | PASS, 127 файлов / 1226 тестов, exit 0; `test-fast.log`                                                               |
| Итоговые scoped sleep E2E                          | Покрыты все 48 уникальных сценариев desktop/mobile; подробности адресных повторов ниже                                |
| **Финальный `npm run verify` после review-правки** | **PASS, exit 0, 109.37 s; `verify-post-review.log`**                                                                  |
| typecheck                                          | PASS, exit 0, 15.12 s                                                                                                 |
| lint                                               | PASS, 0 errors / 13 существующих warnings, exit 0, 22.90 s                                                            |
| full unit/integration                              | PASS, 346 файлов / 2433 теста; 1 существующий opt-in test skipped; exit 0, 34.14 s                                    |
| test:infra                                         | PASS, 7 файлов / 68 тестов, exit 0, 5.95 s                                                                            |
| test:alpha                                         | PASS, 1 файл / 1 тест, exit 0, 5.95 s                                                                                 |
| production Vite build                              | PASS, exit 0, 0.75 s; неблокирующее предупреждение о размере JS chunks                                                |
| format:check                                       | PASS, exit 0, 22.22 s                                                                                                 |
| git diff --check                                   | PASS, exit 0; предупреждения Git о LF/CRLF, без whitespace errors                                                     |

Общий scoped прогон двух sleep suites на изолированном порту 4185 дал 47 PASS и один race в тесте controlled checkbox (`e2e-final.log`, exit 1). Snapshot уже показывал сохранённое отключение пункта. Проверка уточнена: пользовательский click, затем ожидание сохранённого unchecked/enabled состояния. Затронутый сценарий повторён в обоих проектах: **2/2 PASS**, exit 0 (`e2e-final-midnight-retry.log`); остальные успешные сценарии не перезапускались без причины.

Итоговое замечание цвета ошибки проверено отдельно: RED ожидал shared `--danger`, получил обычный текст; после локальной CSS-правки retry/dirty-сценарий **2/2 PASS**, exit 0 (`review-color-red.log`, `review-color-green.log`). Его снимки обновлены. Последний полный verify выполнен после этой правки; ранее зелёный gate не выдан за проверку нового CSS.

Первые попытки verify не начали проверки из-за отсутствующего/неподходящего npm shim в локальном PATH. Исправлен только внешний helper. Первый фактический gate остановился на widened enum-типе codec; добавлен точный `SleepMorningFeedback` без изменения поведения, затем gate прошёл. Эти диагностированные повторы не меняли проверочный scope и не ослабляли assertions.

Существующий opt-in local Supabase account round-trip — **NOT RUN** без отдельной локальной конфигурации; skip уже существовал до задачи. Новые production capture/apply/sync regressions выполнены. Полный E2E всего приложения — **NOT RUN** по утверждённой матрице scope: изменён только sleep flow, общие full tests/typecheck/build выполнены.

## Desktop/mobile и визуальная сверка

Действующие проекты: desktop-chrome **1440×900**, mobile-chrome **390×844**. Проверены keyboard/focus, controls ≥44×44, reduced motion, ошибки/повтор, dirty-ввод, даты, история без выдуманных часов, отсутствие horizontal overflow и необъяснённых console/page errors в новых сценариях. Снимки сопоставлены с текущими baseline `sleep-guide-qa/` и `sleep-quick-entry-qa/` и утверждённым Graphite/Jade направлением; checklist Правила №38 применён. Новые панели используют текущую оболочку и tokens. Таймер на остальных шагах убран согласно новому scope.

Сохранено 43 снимка до адресных повторов; midnight и error/dirty снимки обновлены в `screenshots/`. Основные пары для desktop/mobile:

| Состояние                          | Папка внутри `screenshots/`                                                            | Файл                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Одна оценка без времён             | `current.sleep-recording-mo-9e105-lows-the-selected-wake-date-{desktop,mobile}-chrome` | `morning-partial.png`                                                                          |
| История и общий экран              | та же папка                                                                            | `morning-feedback.png`                                                                         |
| Ошибка/несохранённые времена       | `current.sleep-recording-mo-e8f52-es-and-protects-dirty-times-{desktop,mobile}-chrome` | `morning-feedback-error.png`, `morning-feedback-dirty.png`                                     |
| Настройки/ошибка записи/завершение | `current.sleep-preparation--54379--proof-and-retries-failures-{desktop,mobile}-chrome` | `preparation-timing-settings.png`, `preparation-timing-error.png`, `preparation-completed.png` |
| Переход через полночь              | `current.sleep-preparation--72ad3--for-unavailable-stretching-{desktop,mobile}-chrome` | `preparation-midnight.png`                                                                     |
| Таймер выбранной растяжки          | `current.sleep-preparation--9a4ad-ps-and-resumes-after-reload-{desktop,mobile}-chrome` | `guided-card.png`, `guided-preparation.png`                                                    |

## Независимый review и границы

Один fresh-context reviewer gpt-6-astra рассмотрел точную дельту и все пять Review Focus. **Critical: 0, Important: 0.** Единственный Minor — цвет ошибки — подтверждён исполнителем и исправлен в одном итоговом проходе, RED → GREEN. Второй reviewer и его собственные gate/servers не запускались; запись — `final-review.md` в evidence.

Общая стратегия concurrent-device conflicts и предшествующая dirty дельта не расширялись в новый аудит. Сохранены существующие контракты; общий gate и scoped regressions охватывают накопленную ветку.

Native Windows/Android build, физический телефон и проверка системного будильника на устройстве — **NOT RUN**: отнесены к будущему общему выпуску. Mobile Chrome проверяет общий UI, но не установочные пакеты и Android AlarmManager. Медитация, новые напоминания, автопилот и медицинские выводы не добавлены.

Исходники и локальный ledger сохранены; установленная LifeOS этим этапом не обновлялась. Следующий выпуск выполняется отдельно по указанию пользователя.
