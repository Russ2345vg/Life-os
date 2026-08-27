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
| Полный quality gate               | `npm run verify`                               | sequential one-shot           |     1800 с общий |

`test:target`, `test:fast`, `test`, `test:infra` и `test:alpha` всегда вызывают локальный Vitest с
подкомандой `run`. Пустой targeted selector завершается как invalid config, поэтому случайный
полный прогон вместо одного файла невозможен.

Не используй для проверки голые `vitest`, `npx vitest`, `npm run dev` или Playwright с `--ui`,
`--debug`, `--headed`, `--config`, `--reporter`: это watch, интерактивные или обходящие managed
lifecycle/heartbeat режимы.
Канонические wrappers также отклоняют `--retry`/`--retries` и config override: агент не может
скрыть failure повторными прогонами или подменить проверенную конфигурацию.

## Порядок работы

1. После изменения запусти ближайший тест:
   `npm run test:target -- src/path/ChangedContract.test.ts`.
2. Если затронут общий domain/application/shared контракт, добавь `npm run test:fast`.
3. После стабилизации выполни `npm run typecheck` и `npm run lint`.
4. Не запускай тяжёлый gate после каждого edit. Перед handoff один раз выполни `npm run verify`.

`verify` последовательно запускает typecheck → lint → full unit/integration → test-infrastructure
→ alpha → E2E → build → format check → `git diff --check`. Первый failure сохраняет исходный exit
code и останавливает цепочку. Retry отсутствуют.

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
