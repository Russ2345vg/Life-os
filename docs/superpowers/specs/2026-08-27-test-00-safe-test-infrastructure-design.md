# TEST-00 Safe Test Infrastructure Design

## Цель

Сделать тестовый цикл LifeOS детерминированным, конечным и безопасным для агентной разработки:
каждая каноническая проверка запускается один раз, сообщает текущий этап и длительность, имеет
разумный верхнеуровневый deadline и завершает только созданные ею процессы.

## Исходное состояние и подтверждённые причины

- `npm run test` исторически запускает `vitest run`, поэтому watch-mode не является причиной
  зависания этой команды.
- Голый `vitest` или `npx vitest` без `run` может перейти в watch-mode и не является допустимой
  командой для Codex.
- Полный `src`-suite на текущем дереве завершился успешно: 258 файлов, 2203 теста, 83.96 секунды.
  Стандартный reporter почти не печатает прогресс, поэтому штатный прогон визуально выглядит
  зависшим дольше прежнего baseline 62.99 секунды.
- У `test`, `verify` и Playwright lifecycle нет общего process-level deadline. Test-level timeout
  Vitest или Playwright не защищает от зависшего reporter-а, открытого handle или дочернего процесса.
- Существующий незакоммиченный managed E2E runner проверяет занятый порт и управляет Vite, но на
  Windows завершает только непосредственного ребёнка, не ограничивает ожидание Playwright, не
  запрещает интерактивные флаги и не очищает проигравший shutdown timer.
- Lifecycle test при собственном timeout завершает только wrapper-процесс и не дожидается teardown;
  его Vite, Playwright или Chrome descendants могут остаться жить и занять порт 4173.
- `test:alpha` находится на границе стандартного пятитысячного Vitest timeout и уже завершался
  timeout-ошибкой, хотя диагностический запуск с достаточным лимитом завершил сценарий.
- Текущий Vitest include не захватывает три существующих файла `src/**/*.test.tsx`.
- Некоторые IndexedDB test helpers не обрабатывают `blocked` или `abort`, поэтому неуспешный путь
  может оставить promise незавершённым до внешнего timeout.
- `verify`, `AGENTS.md`, `CODEX_WORKFLOW.md` и `TEST_MATRIX.md` описывают разные наборы полного gate.

## Границы

- Не менять продуктовую функциональность, domain/application contracts и пользовательские данные.
- Не менять стек и не добавлять зависимости.
- Не выполнять retry упавших тестов и не подавлять их exit codes.
- Не увеличивать timeout всех тестов ради зелёного результата.
- Не завершать процесс только потому, что он занимает требуемый порт.
- Не изменять и не откатывать существующие MOR-00/MOR-01 изменения.
- Не выполнять push.

## Архитектура команд

### Общий bounded process runner

В `scripts/test-infrastructure/` появится небольшой Node-модуль без сторонних зависимостей. Он:

- запускает исполняемый файл напрямую с `shell: false`;
- принимает имя этапа, команду, аргументы, рабочий каталог и deadline;
- наследует обычный stdout/stderr, но закрывает stdin для неинтерактивных проверок;
- печатает начало этапа, команду и допустимое время;
- печатает завершение, elapsed time и фактический exit code;
- при deadline печатает имя этапа, команду и elapsed time, затем завершает только известное дерево
  созданного child process;
- возвращает `124` для timeout, исходный ненулевой код для обычного падения и отдельную понятную
  диагностику для spawn error;
- устанавливает ограниченный cleanup и на `SIGINT`/`SIGTERM`, сохраняя семантику exit code
  `130`/`143`.

На Windows дерево собственного процесса завершается через системный `taskkill /PID <pid> /T /F`.
PID берётся только из `ChildProcess.pid`, созданного текущим runner-ом. Port lookup никогда не
используется как источник PID для завершения. На остальных платформах runner использует сигналы
для созданной process group и ограниченный escalation после grace period.

### Канонические npm scripts

- `test:target -- <path-or-pattern>` — обязательный явный selector, `vitest run`, короткий deadline.
  Пустой selector является invalid config и немедленно завершается с ошибкой.
- `test:fast` — one-shot набор быстрых domain/application/shared тестов для ранней обратной связи.
- `test` — полный one-shot unit/integration suite, включая `.test.ts` и `.test.tsx`, но без
  отдельного тяжёлого alpha gate и без process-lifecycle self-tests.
- `test:infra` — быстрые тесты test runner, timeout, exit codes, port ownership и teardown.
- `test:alpha` — существующий 20-дневный IndexedDB gate с локальным обоснованным test timeout и
  собственным process-level deadline.
- `test:e2e:list` — список E2E через тот же managed lifecycle/config path без запуска browser suite.
- `test:e2e` — полный Playwright gate через managed Vite lifecycle и общий deadline.
- `typecheck`, `lint`, `build`, `format:check` — прямые bounded one-shot проверки; build
  последовательно ограничивает TypeScript и Vite отдельными deadlines.
- `verify` — единственная последовательная полная проверка текущего дерева.

`npm run test` сохраняется как безопасная non-watch команда. Для Codex запрещаются `vitest`,
`npx vitest`, `npm run dev` как проверка и любые Playwright `--ui`, `--debug`, `--headed` или другие
интерактивные режимы внутри канонического E2E gate.

## Разделение быстрых и тяжёлых проверок

Обычный цикл изменения:

1. `npm run test:target -- <изменённый test file>`;
2. при затронутом общем слое — `npm run test:fast`;
3. `npm run typecheck` и `npm run lint`;
4. после стабилизации патча — `npm run test`, `npm run test:infra`, `npm run test:alpha`;
5. перед завершением — `npm run test:e2e` и `npm run build`;
6. `npm run format:check` и Git hygiene checks.

Полный gate не запускается после каждого изменения. Targeted selector передаётся Vitest только
после явной проверки, что он присутствует; это предотвращает случайный полный прогон вместо
targeted теста.

## Verify orchestration

`scripts/verify.mjs` последовательно вызывает bounded runner для следующих этапов:

1. typecheck;
2. lint;
3. full unit/integration tests;
4. test-infrastructure tests;
5. alpha gate;
6. E2E;
7. build;
8. format check;
9. `git diff --check`.

Оркестратор останавливается на первом ненулевом результате, не запускает retries и выводит
сводную таблицу уже выполненных этапов. Каждый этап имеет отдельный deadline, а verify — общий
deadline, превышающий сумму нормальных наблюдаемых длительностей, но ограничивающий худший случай.
Конкретные значения фиксируются в коде как именованные настройки рядом с командами и покрываются
тестами. Изменение deadline требует измерения и объяснения, а timeout считается failed/unresolved
check, не успехом.

## E2E lifecycle и порт

Managed E2E runner владеет только процессами, которые сам запустил:

1. до запуска он проверяет `127.0.0.1:4173`;
2. занятый порт приводит к немедленной ошибке с адресом и советом освободить порт вручную;
3. владелец занятого порта не определяется и не завершается;
4. Vite запускается напрямую с `--strictPort`, закрытым stdin и контролируемым startup deadline;
5. readiness требует успешного HTTP-ответа от созданного сервера;
6. Playwright запускается напрямую с managed config без собственного `webServer`;
7. interactive/config override flags отклоняются до запуска сервера;
8. любой exit, spawn error, timeout или сигнал проходит через один идемпотентный teardown;
9. teardown завершает Playwright/Chrome tree, затем Vite tree, дожидается освобождения порта в
   ограниченный срок и сообщает ошибку, если собственный процесс не был очищен.

`playwright.config.ts` получает `globalTimeout` как второй уровень защиты. Per-test retries остаются
равными `0`. Trace на failure включается в диагностически полезном режиме, не зависящем от retry.

## Timers, listeners и IndexedDB

- Проигравшие timer branches в `Promise.race` всегда очищаются.
- Signal listeners снимаются только после завершённого идемпотентного teardown.
- Test controllers, которые ставят timeout, дожидаются child exit и очищают timer на всех путях.
- Подтверждённые IndexedDB helpers получают `blocked`/`abort` rejection handlers.
- Новое широкое глобальное закрытие всех IndexedDB соединений не добавляется: оно могло бы скрыть
  реальные lifecycle ошибки. Exception-safe cleanup добавляется только в затронутые helpers/tests.

## Диагностика

Каждый bounded этап печатает строки вида:

```text
[verify] START test — deadline 300s
[verify] PASS test — 84.12s — exit 0
```

Timeout сообщает минимум:

```text
[verify] TIMEOUT test:e2e — 1200.00s — command: node scripts/run-playwright-e2e.mjs
```

E2E дополнительно сообщает стадии `port-check`, `vite-startup`, `playwright`, `teardown` и фактическую
причину остановки. Обычное падение теста сохраняет его исходный вывод и exit code.

## Regression tests test-инфраструктуры

Тесты используют короткие контролируемые fixture-процессы вместо полного browser suite там, где
проверяется сам runner:

- успешный child возвращает `0` и duration;
- падающий child сохраняет ненулевой exit code;
- зависший child получает deadline, код `124` и stage diagnostics;
- invalid/empty targeted selector завершается до запуска Vitest;
- spawn error завершается ограниченно и диагностируется;
- occupied port отклоняется, а контрольный owner продолжает отвечать;
- normal E2E list освобождает порт;
- SIGINT/timeout во время startup и Playwright приводит к teardown собственного дерева;
- повторный cleanup идемпотентен;
- config и interactive overrides отклоняются;
- после теста отсутствует owned descendant и порт снова доступен.

Там, где невозможно надёжно наблюдать process tree одинаково на всех платформах, Windows-specific
проверка условно запускается только на `win32`, а общий контракт exit/port остаётся кроссплатформенным.

## Изменяемые модули

- `package.json` — публичные команды.
- `vitest.config.ts` и отдельная test-инфраструктурная конфигурация при необходимости — границы
  fast/full/infra наборов.
- `playwright.config.ts` и managed config — global deadline и единый server ownership.
- `scripts/test-infrastructure/*` — bounded child lifecycle.
- `scripts/run-check.mjs`, `scripts/run-playwright-e2e.mjs`, `scripts/verify.mjs` и их tests/fixtures.
- `src/test/alpha/AlphaCycleGate.test.ts` — локальный обоснованный timeout и exception-safe close.
- Только подтверждённые IndexedDB test helpers с незавершимыми `blocked`/`abort` ветвями.
- `AGENTS.md`, `docs/codex/CODEX_WORKFLOW.md`, `docs/codex/TEST_MATRIX.md`, `README.md` и
  `docs/codex/PROJECT_MAP.md` — единый канон команд.

Product source и MOR-01 не изменяются.

## Acceptance evidence

- Static test подтверждает, что все публичные test scripts используют one-shot runners.
- `test:target` не может случайно запустить весь suite без selector.
- Timeout regression подтверждает конечный exit и содержит command/stage/elapsed diagnostics.
- Occupied-port regression подтверждает ненулевой exit и жизнеспособность чужого owner-а.
- Teardown regression подтверждает освобождение 4173 и отсутствие собственного descendant.
- Fresh gate фиксирует команду, режим, время, exit code и результат для targeted, typecheck, lint,
  full tests, infra, alpha, E2E, build, format и Git checks.
- Финальный diff не содержит product behavior changes, новых dependencies, lockfile drift или
  незапрошенных изменений MOR-00/MOR-01.

## Не входит в TEST-00

- Ускорение или рефакторинг 2203 product tests, если они завершаются в установленные deadlines.
- Изменение UX, domain/application логики или persistence schema.
- Автоматическое завершение стороннего dev server.
- CI provider configuration, так как tracked CI workflow в проекте отсутствует.
- MOR-01 и последующие продуктовые этапы.
