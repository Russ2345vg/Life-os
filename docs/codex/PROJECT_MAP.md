# Карта проекта LifeOS

## Назначение

LifeOS — локальное React-приложение для планирования по модели «Сферы → Направления → Цели →
Действия». Рабочий интерфейс один; прежние утренние, вечерние, прогулочные и session-сценарии в
приложение не подключаются.

## Стек

| Область       | Реализация                           |
| ------------- | ------------------------------------ |
| UI            | React 19, React DOM 19               |
| Язык          | TypeScript 6, strict mode            |
| Сборка        | Vite 8                               |
| Хранилище     | IndexedDB, localStorage              |
| Синхронизация | Supabase, зашифрованный sync runtime |
| Проверки      | Vitest, Playwright, ESLint, Prettier |

## Точки входа

- `src/main.tsx` монтирует приложение.
- `src/app/App.tsx` устанавливает application provider и shell.
- `src/app/ApplicationShell.tsx` принимает только текущие hash-маршруты и загружает
  `PlannerWorkspace`.
- `src/app/composition/createLifeOsApplication.ts` собирает planner, balance, sleep и sync.
- `src/presentation/planner-v2/` содержит единственный рабочий интерфейс. Имя каталога и
  URL-префикс `#/v2` сохранены как стабильные пути, а публичные типы и компоненты больше не имеют
  суффикса `V2`.

## Слои

```text
Presentation → Application → Domain
       App ↘ Infrastructure → Application ports / Domain
```

Presentation не меняет IndexedDB напрямую. Изменения предметного состояния проходят через
application-команды. `src/app` связывает текущие команды с IndexedDB, sync и UI.

## Рабочие маршруты

| Путь              | Раздел            |
| ----------------- | ----------------- |
| `#/v2/today`      | Сегодня / Завтра  |
| `#/v2/spheres`    | Сферы             |
| `#/v2/directions` | Направления       |
| `#/v2/goals`      | Цели и периоды    |
| `#/v2/actions`    | Действия          |
| `#/v2/inbox`      | Входящие          |
| `#/v2/sleep`      | Подготовка ко сну |

Детальные и create-маршруты находятся в `PlannerNavigation.ts`. Неизвестный или удалённый путь
на старте заменяется на `#/v2/today`; в browser history он не восстанавливает старый экран.

## Текущее application API

Composition root предоставляет команды и запросы для сфер, направлений, целей, действий,
планирования периодов, баланса, сна и синхронизации. У него нет API утреннего/вечернего цикла,
прогулок, распорядка, рабочих сессий или старых глобальных голосовых команд.

## Хранение и совместимость

Схема IndexedDB имеет версию 26. Текущие stores используются planner, balance, sleep и sync.
Старые stores и преобразователи записей не удаляются физически: они нужны для безопасного чтения,
snapshot/recovery и синхронизации уже существующих пользовательских данных. Это граница
совместимости хранения, а не второй runtime приложения.

`lifeos.local-settings.v1`, `lifeos-sync-pair-v1` и Supabase `/storage/v1/` остаются версиями
сохранённого формата/протокола. Их переименование без миграции разорвало бы данные или
совместимость устройств.

## Проверки

```bash
npm run test:target -- src/path/ChangedContract.test.ts
npm run test:fast
npm run verify
npm run test:e2e
npm run verify:full
```

Выбор gate и bounded-команд описан в `docs/codex/TEST_MATRIX.md`.
