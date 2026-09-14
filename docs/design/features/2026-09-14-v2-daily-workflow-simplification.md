# LifeOS V2 — упрощение ежедневной работы

## Контракт

Утверждённый пользователем блок от 14 сентября 2026 года задаёт поведение: Направление → Цель → Действие → Поддействие. Текущий HEAD перед изменением: `6b0f607` на `v2-current-baseline`. Предсуществующие изменения документации и настроек не входят в задачу.

- Раздел: V2 Today, Directions, Goals и Actions. Новая страница — каталог Directions; остальные сценарии расширяют существующие страницы и карточки.
- Акцент: текущая чёрно-зелёная тема V2. Мотив — спокойная рабочая поверхность без нового декора. Главный центр: список Directions по Sphere, дневной выбор на Today и предметное содержание карточек.
- Архетип: существующий V2 каталог и детальная рабочая карточка. Переиспользовать `BalanceWorkspace`, `PlanningGoalDetail`, `PlannerActionList`, `PlannerActionForm`, `PlanningProvider`, voice fields и design tokens.
- Mobile: пять пунктов снизу, остальные в «Ещё»; один поток на 390/360/320 px, 44 px touch targets, явное ⋯ рядом с long press, без горизонтального переполнения.
- Состояния: загрузка без фиктивных данных; пустые списки с предлагаемым действием; ошибка с retry; успех с `role=status`. Удаление требует подтверждения и объяснения невозможности при зависимостях.
- Reference: утверждённая карточка Direction в `2026-09-14-v2-areas-directions-balance.md`; каталог собирается из существующего V2 list archetype и не требует отдельного уникального макета.

## Модель и инварианты

Авторитет данных — Domain aggregates и application commands. Today/Tomorrow читают один `GetPlannerToday` по выбранной дате. Recurrence materialize завершается до чтения выбранной даты. Главное Direction хранится в существующем `Day` по дате; ручной выбор имеет приоритет над предложением из Goal. Следующее действие Goal хранится как `Goal.nextActionId` и не меняет отдельное главное действие даты (`LifeAction.isNext`) или дату самого Action. `LifeAction.parentActionId` необязателен и равен `null` для старых записей. Один уровень parent-child обязателен для локальных команд, sync apply и recovery. Completion parent/child независим.

Повторять до N выполнений — новый unscheduled режим существующего recurrence rule, одна текущая occurrence без planned date, count из отдельных completion facts. При паузе открытая occurrence скрывается до даты возобновления; пропуск в этом режиме недоступен, чтобы не заблокировать следующий slot. Старые recurrence modes остаются. Reopen использует существующий correction/contribution/Journal flow. Period filters читают существующие memberships, не копируют Goal; legacy planning route ведёт в Goals. Delete допускается только через application/tombstone с защитой обязательных структурных связей; необязательные исторические Journal references остаются после tombstone. При блокирующих связях доступен archive.

## Последовательность

1. Навигация, Directions catalog/detail и Today/Tomorrow с отдельным открытием Action.
2. Daily Direction с persistence/sync и безопасными old-record defaults.
3. Общий V2 menu и entity-specific archive/delete/reopen, затем Goal/Action Card.
4. SubActions через LifeAction, hierarchy guards во всех write/sync/recovery путях.
5. Count/recurrence UX и unscheduled rule; Goal recurring norm UX.
6. Goal period filters, membership management, legacy alias.
7. Targeted behavior tests каждого инварианта, ручная QA desktop/mobile, один `npm run verify`, один commit `feat: simplify LifeOS V2 daily workflow`; без E2E и push.

Не изменять Analytics, Evening, V1, crypto/protocol или пользовательские данные.
