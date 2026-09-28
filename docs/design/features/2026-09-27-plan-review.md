# Разбор плана дня

Пользователь согласовал улучшение страницы «Сегодня» для разбора перегруженного плана.
Используем существующие главное действие, query today и команды переноса, без новых режимов.

```text
FEATURE → новая функция существующей страницы Сегодня
USER GOAL → осознанно решить, что оставить в плане и что перенести
EXISTING LOGIC → GetPlannerToday, SetLifeActionPlan, rescheduleCount, PlannerOverdueActions
PAGE/COMPONENT ARCHETYPE → существующий рабочий список и раскрываемый details
SECTION COLOR → graphite/jade текущей темы, gold только предметного приоритета
MAIN VISUAL CENTER → сохранённое главное действие; разбор вторичен
COMPONENTS TO REUSE → planner details, action row, overdue date controls
MOBILE BEHAVIOR → одна колонка; controls переносятся, touch targets 44px
APPROVED REFERENCE → отдельный макет не требуется: действующие компоненты и архетип
TEST SCOPE → selector/render, scoped overdue desktop/mobile, npm run verify
```

Browser baseline: текущая страница `#/v2/today` активного worktree на localhost:5181;
пустой план, актуальная graphite/jade оболочка. Каскад и shared components изучены в предыдущем
обновлении и используются без смены визуального языка. Мотив — спокойная рабочая поверхность.

## Поведение

- Если есть просроченные или повторно перенесённые вторичные дела сегодняшнего плана,
  после основного списка появляется «Разобрать план» с фактическим числом дел.
- Разбор раскрыт по умолчанию. Его можно свернуть вручную.
- Повторные переносы — `rescheduleCount >= 2` у ready/in-progress действий сегодняшнего
  вторичного списка. Главное исключено: оно уже выбрано. Просроченные не дублируются между
  группами. Future/completed/cancelled не входят в разбор.
- Счётчик хранится в существующей модели и учитывает переносы подготовленных действий.
  Изменения дат черновиков он не учитывает; это ограничение явно показано рядом с данными.
- Перенос на сегодня/конкретную дату и снятие draft с плана переиспользуют прежние controls.
  Ready нельзя снять с даты, in-progress не перепланируется — сохраняем domain-контракт.
- «Оставить на сегодня» подтверждает решение до выхода со страницы. Дата и счётчик не меняются; после перезагрузки пункт снова доступен для разбора.
- Перенос не заменяет выбранное главное; снятие с плана не удаляет действие.
- Loading/ошибки остаются под управлением workspace и inline controls. Busy блокирует
  дубликаты; retry сохраняет выбранную дату. После решения восстанавливается keyboard focus.
- Пустой разбор не занимает место. Нет автоматической оценки нагрузки, сроков выполнения
  или количества переносов черновиков по отсутствующим данным.

## Проверка

Targeted модель и render: 7 тестов прошли. Scoped `current.overdue.spec.ts`: 6 сценариев прошли на desktop/mobile после финальной перестановки блока. `npm run verify` прошёл: typecheck, lint (0 ошибок, существующее предупреждение fixtures/voice-input.tsx), 1539 unit/integration, 55 infra, 1 alpha, build, format и Git hygiene. Один предсуществующий тест пропущен.

Visual review по Правилу №38: главное выше вторичного разбора; текущие палитра, gold приоритета, shared controls и spacing сохранены. Проверены empty/disabled/error/retry, снимки реального UI на 1440px и 390px, отсутствие overflow, keyboard focus и touch targets. Снимки находятся в test-results/current.overdue-plan-revie-f1169-osen-main-when-rescheduling-{desktop,mobile}-chrome/plan-review-initial.png.

Полный E2E не требуется: общие routing/storage не меняются, команды планирования сохраняются.
