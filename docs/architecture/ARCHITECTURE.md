# Архитектура LifeOS

## Слои

```text
Presentation → Application → Domain
       App ↘ Infrastructure → Application ports / Domain
```

- **Domain** хранит сущности, значения и инварианты.
- **Application** содержит команды, запросы и порты.
- **Infrastructure** реализует IndexedDB, sync, clock, UUID и platform adapters.
- **Presentation** отображает состояние и передаёт намерения пользователя application-слою.
- **App** является composition root и связывает конкретные реализации.
- **Shared** содержит только минимальные технические контракты.

Domain не зависит от React, browser API, Application, Infrastructure или Presentation.
Presentation не импортирует конкретные infrastructure adapters и не изменяет IndexedDB напрямую.

## Единственный рабочий runtime

`ApplicationShell` загружает `PlannerWorkspace`. Composition root предоставляет только текущие
planner, planning, balance, sleep и sync services. Отдельной старой оболочки, runtime mode или
переключателя версии нет.

Рабочая предметная модель интерфейса:

```text
Sphere → Direction → Goal → LifeAction
```

Period planning, recurrence, focus, inbox, balance и sleep расширяют эту модель без второго
источника состояния.

## Изменение состояния

React-компоненты вызывают application-команды. Команда координирует repositories и domain rules;
queries читают состояние и его не изменяют. Один предметный факт имеет один авторитетный источник.

## Persistence и sync

`LifeOsIndexedDb` — локальный источник сохранённых records. Repositories преобразуют records через
mappers. Sync mutation capture и registry работают на границе infrastructure/application.

Схема сохраняет старые stores и normalization paths для существующих записей, snapshot/recovery и
синхронизации. Эти модули не входят в пользовательскую навигацию и не возвращают старые сценарии в
composition root. Их удаление возможно только отдельной data migration после инвентаризации
локальных и Supabase records.

## Проверка изменений

Предметные правила проверяются unit tests, application-сценарии — integration tests, adapters —
persistence/sync tests, интерфейс — render и Playwright tests. Канонические gates определены в
`AGENTS.md` и `docs/codex/TEST_MATRIX.md`.
