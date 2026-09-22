# Sleep Stage 2 — implementation plan

## Scope

Реализовать только экран подготовки ко сну и настройку повторяемого списка поверх Stage 1
`SleepScheduleState`. Не подключать Android alarm, DND, уведомления или другие этапы документа.

## Tasks

### 1. Domain contract

- Добавить каталог групп и пунктов с точными базовыми значениями.
- Добавить pure commands для group/item CRUD, enable, move/reorder.
- Расширить `NightCycle` жизненным циклом подготовки.
- Добавить команды отметки, auto-complete, finish-with-skips и skip-today.
- Добавить определение cycle date около полуночи.
- Сначала расширить `SleepSchedule.test.ts` и `NightTime.test.ts`, затем реализовать.

### 2. Application and persistence

- Добавить атомарные методы `SleepScheduleService`, используя `repository.update`.
- Сохранять новые поля в существующей schema version 1 и читать Stage 1 записи с безопасными
  значениями по умолчанию.
- Не менять версию IndexedDB: store уже существует.
- Добавить service/persistence tests, включая повторное открытие и неизменность снимка.
- Запустить целевые mapper tests для sync/recovery, которые непосредственно читают singleton.

### 3. Runtime composition

- Создать `IndexedDbSleepScheduleRepository` и `SleepScheduleService` в app composition.
- Экспортировать сервис через `LifeOsApplication` и application barrel.
- Добавить одну целевую composition integration с fake IndexedDB.

### 4. Planner V2 UI

- Добавить внутренний route `#/v2/sleep` без постоянного nav item.
- Добавить карточку входа на `PlannerToday`.
- Создать `SleepPreparationPage` с initial settings, grouped checklist, list settings,
  reorder/move controls, завершением и честным Android status.
- Добавить responsive styles в существующий `planner-v2.css`.
- Сначала добавить/расширить targeted navigation, Today и page tests.

### 5. Scoped verification

- Запускать `npm run test:target -- <test>` только для изменённой функции и непосредственных
  зависимостей.
- После стабилизации выполнить `npm run typecheck`, scoped lint/format при необходимости и
  `git diff --check`; не запускать общий unit suite, `test:e2e`, `verify` или `verify:full`.
- Проверить реальный экран через браузер: desktop, mobile, keyboard/focus, console, reload.
- Собрать/установить текущий Android APK и проверить сохранение после закрытия/повторного открытия
  на уже подключённом авторизованном телефоне, не реализуя Stage 3.
- Обновить корневой `design-qa.md` реальными screenshots и итогом `passed` либо `blocked`.
- Остановиться с отчётом об этапе 2.
