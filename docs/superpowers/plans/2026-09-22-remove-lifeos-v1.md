# LifeOS V1 Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** оставить LifeOS V2 единственной запускаемой и собираемой версией приложения, удалить рабочий код V1 и сохранить данные, IndexedDB-совместимость, Supabase и синхронизацию.

**Architecture:** `App` продолжает создавать application через существующий provider, но `ApplicationShell` становится единственным V2 route host для `PlannerV2Workspace`. Composition root экспортирует только сервисы, которые потребляет V2, а persistence/sync сохраняют прежние stores и входные преобразования для уже существующих пользовательских данных. Удаляются старые UI-root, V1 routes и application wiring; compatibility-код данных остаётся только там, где его реально вызывает IndexedDB или sync.

**Tech Stack:** React 19, TypeScript strict, Vite, IndexedDB, Supabase sync, Vitest, Playwright. Новых зависимостей нет.

**Spec:** пользовательское ТЗ из attachment `9c874d98-49e8-4753-bd0f-0ab174f9d087/pasted-text.txt` и утверждённый V2-контракт `docs/design/features/2026-09-21-lifeos-v2-master.md`.

## Global Constraints

- Не менять дизайн, UX, модель «Сферы → Направления → Цели → Действия» или поведение V2.
- Не удалять object stores, записи IndexedDB, Supabase-данные, sync payload или compatibility migration автоматически.
- Не создавать переключатель V1/V2 и не оставлять прямой URL V1.
- Сохранить voice input, sleep schedule/alarm, Supabase auth, background sync и V2 mutation capture.
- Snapshot до удаления: commit `cf22184` (`chore: snapshot LifeOS V2 before V1 removal`).

## Review Focus

- `#/legacy/today`, пустой hash и неизвестный hash открывают V2 Today и не монтируют старый shell.
- Back/forward между V2 routes не возвращает старые `AppSection` или hashless history states.
- Существующие IndexedDB stores V1 не удаляются и не очищаются при открытии базы.
- V2 mutations продолжают попадать в sync outbox, а Supabase auth/lifecycle продолжают создаваться.
- V2 desktop/mobile, создание сущностей, обновление страницы и прямые V2 URL работают без console errors.

---

### Task 1: Единственный V2 route host

**Files:**

- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/presentation/navigation/ApplicationRoute.ts`
- Modify: `src/presentation/planner-v2/PlannerV2Workspace.tsx`
- Modify: `src/presentation/planner-v2/PlannerV2Navigation.ts`
- Test: `src/presentation/navigation/ApplicationRoute.test.ts`
- Test: `src/app/lifecycle/BrowserApplicationRouteSync.test.ts`
- Test: `src/presentation/planner-v2/PlannerV2Navigation.test.ts`

**Interfaces:**

- Consumes: `parsePlannerRoute(hash): PlannerRoute | null`, `buildPlannerRoute(route): string`.
- Produces: один non-null route state и `PlannerWorkspace` без `onExit`.

- [ ] **Step 1: Зафиксировать route-регрессии тестами**

  Проверить, что `#/legacy/today` не распознаётся как отдельный route, startup fallback равен `{ view: 'today' }`, а workspace markup не содержит «Старая версия» и `V2` как признак переключателя.

- [ ] **Step 2: Запустить targeted route tests и подтвердить исходный failure**

  Run: `npm run test:target -- src/presentation/navigation/ApplicationRoute.test.ts src/app/lifecycle/BrowserApplicationRouteSync.test.ts src/presentation/planner-v2/PlannerV2Navigation.test.ts`

- [ ] **Step 3: Свести shell к V2**

  Удалить `activeSection`, legacy route branch, V1 lazy imports, `TodayPage`/morning/evening/session wiring, `ApplicationShellView` и `onExit`. Сохранить `SyncStatusProvider`, route history, current date refresh и V2 services.

- [ ] **Step 4: Переименовать version-only symbols**

  `PlannerV2Workspace` → `PlannerWorkspace`, `PlannerV2Route` → `PlannerRoute`, `buildPlannerV2Route` → `buildPlannerRoute`, `parsePlannerV2Route` → `parsePlannerRoute`; URL aliases `#/v2/*` пока остаются как совместимые публичные V2 URL и не создают второй runtime.

- [ ] **Step 5: Запустить targeted tests до PASS**

  Run: `npm run test:target -- src/presentation/navigation/ApplicationRoute.test.ts src/app/lifecycle/BrowserApplicationRouteSync.test.ts src/presentation/planner-v2/PlannerV2Navigation.test.ts`

### Task 2: Убрать V1 из composition и runtime state

**Files:**

- Modify: `src/app/composition/LifeOsApplication.ts`
- Modify: `src/app/composition/createLifeOsApplication.ts`
- Modify: `src/app/createLifeOsApplicationForEnvironment.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/application/index.ts`
- Modify: `src/infrastructure/index.ts`
- Test: `src/app/composition/LifeOsV2Core.integration.test.ts`
- Test: `src/app/composition/createLifeOsApplication.test.ts`
- Test: `src/app/createLifeOsApplicationForEnvironment.test.ts`

**Interfaces:**

- Consumes: `PlannerServices`, `SyncApplication`, current date, `closeDatabase()`.
- Produces: минимальный `LifeOsApplication` без day lifecycle, decisions, sessions, routines, walks, morning/evening и V1 presentation stores.

- [ ] **Step 1: Добавить composition assertions**

  Проверить доступность всех сервисов `PlannerWorkspace`, sleep schedule и sync; проверить отсутствие startup seed и побочных вызовов V1-команд.

- [ ] **Step 2: Сократить application contract и constructors**

  Оставить current date, planner/balance/sleep services, CRUD сфер/направлений/целей/действий, sync и database close. Удалить создание V1 repositories/services из composition root; сохранить `LifeOsIndexedDb`, mutation recorder, migration/normalization и sync registry.

- [ ] **Step 3: Проверить composition**

  Run: `npm run test:target -- src/app/composition/LifeOsV2Core.integration.test.ts src/app/composition/createLifeOsApplication.test.ts src/app/createLifeOsApplicationForEnvironment.test.ts`

### Task 3: Удалить V1 presentation, application и тестовые fixtures

**Files:**

- Delete: старые V1 roots под `src/presentation/pages`, `src/presentation/layouts`, `src/presentation/management`, `src/presentation/goals`, `src/presentation/routine`, `src/presentation/walk`, `src/presentation/decision`, `src/presentation/session` после проверки отсутствия V2 imports.
- Delete: V1-only services/commands/queries и их tests под `src/application` после сужения composition root.
- Delete: V1-only domain/infrastructure adapters только если они не нужны IndexedDB/sync compatibility.
- Delete: V1-only E2E specs/fixtures и `src/test/fixtures/EveningE1E11LegacyFixtures.ts`.
- Modify: `src/presentation/styles/global.css`
- Modify: `src/domain/index.ts`

**Interfaces:**

- Consumes: фактический import graph после Tasks 1–2.
- Produces: source tree без импортируемой или компилируемой V1 UI/logic, при сохранённых records/mappers/schema/sync converters.

- [ ] **Step 1: Построить import reachability**

  От корней `src/main.tsx`, `src/app/composition/createLifeOsSyncApplication.ts` и актуальных tests отделить V2/runtime/data-compatibility от V1-only файлов. Любой спорный persistence/sync файл оставить и перечислить в отчёте.

- [ ] **Step 2: Удалить V1 UI и глобальные стили**

  Убрать старые страницы, shell/navigation CSS, morning/evening/walk/routine/management styles. Оставить tokens, planner CSS, voice controls и фактически используемые shared styles.

- [ ] **Step 3: Удалить недостижимые V1 logic/tests**

  Удалить старые day lifecycle, decision/session, morning/evening, routine, walk и journal runtime services только когда они не являются persistence/sync compatibility dependency. Не менять схему и не выполнять data migration.

- [ ] **Step 4: Проверить отсутствие следов двойного runtime**

  Run: `rg -n -i "#/legacy|openLegacy|Старая версия|useV2|isV2|version === 1" src tests`

- [ ] **Step 5: Выполнить быстрые проверки контрактов**

  Run: `npm run test:fast`

### Task 4: Документация и полная проверка

**Files:**

- Modify: `README.md`
- Modify: `docs/codex/PROJECT_MAP.md`
- Create: `docs/codex/2026-09-22-lifeos-v1-removal-report.md`
- Test: актуальные V2 E2E specs under `tests/e2e/v2.*.spec.ts`

**Interfaces:**

- Consumes: финальный source tree и git diff.
- Produces: актуальная карта единственной версии, data-retention report и проверяемый handoff.

- [ ] **Step 1: Описать итоговый runtime и data retention**

  Зафиксировать удалённые V1 roots, оставленные IndexedDB stores/legacy normalizers, отсутствие destructive Supabase migration и snapshot commit.

- [ ] **Step 2: Запустить полный обязательный gate**

  Изменяются routing, persistence composition и desktop/mobile flow, поэтому R9/R10: `npm run verify:full`.

- [ ] **Step 3: Проверить реальное приложение**

  Desktop и mobile: startup, навигация V2, создание/открытие сущностей, reload, direct URL, unknown/legacy URL fallback, console errors, sync lifecycle.

- [ ] **Step 4: Финальная Git hygiene**

  Run: `git diff --check`, `git diff --stat`, `git diff --name-status`, `git status --short`.

- [ ] **Step 5: Зафиксировать cleanup commit**

  Commit message: `refactor: remove LifeOS V1 runtime`.
