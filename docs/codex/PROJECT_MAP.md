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

| Путь              | Раздел                  |
| ----------------- | ----------------------- |
| `#/v2/today`      | Сегодня / Завтра        |
| `#/v2/spheres`    | Сферы                   |
| `#/v2/directions` | Направления             |
| `#/v2/goals`      | Цели и периоды          |
| `#/v2/actions`    | Действия                |
| `#/v2/inbox`      | Входящие                |
| `#/v2/sleep`      | Подготовка ко сну       |
| `#/v2/account`    | Аккаунт и синхронизация |

Детальные и create-маршруты находятся в `PlannerNavigation.ts`. Неизвестный или удалённый путь
на старте заменяется на `#/v2/today`; в browser history он не восстанавливает старый экран.

## Текущее application API

Composition root предоставляет команды и запросы для сфер, направлений, целей, действий,
планирования периодов, баланса, сна и синхронизации. `LifeOsApplication.accountSync` — единая
application-точка регистрации, входа, восстановления, управления устройствами и безопасного выхода.
`AccountSyncService` владеет переходами account-состояния; UI не обращается к Supabase или
IndexedDB напрямую. У composition API нет утреннего/вечернего цикла, прогулок, распорядка,
рабочих сессий или старых глобальных голосовых команд.

## Владение синхронизацией аккаунта

- `SupabaseAccountAuth` реализует постоянную email/password-сессию и отдаёт проверенный
  `session_id`; один Supabase client разделяется auth и session-bound transport-адаптерами.
- `SupabaseSyncTrustTransport`, `SupabasePilotSyncTransport` и
  `SupabaseEncryptedBlobTransport` отправляют только зашифрованные payload и получают доступ по
  активной паре аккаунт + сессия + устройство.
- `IndexedDbSyncInstallationRepository` хранит возобновляемое состояние настройки аккаунта, а
  `IndexedDbAccountLocalData` выполняет ограниченную локальную очистку только после успешной
  проверки отправки и резервной копии.
- Пароли, recovery material, auth tokens и приватные ключи не сохраняются в IndexedDB или
  localStorage. Native secrets находятся в Tauri secure store; браузерная сборка без backend
  остаётся в полностью рабочем local-only режиме.
- Функция включается только при буквальном
  `VITE_LIFEOS_ACCOUNT_SYNC_ENABLED=true`; без полного Supabase-конфига composition предоставляет
  безопасный unavailable/local-only сервис.

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
