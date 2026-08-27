# Карта проекта LifeOS

## Назначение

LifeOS — локальное React-приложение для управления днями, решениями, действиями, рабочими
сессиями, распорядком, прогулками, сферами и журналом. Предметные данные хранятся в браузере;
облачной синхронизации в текущем коде нет.

## Стек

| Область                | Реализация                              |
| ---------------------- | --------------------------------------- |
| UI                     | React 19.2.8, React DOM 19.2.8          |
| Язык                   | TypeScript 6.0.3, strict mode           |
| Сборка и dev server    | Vite 8.2.0                              |
| Unit/integration tests | Vitest 4.1.10, `fake-indexeddb` 6.2.x   |
| Static analysis        | ESLint 10.8.0, typescript-eslint 8.65.0 |
| Форматирование         | Prettier 3.9.6                          |
| Runtime storage        | Browser IndexedDB и `localStorage`      |
| Package manager        | npm 11, `package-lock.json` lockfile v3 |

`package.json` не фиксирует собственный `engines`. Текущий Vite поддерживает Node.js `^20.19.0`
или `>=22.12.0`, а Playwright — Node.js `>=20`. Для LifeOS рекомендуется единая baseline
Node.js 22.12+; проверенная локальная среда использует Node.js 24.18.0 и npm 11.16.0.

## Точки входа

- `index.html` содержит DOM-root.
- `src/main.tsx` подключает глобальные стили и монтирует React `App`.
- `src/app/App.tsx` устанавливает `LifeOsApplicationProvider` и `ApplicationShell`.
- `src/app/composition/createLifeOsApplication.ts` — composition root: открывает IndexedDB,
  создаёт репозитории, команды и запросы.
- `src/app/ApplicationShell.tsx` связывает application API со страницами.

## Каталоги и слои

| Каталог              | Ответственность                                                  |
| -------------------- | ---------------------------------------------------------------- |
| `src/domain`         | Сущности, value objects, инварианты и domain events              |
| `src/application`    | Команды, запросы, политики, unit of work contracts и порты       |
| `src/infrastructure` | IndexedDB/InMemory-репозитории, records, mappers, clock и UUID   |
| `src/presentation`   | React-страницы, компоненты, presentation models, навигация и CSS |
| `src/app`            | Композиция, providers, browser settings stores и shell           |
| `src/shared`         | Минимальные общие технические типы                               |
| `src/test`           | Общий test setup, fakes и alpha gate                             |
| `docs/architecture`  | Архитектурные описания и persistence                             |
| `docs/decisions`     | Принятые ADR                                                     |
| `docs/ui`            | Контракты существующих экранов                                   |

Направление зависимостей:

```text
UI / Presentation → Application → Domain
             App ↘ Infrastructure → Application ports / Domain
```

Состояние предметной области изменяется через application-команды. Presentation не импортирует
конкретные infrastructure-адаптеры.

## Разделы приложения

В проекте нет URL-router и hash-маршрутов. `ApplicationShell` хранит текущий раздел как
presentation-state `activeSection`; начальное значение берётся из локальных настроек.

| Код         | Экран           |
| ----------- | --------------- |
| `today`     | День            |
| `decisions` | Решения         |
| `actions`   | Действия        |
| `routine`   | Распорядок      |
| `walks`     | Прогулки        |
| `spheres`   | Сферы           |
| `history`   | История         |
| `more`      | Ещё / настройки |

## Основные сущности и связи

- `Day` задаёт календарный день и его lifecycle.
- `Decision` может иметь связанные `LifeAction` через `decisionId`.
- `LifeAction` имеет историю `ActionSession`; одновременно допускается только одна незавершённая
  сессия в системе.
- `RoutineBlock` описывает повторяемый план и может ссылаться на существующее действие.
- `RoutineOccurrenceOverride` изменяет отдельное вхождение распорядка.
- `RoutineOccurrenceExecution` хранит фактическое выполнение вхождения.
- `Walk` относится к дате и может быть связан со `Sphere`.
- `Sphere` классифицирует предметные данные; journal records также могут хранить `sphereId`.
- `JournalEntry` формирует хронологию и ссылается на предмет через `subjectId`.

Авторитетные контракты сущностей находятся в `src/domain`, а не в UI или документации.

## Хранение состояния

IndexedDB называется `lifeos`, текущая версия схемы в коде — `8`. Object stores:

```text
days
decisions
lifeActions
actionSessions
routineBlocks
routineOccurrenceOverrides
routineOccurrenceExecutions
walks
spheres
journal
```

Records и mappers находятся в `src/infrastructure/persistence`. UI-предпочтения хранятся отдельно
в `localStorage` под ключами:

- `lifeos.local-settings.v1`;
- `lifeos.sidebar-collapsed.v1`;
- `lifeos.today-action-selection.v1`;
- `lifeos.action-list-filters.v1`.

## Команды разработки

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm run test:target -- src/path/ChangedContract.test.ts
npm run test:fast
npm run test
npm run test:infra
npm run test:alpha
npm run test:e2e:list
npm run test:e2e
npm run build
npm run format:check
npm run verify
```

`npm run verify` — единый полный bounded gate. Подробный выбор targeted/fast/full проверок и
правила диагностики timeout описаны в `docs/codex/TEST_MATRIX.md`.
