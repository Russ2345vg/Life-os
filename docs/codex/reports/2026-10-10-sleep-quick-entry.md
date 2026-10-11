# Сон и подъём: первые три улучшения

Реализован одобренный пользователем план. Изменения сохранены в рабочей ветке
`codex/batched-updates-20261010` поверх `ecd77b0af6639ce6ea79f0e6a60549aa47cfb180`.
Версия остаётся 1.0.44; публикация и установка в эту задачу не входят.

## Сделано

- Утренний вид показывает запись ночи и календарь перед подготовкой; вечерний —
  ближайший подъём и подготовку. Переключатель «Авто / Утро / Вечер» использует
  сохранённый часовой пояс и расписание для автоматического выбора.
- «Ложусь» и «Я проснулся» сохраняют редактируемые черновики. Повторный tap не
  перезаписывает первую ручную отметку. Только «Сохранить ночь» подтверждает ночь
  и включает фактические времена в статистику.
- История содержит ровно 7/30 календарных дней с пропусками, планом, фактом и
  временем в постели. Черновик не считается подтверждённым фактом. Для старой
  выбранной ночи загружается всё календарное окно, включая соседние записи.
- Введённые времена сохраняются при переключении вида, полуночи и обновлении
  данных. Смена даты блокируется до сохранения или явного сброса изменений.
- Ошибка записи сохраняет ввод и позволяет повторить действие. Ошибка загрузки
  истории показывается отдельно с повтором загрузки; она не выдаётся за пустую историю.

## Контракты данных

Сохранены schema v1, IndexedDB store, sync type, существующие confirm/revise и
alarm API. Новые команды используют существующую repository-службу. Очередь
мутаций единственного application service защищает совместные bed/wake/alarm/confirm
записи от потери полей; после неудачного сохранения очередь допускает повтор.
Подтверждённые ночи и ручное время подъёма защищены от перезаписи alarm hint.
Интервал называется «время в постели», измерение качества или фактического сна не заявляется.

## Изменённые файлы

- `src/domain/sleep/SleepObservation.ts`, `SleepObservation.test.ts` — ручные черновики.
- `src/application/sleep/SleepObservationService.ts`, `SleepObservationService.test.ts` —
  команды, дата ночи, сериализация и согласование будильника.
- `src/presentation/planner-v2/SleepPreparationPage.tsx` — контекст, порядок блоков,
  callback-команды, загрузка, retry и защита ввода.
- `src/presentation/planner-v2/sleep/SleepQuickEntry.tsx`, `SleepQuickEntry.test.tsx` —
  быстрые отметки и состояния.
- `src/presentation/planner-v2/sleep/sleepPageMode.ts`, `sleepPageMode.test.ts` — вид страницы.
- `src/presentation/planner-v2/sleep/SleepObservationChart.tsx`, `SleepObservationChart.test.tsx`,
  `sleepObservationChartModel.ts` — календарные окна и подтверждённая статистика.
- `src/presentation/planner-v2/sleep/SleepObservationForm.tsx`, `SleepObservationForm.test.tsx` —
  подсказки, dirty guard и явный сброс.
- `src/presentation/planner-v2/sleep/sleepObservationHistoryLoader.ts`,
  `sleepObservationHistoryLoader.test.ts`, `sleepObservationDateModel.ts` — полные окна дат.
- `src/presentation/planner-v2/sleep/sleep-observations.css` — responsive toolbar,
  touch zones, focus и компактная высота графика.
- `tests/e2e/current.sleep-recording.spec.ts` — новые desktop/mobile сценарии.
- Feature specification, implementation plan и этот отчёт в `docs/`.

## Проверки

| Этап                                                       | Результат                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Новые domain/application tests                             | RED → GREEN: 21/21 на первом проходе                                            |
| Calendar/mode/quick/form tests                             | RED → GREEN: 35/35                                                              |
| Уточнение одинакового clock timestamp и подсказки формы    | RED → GREEN: 18/18                                                              |
| Findings review: старое окно и потеря ввода при смене даты | RED → GREEN; 12/12 targeted unit tests + scoped E2E                             |
| `npm run test:fast`                                        | PASS, 124 files / 1186 tests, exit 0                                            |
| Scoped sleep E2E, оба existing browser projects            | PASS, 28/28, 0 flaky / skipped, exit 0                                          |
| Final `npm run verify`                                     | PASS, exit 0                                                                    |
| typecheck                                                  | PASS, exit 0                                                                    |
| lint                                                       | PASS, 0 errors / 13 существующих warnings вне изменённых файлов                 |
| full unit/integration                                      | PASS, 334 files / 2337 tests; 1 существующий opt-in local Supabase test skipped |
| test:infra                                                 | PASS, 7 files / 68 tests                                                        |
| test:alpha                                                 | PASS, 1 file / 1 test                                                           |
| production Vite build                                      | PASS, exit 0                                                                    |
| format:check                                               | PASS, exit 0                                                                    |
| git diff --check                                           | PASS, exit 0                                                                    |

Браузерная команда:

```text
npm run test:e2e -- tests/e2e/current.sleep-recording.spec.ts tests/e2e/current.sleep-preparation.spec.ts
```

Проверены ночь через перезапуск, поздний подъём, после полуночи, пропущенная ночь,
alarm prefill, редактирование и повтор после отказа записи, старое календарное окно,
7/30 дней, keyboard/focus, reduced motion, touch controls ≥44 px, отсутствие horizontal
overflow и неожиданных page/console errors. Runner освободил собственный порт 4173.

Промежуточные отказы сохранены в истории работы: RED отсутствующего поведения;
непонятный текст persistence-ошибки в двух новых E2E — заменён пользовательским сообщением;
первый final verify — TS6133 старого helper после выделения loader. Helper удалён,
полный verify повторён успешно. Assertions, сроки и retries не ослаблялись.

Полный E2E — NOT RUN по Testing Stage Gate: изменение ограничено sleep flow,
общая схема, shell, routing и test infrastructure не менялись; все существующие
sleep E2E и новые регрессии прошли. Native Windows/Android build и проверка физического
телефона — NOT RUN: эта задача накапливает frontend/application изменения для будущего выпуска.
Mobile Chrome не является проверкой физического Android или его будильника.

## Review и принятые решения

Один read-only final reviewer проверил diff по spec. Два P2 findings воспроизведены
тестами и исправлены: неполная загрузка старого окна и потеря dirty input при смене даты.
Повторный независимый review и несвязанный рефакторинг не выполнялись.

Решения исполнителя с основанием и ценой изменения:

1. Сохранить утверждённую активную ветку без нового checkout — текущая LifeOS policy
   и baseline требуют эту рабочую копию; цена пересмотра: перенос накопленного diff.
2. Bash helper навыка отсутствует — вести scoped ledger штатными PowerShell/Node
   средствами, не устанавливать runtime; цена: ручной учёт шагов.
3. Read-only `quickEntryContext` делит определение даты с командами — preview не
   дублирует application-логику; цена: дополнительный query API.
4. Компактная quick toolbar перед упорядоченными блоками — вечерняя отметка доступна
   над длинным checklist; цена: приоритет этой полосы в композиции.
5. Защита смены даты до save/reset вместо кэша несохранённых форм по датам — устраняет
   потерю ввода без нового хранилища; цена: дополнительное явное действие перед другой датой.

## Визуальная проверка

Reference: настоящий baseline `/#/v2/sleep` в этой ветке и действующее направление
Graphite/Jade от 25.09.2026. Desktop 1440×900; mobile 390×844 — штатные проекты LifeOS.
Сравнение before/after выполнено для утреннего и вечернего вида, пустого календаря.
Палитра, материалы, radius и padding существующей формы совпадают по computed styles:
background `rgb(17, 24, 27)`, text `rgb(238, 243, 242)`, jade `#81cfab`, radius 16px,
padding desktop 30px / mobile 16px. CSS cascade и существующие shared controls сохранены.
Исходное правило gold применяется с действующим Graphite/Jade override, отдельная палитра не создана.

Правило №38: проверены иерархия, общий spacing и компоненты, loading/empty/error/retry/success,
понятное disabled-состояние, один столбец на mobile, текстовые статусы, keyboard focus,
reduced motion и touch zones. Новое свечение/анимации не добавлены. Большая высота
первого варианта графика исправлена; 7 дней занимают 168px. Известных визуальных
расхождений с текущим reference после refinement не осталось. Baselines не обновлялись.

Доказательства вне Git:

```text
C:/Users/isako/.codex/visualizations/2026/10/09/01a11ead-a4ca-7593-acb9-4cce64eae4cb/artifacts/sleep-quick-entry-baseline/
C:/Users/isako/.codex/visualizations/2026/10/09/01a11ead-a4ca-7593-acb9-4cce64eae4cb/artifacts/sleep-quick-entry-qa/
```

В QA-папке: `desktop-morning.png`, `desktop-evening.png`, `desktop-empty-calendar.png`,
`mobile-morning.png`, `mobile-evening.png`, `mobile-empty-calendar.png`,
`computed-styles.json`, `css-comparison.json`, `e2e-summary.json`,
`playwright-report.html`, `test-fast.log`, `verify.log`.

## Границы и следующий шаг

Новые зависимости, миграции, изменения настроек sync/account, подписи, version/feed,
push, release и установка не выполнялись. Изменения сохранены в исходниках для следующего
согласованного общего обновления Windows и Android. В установленной версии они появятся
после отдельной сборки и выпуска.
