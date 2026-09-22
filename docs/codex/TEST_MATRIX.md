# Матрица проверок LifeOS

## Подготовка

```bash
npm ci
```

Используется npm с `package-lock.json` lockfile v3. Не заменяй менеджер пакетов и не добавляй
зависимости без отдельного решения.

## Канонические команды

| Задача                            | Команда                                        | Режим                         | Process deadline |
| --------------------------------- | ---------------------------------------------- | ----------------------------- | ---------------: |
| Targeted unit/integration         | `npm run test:target -- src/path/File.test.ts` | one-shot, selector обязателен |            120 с |
| Быстрые domain/application/shared | `npm run test:fast`                            | one-shot                      |            180 с |
| Полные unit/integration           | `npm run test`                                 | one-shot                      |            300 с |
| Self-tests инфраструктуры         | `npm run test:infra`                           | one-shot                      |            120 с |
| Alpha gate                        | `npm run test:alpha`                           | one-shot                      |             60 с |
| Список E2E                        | `npm run test:e2e:list`                        | managed one-shot              |            120 с |
| Browser E2E                       | `npm run test:e2e`                             | managed one-shot              |           1200 с |
| TypeScript                        | `npm run typecheck`                            | bounded one-shot              |            180 с |
| ESLint                            | `npm run lint`                                 | bounded one-shot              |            180 с |
| Production build                  | `npm run build`                                | bounded sequential one-shot   |    240 с + 120 с |
| Prettier check                    | `npm run format:check`                         | bounded one-shot              |            180 с |
| Gate без browser E2E              | `npm run verify`                               | sequential one-shot           | deadlines этапов |
| Gate с полным browser E2E         | `npm run verify:full`                          | verify → E2E                  | deadlines этапов |

`test:target`, `test:fast`, `test`, `test:infra` и `test:alpha` всегда вызывают локальный Vitest с
подкомандой `run`. Пустой targeted selector завершается как invalid config, поэтому случайный
полный прогон вместо одного файла невозможен.

Не используй для проверки голые `vitest`, `npx vitest`, `npm run dev` или Playwright с `--ui`,
`--debug`, `--headed`, `--config`, `--reporter`: это watch, интерактивные или обходящие managed
lifecycle/heartbeat режимы.
Канонические wrappers также отклоняют `--retry`/`--retries` и config override: агент не может
скрыть failure повторными прогонами или подменить проверенную конфигурацию.

## Порядок работы

Политику выбора gate задаёт `AGENTS.md`, раздел Testing Stage Gate. Для изменения кода:

1. После изменения поведения запусти ближайший тест:
   `npm run test:target -- src/path/ChangedContract.test.ts`.
2. Если затронут общий domain/application/shared контракт, добавь `npm run test:fast`.
3. После стабилизации перед handoff один раз выполни `npm run verify`. Typecheck, lint, unit,
   infra, alpha, build и формат уже входят в него; отдельно они нужны для локализации проблемы.
4. Полный E2E добавь только при условиях Testing Stage Gate. Для R9/R10/R12 он обязателен.
   Перед запуском укажи конкретную причину. `verify:full` эквивалентен verify → E2E.

`verify` последовательно запускает typecheck → lint → full unit/integration → test-infrastructure
→ alpha → build → format check → `git diff --check`. E2E в него не входит. Первый failure
останавливает цепочку с ненулевым exit code. Retry отсутствуют.

Источник состава команд — активный `package.json`. Сейчас `verify` представляет npm-цепочку:
этапы bounded, общего deadline 1800 с у неё нет. Старый `scripts/verify.mjs` содержит иную цепочку
с E2E и общим deadline, но текущий npm script его не вызывает; не запускай его как замену gate.

Уже успешный gate повторяется только после влияющего на него изменения, нового риска или failure.
Новый финальный отчёт, смена reviewer или документационная правка не требуют повторного полного suite.

## Документация, навыки и agent config

Для патча только в Markdown, `.agents` или `.codex` без изменения исполняемого продукта:

- проверь свой diff и ссылки на реальные файлы/разделы;
- проверь формат затронутых Markdown локальным Prettier:
  `node node_modules/prettier/bin/prettier.cjs --check <file.md> ...`;
- проверь TOML/YAML существующим parser или доступным валидатором навыков;
- сверь описанные npm-команды с `package.json` и wrappers;
- при изменении правил проверь реалистичные решения: продолжение разрешённой работы, нужные
  согласования, dirty baseline, выбор тестов; межфайловые изменения полезно отдать read-only reviewer;
- выполни `git diff --check` и `git status --short`.

Эти узкие проверки должны завершаться за ограниченное время (для formatter/parser достаточно
120 с); для долгого процесса используй существующий `runBoundedProcess` из
`scripts/test-infrastructure/process-runner.mjs`. Полный `verify`, E2E и тесты на совпадение текста
правил не нужны. Это исключение не относится к build/test scripts, runtime config, CI или зависимостям.
Проверяй новые навыки на понятность, границы и поведение; parser проверяет только синтаксис.

Предсуществующий dirty code фиксируется отдельно. Проверки этой задачи не являются свидетельством
готовности чужого патча или релиза всего приложения.

## E2E, Vite и порт 4173

`test:e2e:list` и `test:e2e` используют один managed lifecycle:

- до запуска проверяют `127.0.0.1:4173`;
- при занятом порту немедленно завершаются с понятной ошибкой;
- не определяют и не завершают владельца чужого порта;
- запускают Vite напрямую с `--strictPort` и закрытым stdin;
- запускают Playwright только после HTTP readiness;
- на success, failure, timeout, SIGINT или SIGTERM завершают только дерево созданного процесса;
- подтверждают освобождение порта ограниченным teardown.

Playwright выполняется с `retries: 0`, per-test timeout 30 секунд, action timeout 10 секунд,
navigation timeout 15 секунд, expect timeout 5 секунд и global timeout 1200 секунд. Trace
сохраняется при failure. На Windows owned tree завершается по PID созданного child через
`taskkill /T`; PID из port lookup никогда не используется.

Если Windows `taskkill /T` сам недоступен или завершается с ошибкой, runner делает ограниченную
fallback-попытку закрыть точный корневой child, но не маскирует её как подтверждённый tree cleanup:
результат содержит `CLEANUP ERROR`. Для managed Vite teardown дополнительно проверяется фактическое
освобождение owned-порта; восстановление после такой ошибки явно печатается как `RECOVERED`, а не
происходит молча.

Managed reporter печатает `START N/total [project] test name`, результат каждого теста и heartbeat
каждые 10 секунд, пока тест выполняется. Текущее состояние сохраняется в служебный progress-файл;
если process-level deadline сработает раньше Playwright, timeout-диагностика всё равно содержит
точные `N/total`, project, имя зависшего теста, этап `playwright` и elapsed. Progress-файл удаляется
в bounded teardown.

## Диагностика зависания

Не жди молча дольше встроенного deadline. Runner печатает начало этапа, фактическую команду,
допустимое время, elapsed и exit code. Timeout возвращает `124` и является failed/unresolved check.

При timeout:

1. сохрани stage, command, deadline, elapsed и последний output;
2. проверь, что owned E2E-порт освобождён;
3. локализуй последний `PASS/SKIP` и первый незавершённый `START` по E2E progress/heartbeat;
   для Vitest используй `test:target` или один диагностический прогон с `--reporter=verbose`;
4. исследуй timers/listeners/IndexedDB/worker/process handles;
5. не запускай бесконечные retry и не увеличивай timeout без измеренной причины.

Если порт занят, сообщи адрес и попроси владельца остановить процесс или выбрать другое время.
Никогда не убивай процесс только потому, что он занимает требуемый порт.

## Ручная browser QA

Для отдельной ручной QA можно явно запустить `npm run dev` в контролируемом терминале. Это
долгоживущий процесс, а не тест: агент обязан сам остановить созданный dev server после проверки.
Проверь desktop, затронутый mobile viewport, keyboard/focus и browser console.

## Git hygiene после gate

```bash
git diff --check
git diff --stat
git diff --name-status
git status --short
```

Prettier использует `endOfLine: auto`, потому что Windows Git настроен с `core.autocrlf=true`.
Массовая перезапись product source ради LF не требуется.
