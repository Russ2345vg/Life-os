# Sleep Quick Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Рекомендуется один исполнитель в текущем чате и один итоговый read-only review.

**Goal:** Упростить запись ночи, поставить утреннее/вечернее действие первым и показать календарные пропуски.

**Architecture:** Расширить существующую application-службу командами быстрых черновиков. Переиспользовать schema v1, confirm/revise и текущие компоненты. Календарь и выбор вида — presentation read models; они не создают фактические данные.

**Tech Stack:** TypeScript, React 19, существующие CSS tokens, IndexedDB, Vitest и штатный Playwright runner; без новых зависимостей.

**Spec:** `docs/design/features/2026-10-10-sleep-quick-entry.md`

## Global Constraints

- Сохранить schema v1, существующий IndexedDB store и тип синхронизации.
- Не добавлять зависимости и не менять общий будильник, расписание и shell.
- Только явное «Сохранить ночь» подтверждает фактические времена.
- Называть интервал «время в постели»; не заявлять измерение сна или его качества.
- Версию приложения и release feed в этой задаче не менять.

## Review Focus

1. После полуночи и позднего подъёма отметки должны принадлежать одной ночи.
2. Повторный tap, alarm import и ручная запись не должны терять данные друг друга.
3. Ошибка сохранения не должна очищать ввод или ломать последующую команду.
4. Календарный пропуск не должен становиться нулём в средней длительности.
5. Автоматическая смена вида и выбор старой ночи не должны сбрасывать незавершённый ввод.

---

## Task 1: Быстрые отметки в существующей модели

**Files:**

- Modify: `src/domain/sleep/SleepObservation.ts`, ближайший `.test.ts`.
- Modify: `src/application/sleep/SleepObservationService.ts`, ближайший `.test.ts`.
- Consume: `NightTime.ts`, `SleepObservationRepository.ts`, текущий `Clock`.

**Interfaces:**

- Produce: `SleepObservationService.markBedtimeNow(): Promise<SleepObservation>`.
- Produce: `SleepObservationService.markWakeNow(): Promise<SleepObservation>`.
- Domain helper: `recordManualSleepDraft(previous: SleepObservation | null, input: ManualSleepDraftInput): SleepObservation`;
  input содержит стабильные id/cycleDate, nightCycleId, timezone, kind `BEDTIME | WAKE`, recordedAt и now.
- Существующие `confirm`, `revise`, `reconcileWakeResult` сохраняют публичные signatures.

- [x] RED: добавить domain/service tests, утверждающие `confirmedAt === null`, сохранение первого ручного timestamp,
      отсутствие перезаписи подтверждённой ночи; `bedtime-after-midnight`, `wake-after-planned-wake`,
      `wake-without-bedtime`, `old-draft-is-not-today`, `manual-wake-replaces-alarm-hint`.
- [x] Запустить `npm run test:target -- src/domain/sleep/SleepObservation.test.ts src/application/sleep/SleepObservationService.test.ts`;
      новые тесты должны упасть из-за отсутствующего поведения.
- [x] Реализовать helper и две команды по spec. Использовать сохранённую timezone существующей записи,
      стабильный id и NightTime для ночного cycleDate; подтверждение остаётся отдельной командой.
- [x] RED/GREEN для alarm merge: bed-only draft сохраняет bed и получает alarm candidate; ручной wake и confirmed
      защищены. Добавить controlled async tests: одновременные bed/wake/alarm/confirm сохраняют совместимые поля,
      failed write допускает retry. Сериализовать мутации единственного общего экземпляра службы.
- [x] Повторить targeted tests; выполнить `npm run test:fast` один раз после объединения изменений.

## Task 2: Календарные окна

**Files:**

- Modify: `src/presentation/planner-v2/sleep/sleepObservationChartModel.ts`.
- Modify: `SleepObservationChart.tsx`, `SleepObservationChart.test.tsx`, `sleep-observations.css` в той же папке.

**Interfaces:**

- Produce: `selectSleepChartDays(observations: readonly SleepObservation[], period: SleepChartPeriod, endCycleDate: string): readonly SleepChartDay[]`.
- `SleepChartDay` содержит cycleDate и observation/null; подтвердить completeness существующим domain predicate.
- Chart принимает `endCycleDate: string` и optional `onRecord: () => void`; plans остаётся существующим prop.

- [x] RED: 7/30 календарных строк, включая gaps и draft; конец/начало месяца; summary исключает неполные записи;
      выбранная старая ночь остаётся видна. Проверять пустое окно с двумя period controls и «Нет записи».
- [x] Запустить `npm run test:target -- src/presentation/planner-v2/sleep/SleepObservationChart.test.tsx` и подтвердить RED.
- [x] Реализовать единственную календарную read model и обновить Chart. Сохранить текстовые факт/план,
      доступное имя периода, настоящий loading/error и существующий mobile list.
- [x] Targeted tests должны PASS; старый тест последних N записей заменить проверкой календарного окна,
      сохранив guard, что draft не рисуется как подтверждённый факт.

## Task 3: Контекст экрана и сохранение ввода

**Files:**

- Create: `src/presentation/planner-v2/sleep/sleepPageMode.ts`, `.test.ts`.
- Create: `src/presentation/planner-v2/sleep/SleepQuickEntry.tsx`, `.test.tsx`.
- Modify: `src/presentation/planner-v2/SleepPreparationPage.tsx`.
- Modify: `src/presentation/planner-v2/sleep/SleepObservationForm.tsx`, ближайший test и CSS.
- Extend: `tests/e2e/current.sleep-recording.spec.ts`.

**Interfaces:**

- Produce: `resolveSleepPageMode(now: Date, settings: Pick<SleepSettings, 'bedtime' | 'wakeTime' | 'timeZone'>): 'MORNING' | 'EVENING'`.
- `SleepQuickEntry` consumes mode, target cycle date, observation/null, busy/error and an async onMark callback.
- Page owns ephemeral override `AUTO | MORNING | EVENING`, delegates all writes to Task 1 and refreshes history.

- [x] RED: mode around the awake midpoint and across midnight; the saved timezone determines local time;
      quick-entry renders date/label/busy/error/success. Confirm switch/refresh retains unsaved date and both times.
- [x] Run targeted tests for new models/components and existing Form/View before wiring commands.
- [x] Reuse current segmented control and button classes. Update observation clock within the same date without
      resetting dirty inputs. Reorder keyed sibling sections; preserve DOM keyboard order and component identity.
- [x] Wire mark commands; disable conflicting command while saving/dirty to prevent accidental field replacement,
      with clear text directing the user to save existing edits. On manual wake select the returned night and morning view.
- [x] Chart anchors to the selected past date or default completed local night. Use shared date helpers;
      render one manual form in both modes and preserve existing missed-night workflow.
- [x] Scoped E2E: evening bed → reload next morning → wake → no confirmed chart fact until Save;
      period gaps; manual mode switch with dirty fields; alarm hint and save failure/retry.
- [x] `npm run test:e2e -- tests/e2e/current.sleep-recording.spec.ts tests/e2e/current.sleep-preparation.spec.ts`:
      обе существующие browser projects должны PASS. Проверить keyboard focus, reduced motion, console/overflow;
      сохранить morning/evening screenshots и computed tokens для сравнения с baseline.

## Task 4: Итоговая проверка и передача

- [x] Один свежий read-only reviewer проверяет diff по spec: даты/черновики/конкуренция/пропуски/dirty inputs.
- [x] Исправить только подтверждённые findings и повторить затронутые проверки.
- [x] Запустить `npm run verify` один раз на финальном product diff; exit 0 обязателен. Не запускать полный E2E.
- [x] Проверить `git diff --check`, status, ссылки и правило №38; записать точные результаты в
      `docs/codex/reports/2026-10-10-sleep-quick-entry.md`. Различать mobile browser и физический Android.
- [x] Передать рабочий результат пользователю. Не устанавливать и не публиковать новую версию в этой задаче.

## Исходное состояние и self-review

Исходный HEAD: `ecd77b0af6639ce6ea79f0e6a60549aa47cfb180`, ветка `codex/batched-updates-20261010`.
Baseline route: `/#/v2/sleep`. Текущие morning desktop/mobile recording checks PASS;
preparation mobile PASS. Initial preparation desktop остановился на 15-second page.goto
до выполнения действий; точный отдельный повтор PASS без изменения лимитов/config.
Снимки сохранены в локальном `artifacts/sleep-quick-entry-baseline` вне Git.

Self-review: scope покрыт Tasks 1–3; каждый Review Focus имеет тест; старые confirm/revise,
alarm API, schema и sync type не меняются. План одобрен пользователем и реализован.
Итоговые доказательства и решения сохранены в
`docs/codex/reports/2026-10-10-sleep-quick-entry.md`.

Итог: scoped sleep E2E 28/28 PASS; final `verify` exit 0. Первый final gate остановился
на TS6133 после выделения history loader; неиспользуемый helper удалён, gate повторён
целиком успешно. Общие E2E, release и установка не запускались.
