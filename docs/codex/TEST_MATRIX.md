# Матрица проверок LifeOS

## Подготовка

```bash
npm ci
```

Используется npm с `package-lock.json` lockfile v3. Не заменяй менеджер пакетов без отдельного
решения.

## Команды

| Задача                     | Команда                                 | Режим                |
| -------------------------- | --------------------------------------- | -------------------- |
| Development server         | `npm run dev`                           | Долгоживущий процесс |
| Один unit/integration файл | `npm run test -- src/path/File.test.ts` | Однократный          |
| Alpha gate                 | `npm run test:alpha`                    | Однократный          |
| Все Vitest-тесты           | `npm run test`                          | Однократный          |
| Список E2E без запуска     | `npm run test:e2e:list`                 | Однократный          |
| Browser smoke              | `npm run test:e2e`                      | Однократный          |
| TypeScript                 | `npm run typecheck`                     | Однократный          |
| ESLint                     | `npm run lint`                          | Однократный          |
| Production build           | `npm run build`                         | Однократный          |
| Prettier check             | `npm run format:check`                  | Однократный          |
| Проверка whitespace Git    | `git diff --check`                      | Однократный          |

Test runner — Vitest 4.1.10. `package.json` запускает `vitest run`, поэтому `npm run test` не
является watch-командой.

Prettier использует `endOfLine: auto`, потому что Windows Git настроен с `core.autocrlf=true`.
Проверка сохраняет EOL checkout и продолжает проверять остальные правила форматирования; массовая
перезапись product source ради LF не требуется.

Контрольный запуск 2026-08-24 завершился штатно: 147 файлов, 1166 тестов, 62.99 секунды. При
неинтерактивном выводе Vitest показал только `RUN`, а итоговую сводку напечатал после завершения,
поэтому около минуты процесс выглядел зависшим. Это не open handle: процесс вышел с кодом `0` сразу
после сводки. Для диагностики прогресса используй однократную команду
`npm run test -- --reporter=verbose` с внешним ограничением времени; timeout тестов не увеличивай.

Не используй для quality gate `vitest` или `npx vitest` без подкоманды `run`: в интерактивной
среде такой запуск может перейти в watch-режим и не завершиться сам.

## Быстрая проверка

Выбирай минимальный набор по изменённому слою:

```bash
npm run test -- src/path/ChangedContract.test.ts
npm run typecheck
git diff --check
```

Для Markdown/config-only изменений сначала валидируй формат и структуру изменённых файлов, затем
запускай проверки, которые реально затрагивает конфигурация.

## UI-проверка

Автоматический smoke самостоятельно запускает и останавливает Vite на порту 4173:

```bash
npm run test:e2e
```

Для отдельной ручной browser QA запусти `npm run dev` в одном терминале, затем открой показанный
адрес браузерным инструментом в другой сессии. Пройди изменённый сценарий, проверь desktop,
затронутый mobile viewport и browser console.

Playwright smoke использует установленный системный Google Chrome, проверяет desktop 1440×900 и
mobile 390×844, основную навигацию, console/page errors и сохранение desktop sidebar preference
после refresh.

## Полный quality gate

```bash
npm run typecheck
npm run lint
npm run test
npm run test:alpha
npm run test:e2e
npm run build
npm run format:check
git diff --check
git diff --stat
git status --short
```

Полный `npm run test` запускай как one-shot процесс. Если он не завершается, не подменяй диагноз
увеличением timeout: установи последний завершённый файл, проверь активные handles и повтори
подозрительный файл отдельно.
