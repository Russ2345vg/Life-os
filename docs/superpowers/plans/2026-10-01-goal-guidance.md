# От фокуса к действию Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Главный агент — единственный исполнитель записи; независимые агенты исследуют и проверяют read-only по AGENTS.md.

**Goal:** Из «Сегодня» помочь выбрать действие своей цели и явно добавить его на текущий день.

**Architecture:** Чистая application-проекция существующего `PlanningState`, стандартная форма
в `PlannerSheet`, wiring существующего изменения даты и открытия карточки. Единственное
расширение mutation-контракта — необязательная проверка показанной версии в `changeDate`.

**Tech Stack:** Текущие TypeScript, React, IndexedDB, Vitest и Playwright; без новых зависимостей.

**Spec:** [Дизайн и критерии](../../design/features/2026-10-01-goal-guidance.md).

Статус: реализация выполнена; фактические проверки и ограничения — в
[отчёте](../../architecture/2026-10-01-goal-guidance-verification.md).

## Global Constraints

- Дата берётся из текущего `DayDate` приложения; UTC-дата браузера не подставляется.
- Цель фокуса: `PlanningPeriod.primaryGoalId` + валидный `PeriodMembership.focused` текущей недели.
- Следующий шаг: только валидный `Goal.nextActionId`; сортировка и `LifeAction.isNext` не заменяют его.
- Локальный выбор не меняет недельный фокус, `Goal.nextActionId` и главное дело сегодняшнего дня.
- Единственная mutation существующего действия — явная смена даты с receipt для отмены.
- При stale/error и несовпавшей версии перенос запрещён. Commit и последующий refresh различаются.
- PlannerSheet и действующие формы/токены переиспользуются; новых stores, route помощника и провайдеров нет.
- Предсуществующие dirty-файлы сохраняются. Commit, push, установщик и релиз не входят в план.

## Review Focus

1. Смена дня во время открытой панели: кнопка не переносит на вчерашнюю дату (задачи 1, 3).
2. Действие изменилось между показом и нажатием: версия отвергается внутри application-команды (задача 2).
3. Запись успешна, чтение после неё упало: retry не повторяет mutation и не теряет undo receipt (задача 3).
4. Явный выбор отличается от нового фокуса после refresh: выбор не перепрыгивает молча (задачи 1, 3).
5. Панель закрыли/сменили route во время запроса: поздний ответ не открывает её и не крадёт focus (задача 3).

## Карта файлов и ответственность

| Файл                                                                | Изменение                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/application/queries/GetTodayGoalGuidance.ts`                   | Новая чистая проекция кандидатов и основания выбора.                              |
| `src/application/queries/GetTodayGoalGuidance.test.ts`              | Поведение проекции без UI/storage.                                                |
| `src/application/commands/SetLifeActionPlan.ts`                     | Optional expectedVersion только для changeDate.                                   |
| `src/application/commands/SetLifeActionPlan.test.ts`                | Проверка версии до записи; старые вызовы.                                         |
| `src/presentation/planner-v2/PlannerGoalGuidance.tsx`               | Стандартная панель выбора с loading/error/empty/busy.                             |
| `src/presentation/planner-v2/PlannerGoalGuidance.test.tsx`          | Render и семантика вариантов интерфейса.                                          |
| `src/presentation/planner-v2/PlannerToday.tsx`                      | Вход «Выбрать шаг к цели» только для Today.                                       |
| `src/presentation/planner-v2/PlannerWorkspace.tsx`                  | Состояние панели, снимок PlanningContext, callbacks и обновление после commit.    |
| `src/presentation/planner-v2/usePlanningState.ts`                   | Поле refreshing в существующем контексте, связанное с актуальным чтением/session. |
| `src/presentation/planner-v2/plannerGoalGuidanceOperations.ts`      | Локальная последовательность commit → оба refresh с различимым результатом.       |
| `src/presentation/planner-v2/plannerGoalGuidanceOperations.test.ts` | Ошибки записи/чтения, частичный успех и повтор только чтения.                     |
| `src/presentation/planner-v2/planner-goal-guidance.css`             | Только локальная раскладка на существующих tokens; импорт из компонента.          |
| `tests/e2e/current.goal-guidance.spec.ts`                           | Полный затронутый flow на synthetic data, desktop/mobile.                         |
| `docs/design/references/2026-10-01-goal-guidance/`                  | Baseline уже снят; далее — after-снимки и метрики.                                |
| `docs/architecture/2026-10-01-goal-guidance-verification.md`        | Фактические проверки, findings, ограничения.                                      |

`PlannerSheet`, `PlannerActionForm`, `PlannerActionPanel`, дата/undo и
`finishPlannerSubmission` сначала использовать как есть. Локальное уточнение их контракта
допускается только при подтверждённом препятствии, без общего рефакторинга.

## Задача 1. Построить объяснимый выбор по существующим данным

**Interfaces:** `buildTodayGoalGuidance(state: PlanningState, today: string,
selection?: TodayGoalGuidanceSelection): TodayGoalGuidance`.
`TodayGoalGuidanceSelection` содержит независимые optional readonly `goal`/`action`: отсутствие
поля означает «ещё не инициализировано, можно вычислить default»; `null` — явно очищено;
`{ id: string; origin: 'default' | 'user' }` — закреплённое значение с происхождением.
При выборе другой цели action становится отсутствующим, чтобы вычислить next этой новой цели.
Явный сброс action до null запрещает его автозаполнение.
Результат: union состояний `empty`, `choose-goal`, `choose-action`, `ready`, `selection-unavailable`;
в каждом есть необходимые варианты выбора, в `ready` — goalId, actionId, actionVersion,
названия и whyImportant, reason (`weekly-primary`, `user-choice`, `source-changed`) цели,
основание действия (`goal-next-action`, `user-choice`, `source-changed`), plannedDate,
estimateMinutes, `mainOnPreviousDate: boolean` и действие CTA
(`add-today`, `move-today`, `open-action`). Default IDs
не получают reason=user-choice после фиксации в UI. Текст UI остаётся в Presentation.

- [ ] Написать failing tests: явные primary/next выбираются; без primary нет произвольной цели;
      без next нет произвольного шага; поддерживающий фокус не становится главным; удалённые,
      неактивные цели и закрытые/чужие действия исключены; inProgress только открывается;
      сегодняшняя дата не вызывает move; смена недели/дня пересчитывает основания;
      явный валидный выбор сохраняется, невалидный возвращает `selection-unavailable`;
      закреплённый default при смене фокуса получает source-changed, а не user-choice;
      явно очищенное поле не заполняется само.
- [ ] Выполнить `npm run test:target -- src/application/queries/GetTodayGoalGuidance.test.ts`.
      Проверить, что failures вызваны отсутствующим новым поведением.
- [ ] Реализовать чистую проекцию. Default применять при отсутствии локального выбора;
      список активных целей группировать по membership, стабилизировать title/id.
      Не использовать fallback `selectGoalCardActions().next`: он включает `isNext` другого смысла.
- [ ] Повторить targeted-команду; проверить PASS. Сопоставить правила допустимости действия
      с `GetWeeklyGoalReview` и текущими domain-инвариантами без копирования бизнес-мутаций в React.

## Задача 2. Защитить перенос от устаревшего выбора

**Interfaces:** расширить вход `SetLifeActionPlan.changeDate` пересечением
`{ readonly expectedVersion?: number }`. Несовпадение возвращает `Result` failure с
`life_action.version_conflict` и текстом «Действие изменилось. Обновите список и выберите шаг снова».
Проверять непосредственно после загрузки действия, до `applyPlan`; receipt/result не меняются.

- [ ] Добавить failing tests: несовпавшая версия не вызывает commit; совпавшая переносит;
      отсутствие expectedVersion сохраняет старое поведение; уже выполненное действие не переносится;
      новое главное действие сегодняшнего дня остаётся главным; перенос главного с прежней даты
      снимает прежнюю главность и undo её восстанавливает; повтор со старой версией не пишет снова.
- [ ] Выполнить `npm run test:target -- src/application/commands/SetLifeActionPlan.test.ts`.
- [ ] Добавить optional validation; существующая версия optimistic commit остаётся проверкой
      гонки после чтения. Не заменять её проверкой только в UI.
- [ ] Повторить targeted и
      `npm run test:target -- src/infrastructure/persistence/LifeActionDateUndo.test.ts`.

## Задача 3. Встроить выбор шага в Сегодня

**Interfaces:** `PlannerGoalGuidance` принимает результат query, состояние загрузки/ошибки,
busy, callbacks `onSelectionChange(selection)`, `onPlan({actionId, expectedVersion, date})`,
`onOpenAction(id)`, `onOpenGoal(id)`, `onCreateAction(goalId, title)`, `onCreateGoal()`,
`onRetry()`, `onClose()`. Пропы readonly, без `any`. Ownership выбранных ID и lifetime — Workspace.

Локальный `planGoalGuidanceStep(work, refresh): Promise<GoalGuidancePlanOutcome>` в
`plannerGoalGuidanceOperations.ts`: work возвращает committed actionId/date после регистрации
receipt и закрытия исходной Sheet; состояние успеха/ошибки чтения и retry принадлежат Workspace,
а не закрытой панели. Refresh ожидает оба чтения и отклоняется при failed/superseded без подтверждённого
актуального снимка. Outcome — `{ status: 'not-committed'; message: string }` либо
`{ status: 'committed'; actionId: string; date: string; refresh: 'ready' | 'failed';
message?: string }`. Повтор чтения использует тот же refresh без work.

- [ ] Добавить render tests для точных CTA/пояснений из specification и отсутствия ложного
      primary при empty/stale; начать scoped E2E для открытия/добавления и сохранности главного дела.
- [ ] Добавить unit tests локальной операции: work failure не вызывает refresh; receipt
      зарегистрирован до refresh; failed refresh возвращает committed; retry чтения не вызывает work.
- [ ] Выполнить targeted render test и минимальный новый E2E; зафиксировать ожидаемый FAIL.
- [ ] Добавить доступ рядом с «Рабочее время» в header Today, стандартную `PlannerSheet` и
      последовательные поля цели/действия. Следовать loading/empty/error/success из specification.
      Open/close и локальные selectors не назначают фокус, следующий шаг или даты существующих
      действий. Штатное обновление PlanningContext сохраняет materialization/legacy import.
- [ ] Подключить текущий PlanningContext; добавить readonly `refreshing: boolean` в
      `PlanningContextValue`. Pending привязать к session/latest запросу; устаревшее завершение
      не снимает блокировку нового чтения. Scoped browser-тест с двумя отложенными чтениями
      проверяет именно этот порядок. Перед открытием запросить актуальное чтение; при pending/error
      запретить mutation. После первого успеха сохранить default IDs с origin=default,
      пользовательские selectors меняют origin=user; сброс не выбирает первый элемент автоматически.
- [ ] Расширить внутренний `changeDate(id, date, expectedVersion?)` в Workspace для передачи
      optional policy и общего undo receipt. Новый submit использует локальный typed outcome;
      не вызывать общий `run`, который объединяет work/load и проглатывает ошибки.
      После commit через `Promise.allSettled` дождаться `load({refreshPlanning:false})` и
      `planningContext.refreshWithOutcome()` с проверкой статуса. `load()` сейчас возвращает void
      и не бросает при superseded: перед refresh=ready дополнительно проверить захваченную
      route/day generation; fulfilled сам по себе недостаточен. При read failure повторяется
      только эта пара чтений, mutation и receipt не повторяются.
- [ ] «Создать действие» направить через guard-aware `navigate` на существующий `new-action`
      с goalId/date/tекстом nextProgress, без флагов returnToGoal/returnToGoals. Текущий submit
      уже возвращает в Today. Открытие карточки использует `openActionFromSource` и текущую панель.
- [ ] На смене route/day закрывать помощник; late response не меняет новый экран. При
      обновлении снимка невалидный выбор требует нового подтверждения. Сохранять фокус/scroll
      по действующему `PlannerSheet`, не открывать две модальные панели одновременно.
- [ ] Пройти targeted render tests, `PlannerToday.test.tsx` и
      `npm run test:target -- src/presentation/planner-v2/plannerGoalGuidanceOperations.test.ts`, затем
      `npm run test:e2e -- tests/e2e/current.goal-guidance.spec.ts` на обоих проектах.

## Задача 4. Проверить сценарии и UX

- [ ] Дополнить scoped E2E сценариями: отсутствие primary/next; смена цели; создание и отмена;
      действие уже на сегодня; будущая дата и undo; completion/version race; stale read;
      commit success + refresh failure; double click; смена route при pending; reload результата.
      Проверять наблюдаемые записи/текст/даты, не внутренние реализации React.
- [ ] Проверить, что чётко разделены «шаг на сегодня», «следующий шаг цели» и «главное дело дня»;
      query не пишет ни одно из этих состояний самостоятельно.
- [ ] Снять и просмотреть before/after на 1440×900, 1280×720, 390×844 и 320 px:
      вход, открытая панель с длинным текстом, empty, error, busy и success в плане.
- [ ] Проверить Tab/Shift+Tab, focus при открытии/закрытии, Escape, screen bounds,
      safe area, reduced motion, contrast и Правило №38; отдельно console/page errors.
- [ ] Провести экспертные задания из specification, зафиксировать число нажатий и проблемы.
      Отдельно предложить пользователю пройти задания без подсказки; если проход не состоялся,
      отметить его отсутствие и не выдавать экспертный audit за user testing.

## Задача 5. Gate и передача результата

- [ ] По изменению application-контракта выполнить `npm run test:fast`.
- [ ] Пройти соседние scoped сценарии:
      `npm run test:e2e -- tests/e2e/current.weekly-review.spec.ts tests/e2e/current.date-undo.spec.ts`.
- [ ] После стабилизации выполнить один `npm run verify`. Новый read model, UI и policy
      проверяются targeted/scoped; полный E2E не требуется при сохранении этих границ.
- [ ] Учесть известную ошибку предсуществующего `CompleteLifeAction.integration.test.ts`
      (`idle` вместо `offline`) из предыдущего handoff. Если повторится — отдельно сообщить,
      не исправлять completion/sync вне scope и не объявлять общий gate зелёным.
- [ ] Получить независимый read-only review значимого UI/application патча. Главный агент
      исправляет только findings текущего scope и повторяет затронутые проверки.
- [ ] Записать проверенные сценарии, снимки и реальные ограничения в verification report;
      проверить `git diff --check`, свой diff и `git status --short`.

## Проверка самого плана

Каждый критерий specification сопоставлен задачам 1–5. Этап планирования проверяется форматом,
ссылками и фактическим baseline; запуск verify/E2E для самих Markdown не нужен.
Исходные снимки не являются доказательством работоспособности ещё не реализованного помощника.
