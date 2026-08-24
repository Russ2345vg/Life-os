# Альбом целей A1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать отдельный рабочий раздел «Альбом целей» с hash-маршрутами, реальными Goals, фильтрацией, группировкой по существующим Sphere/Direction, production-ready GoalCard, всеми состояниями страницы и адаптивной визуальной приёмкой A1.

**Architecture:** `ApplicationShell` расширяет существующую hash-навигацию новым `goals` AppSection и лениво загружает feature-модуль. Feature одним параллельным снимком читает `GetGoals`, `GetDirections` и `GetSpheres`, затем чистый presentation-mapper строит счётчики, карточки и группы; React хранит только load/filter/view/route state. Domain, application-команды и persistence Goal не изменяются.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, IndexedDB/fake-indexeddb, Vite 8, существующие CSS tokens LifeOS и встроенный браузер Codex.

**Spec:** `docs/superpowers/specs/2026-08-23-goal-album-design.md`

**Visual reference A1:** `C:\Users\Руслан\AppData\Local\Temp\codex-clipboard-b88e382d-9f5e-437c-ba99-2a6485f67bdc.png` (утверждённое изображение из текущей задачи).

## Global Constraints

- Работать только внутри `C:\LifeOS-App` и сохранять все существующие незакоммиченные изменения пользователя.
- Считать текущие изменения Goal domain/application/persistence техническим фундаментом и не редактировать их без доказанной необходимости.
- Соблюдать поток `UI → Presentation / Read Model → Application Query → Domain → Repository`; React не обращается к repository и не изменяет Goal.
- Не использовать `any`, не добавлять зависимости, не создавать commit/push/merge/rebase.
- Не реализовывать A2/A3, редактирование Goal, Projects, Decisions, Today, Finance, AI и другие следующие этапы.
- `Все` и KPI `Всего целей` исключают `archived`; архив показывается отдельным фильтром.
- Использовать только реальные `GoalStatus`, `GoalStage`, `GoalHorizon`, `GoalProgress`, Direction и Sphere; не создавать UI-копии доменных классификаций.
- Тестовые файлы именовать `*.test.ts`, потому что текущий Vitest include не запускает `*.test.tsx`.
- Не добавлять демонстрационные Goals или reference-изображения A1 в production-код; временные QA-записи допустимы только в изолированном браузерном IndexedDB и удаляются после проверки.
- Перед завершением выполнить полный quality gate и browser QA на всех размерах из спецификации; после A1 остановиться.

## File Map

### Создать

- `src/presentation/goals/GoalAlbumNavigation.ts` — строгие parse/build контракты `#/goals`, detail и create-placeholder routes.
- `src/presentation/goals/GoalAlbumNavigation.test.ts` — route contract.
- `src/presentation/navigation/ApplicationRoute.ts` — единый resolver существующего Routine route и нового Goal route.
- `src/presentation/navigation/ApplicationRoute.test.ts` — direct URL и regression для Routine routing.
- `src/presentation/goals/GoalAlbumLoader.ts` — один параллельный снимок трёх application queries с `load/refresh`.
- `src/presentation/goals/GoalAlbumLoader.test.ts` — concurrency/cache/retry-query contract.
- `src/presentation/goals/goalAlbumPresentation.ts` — чистые view models, labels, filters, progress mapping и grouping.
- `src/presentation/goals/goalAlbumPresentation.test.ts` — счётчики, фильтры, карточки, progress, группировка и non-mutation.
- `src/presentation/goals/GoalCard.tsx` — кликабельная карточка с реальным `href` detail-route.
- `src/presentation/goals/GoalAlbumPage.tsx` — async controller и четыре состояния A1, grid/grouped content, detail/create placeholders.
- `src/presentation/goals/GoalAlbumPage.test.ts` — SSR behavioral contract страницы и GoalCard.
- `src/app/lifecycle/BrowserApplicationRouteSync.ts` — тестируемая подписка shell на `popstate`/`hashchange` без второго router.
- `src/app/lifecycle/BrowserApplicationRouteSync.test.ts` — runtime-контракт direct/back/forward restoration и cleanup listeners.
- `src/app/ApplicationShellRouting.test.ts` — source-level regression фактического подключения unified route state к shell.
- `src/presentation/styles/goal-album.css` — полностью scoped A1 styles и responsive rules.
- `src/presentation/goals/GoalAlbumLayout.test.ts` — CSS/responsive/accessibility contract.

### Изменить

- `src/presentation/navigation/AppSection.ts:1-45` и `AppSection.test.ts:1-20` — новый top-level section и menu/default option.
- `src/presentation/components/AppIcon.tsx:3-136` — типобезопасная иконка `goals` в существующей icon system.
- `src/presentation/layouts/ApplicationShellView.tsx:26-45,268-382` и `ApplicationShellView.test.ts:31-176` — desktop/sidebar/mobile-menu entry и active state.
- `src/presentation/pages/SectionPages.test.ts:225-240` — `goals` в настройке стартового раздела.
- `src/app/ApplicationShell.tsx:44-174,213-227,412-590` — initial/hash route, history navigation, lazy page и query wiring.
- `src/app/ApplicationShellPerformance.test.ts:11-25` — `GoalAlbumPage` остаётся lazy-loaded.

---

### Task 1: Единый route contract и shell-навигация

**Законченный результат:** `#/goals`, `#/goals/:goalId` и `#/goals/new` имеют строгий parse/build contract и распознаются единым application-route resolver; «Альбом целей» доступен в desktop/sidebar и mobile overlay с active/collapsed/default-section behavior. Подключение готового page boundary к `ApplicationShell` выполняется в Task 3, когда модуль страницы уже существует.

**Files:**

- Create: `src/presentation/goals/GoalAlbumNavigation.ts`
- Create: `src/presentation/goals/GoalAlbumNavigation.test.ts`
- Create: `src/presentation/navigation/ApplicationRoute.ts`
- Create: `src/presentation/navigation/ApplicationRoute.test.ts`
- Modify: `src/presentation/navigation/AppSection.ts`
- Modify: `src/presentation/navigation/AppSection.test.ts`
- Modify: `src/presentation/components/AppIcon.tsx`
- Modify: `src/presentation/layouts/ApplicationShellView.tsx`
- Modify: `src/presentation/layouts/ApplicationShellView.test.ts`
- Modify: `src/presentation/pages/SectionPages.test.ts`

**Interfaces:**

```ts
export type GoalAlbumRoute =
  | { readonly view: 'album' }
  | { readonly view: 'create' }
  | { readonly view: 'detail'; readonly goalId: string };

export function parseGoalAlbumRoute(hash: string): GoalAlbumRoute | null;
export function buildGoalAlbumRoute(route: GoalAlbumRoute): string;

export type RoutedApplicationSection =
  | {
      readonly section: typeof APP_SECTION.goals;
      readonly route: GoalAlbumRoute;
    }
  | {
      readonly section: typeof APP_SECTION.routine;
      readonly route: RoutineRoute;
    };

export function parseApplicationRoute(hash: string): RoutedApplicationSection | null;
export function resolveInitialApplicationSection(
  route: RoutedApplicationSection | null,
  defaultSection: AppSection,
): AppSection;
```

- [ ] **Step 1: Добавить RED-тесты полного navigation contract**

`GoalAlbumNavigation.test.ts` фиксирует reserved `new`, URL encoding и строгий reject лишних сегментов. `ApplicationRoute.test.ts` подтверждает, что новый route и прежний Routine route проходят через один resolver.

```ts
expect(parseGoalAlbumRoute('#/goals')).toEqual({ view: 'album' });
expect(parseGoalAlbumRoute('#/goals/new')).toEqual({ view: 'create' });
expect(parseGoalAlbumRoute('#/goals/goal%20one')).toEqual({
  view: 'detail',
  goalId: 'goal one',
});
expect(buildGoalAlbumRoute({ view: 'detail', goalId: 'goal one' })).toBe('#/goals/goal%20one');
expect(parseGoalAlbumRoute('#/goals/')).toBeNull();
expect(parseGoalAlbumRoute('#/goals/one/two')).toBeNull();

expect(parseApplicationRoute('#/goals/goal-1')).toEqual({
  section: APP_SECTION.goals,
  route: { view: 'detail', goalId: 'goal-1' },
});
expect(parseApplicationRoute('#/routine/evening?date=2026-08-23')).toMatchObject({
  section: APP_SECTION.routine,
  route: { section: ROUTINE_SECTION.evening },
});
expect(
  resolveInitialApplicationSection(
    { section: APP_SECTION.goals, route: { view: 'album' } },
    APP_SECTION.today,
  ),
).toBe(APP_SECTION.goals);
```

Расширить существующие shell tests: `APP_SECTION_MENU_OPTIONS` содержит `goals`, desktop/sidebar и `ApplicationMobileMenu` содержат «Альбом целей», active section получает `aria-current="page"`, collapsed sidebar — `data-tooltip="Альбом целей"`, settings — `<option value="goals">Альбом целей</option>`. Нижняя fixed mobile navigation остаётся из пяти текущих ячеек и не получает отдельную кнопку Goals.

- [ ] **Step 2: Запустить RED**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumNavigation.test.ts src/presentation/navigation/ApplicationRoute.test.ts src/presentation/navigation/AppSection.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/presentation/pages/SectionPages.test.ts
```

Expected: FAIL — отсутствуют Goal route modules, `APP_SECTION.goals` и sidebar entry.

- [ ] **Step 3: Реализовать route modules и существующие menu contracts**

`parseGoalAlbumRoute` сначала обрабатывает точные `#/goals` и `#/goals/new`, затем один detail segment через `decodeURIComponent` с `try/catch`; пустой decoded id отклоняется. `buildGoalAlbumRoute` использует exhaustive switch и `encodeURIComponent`.

`ApplicationRoute` вызывает `parseGoalAlbumRoute`, затем существующий `parseRoutineRoute`; неизвестный hash возвращает `null`. `resolveInitialApplicationSection` отдаёт routed section либо существующий `resolveMenuEntrySection(defaultSection)`.

Добавить `goals: 'goals'`, подпись «Альбом целей» и menu option после «Сферы», перед «История». Расширить `AppIconName` и существующий `iconPath` спокойной target/bookmark-иконкой. В той же позиции включить Goals только в `DESKTOP_NAVIGATION`: этот массив уже используется desktop sidebar и mobile overlay. `MOBILE_NAVIGATION` fixed bar не менять.

- [ ] **Step 4: Запустить GREEN и соседний routing regression**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumNavigation.test.ts src/presentation/navigation/ApplicationRoute.test.ts src/presentation/routine/RoutineNavigation.test.ts src/presentation/navigation/AppSection.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/presentation/layouts/applicationShellNavigation.test.ts src/presentation/pages/SectionPages.test.ts
```

Expected: PASS; Routine routes, current sidebar entries, default settings and lazy loading remain intact.

---

### Task 2: Один query snapshot и чистая presentation-модель альбома

**Законченный результат:** три существующих application queries запускаются ровно один раз на load/refresh, а полностью типизированный presentation-модуль выдаёт реальные KPI, карточки, фильтры и Sphere → Direction groups без React-бизнес-логики и N+1.

**Files:**

- Create: `src/presentation/goals/GoalAlbumLoader.ts`
- Create: `src/presentation/goals/GoalAlbumLoader.test.ts`
- Create: `src/presentation/goals/goalAlbumPresentation.ts`
- Create: `src/presentation/goals/goalAlbumPresentation.test.ts`

**Interfaces:**

```ts
export interface GoalAlbumSource {
  readonly goals: readonly Goal[];
  readonly directions: readonly Direction[];
  readonly spheres: SpheresSnapshot;
}

export interface GoalAlbumQueries {
  readonly getGoals: Pick<GetGoals, 'execute'>;
  readonly getDirections: Pick<GetDirections, 'execute'>;
  readonly getSpheres: Pick<GetSpheres, 'execute'>;
}

export interface GoalAlbumLoader {
  load(): Promise<GoalAlbumSource>;
  refresh(): Promise<GoalAlbumSource>;
}

export type GoalAlbumFilter = 'all' | GoalStatus;
export type GoalAlbumViewMode = 'grid' | 'by-direction';

export interface GoalAlbumCounts {
  readonly active: number;
  readonly future: number;
  readonly achieved: number;
  readonly total: number;
}

export type GoalAlbumProgressView =
  | { readonly kind: 'none'; readonly label: 'Прогресс не задан' }
  | {
      readonly kind: 'metric';
      readonly label: string;
      readonly percent: number;
      readonly current: number;
      readonly target: number;
      readonly unit: string;
    }
  | {
      readonly kind: 'milestones';
      readonly label: string;
      readonly percent: number;
      readonly completed: number;
      readonly total: number;
    }
  | {
      readonly kind: 'qualitative';
      readonly label: 'Начало' | 'В движении' | 'Близко' | 'Готово';
    };

export type GoalCardDirectionView =
  | {
      readonly kind: 'assigned';
      readonly id: string;
      readonly name: string;
      readonly sphere: { readonly id: string; readonly name: string } | null;
    }
  | { readonly kind: 'unassigned'; readonly label: 'Без направления' }
  | { readonly kind: 'missing'; readonly label: 'Направление недоступно' };

export interface GoalCardViewModel {
  readonly id: string;
  readonly title: string;
  readonly coverImageUrl: string | null;
  readonly direction: GoalCardDirectionView;
  readonly status: GoalStatus;
  readonly statusLabel: string;
  readonly stageLabel: string;
  readonly horizonLabel: string;
  readonly progress: GoalAlbumProgressView;
  readonly nextProgress: string;
  readonly updatedAtMs: number;
}

export interface GoalAlbumModel {
  readonly counts: GoalAlbumCounts;
  readonly cards: readonly GoalCardViewModel[];
}

export interface GoalAlbumDirectionGroup {
  readonly id: string;
  readonly name: string;
  readonly goals: readonly GoalCardViewModel[];
}

export interface GoalAlbumSphereGroup {
  readonly id: string;
  readonly name: string;
  readonly directions: readonly GoalAlbumDirectionGroup[];
}

export interface GoalAlbumGroups {
  readonly spheres: readonly GoalAlbumSphereGroup[];
  readonly withoutSphere: readonly GoalAlbumDirectionGroup[];
  readonly withoutDirection: readonly GoalCardViewModel[];
  readonly missingDirection: readonly GoalCardViewModel[];
}

export function createGoalAlbumLoader(queries: GoalAlbumQueries): GoalAlbumLoader;
export function buildGoalAlbumModel(source: GoalAlbumSource): GoalAlbumModel;
export function selectGoalAlbumCards(
  cards: readonly GoalCardViewModel[],
  filter: GoalAlbumFilter,
): readonly GoalCardViewModel[];
export function groupGoalAlbumCards(cards: readonly GoalCardViewModel[]): GoalAlbumGroups;
```

- [ ] **Step 1: Добавить RED-тесты loader, counts, filters, progress и grouping**

Loader test использует три deferred query и подтверждает, что все `execute()` вызваны до разрешения любого promise; второй `load()` в том же экземпляре использует тот же snapshot, `refresh()` запускает ровно три новых запроса. Cache остаётся локальным для loader экземпляра страницы и не превращается в глобальный/stale read model.

Presentation tests создают реальные `Goal`, `Direction` и `Sphere`. Обязательные assertions:

```ts
expect(model.counts).toEqual({ active: 1, future: 2, achieved: 1, total: 4 });
expect(selectGoalAlbumCards(model.cards, 'all')).toHaveLength(4);
expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.archived)).toHaveLength(1);
expect(selectGoalAlbumCards(model.cards, GOAL_STATUS.active)).toEqual(
  expect.arrayContaining([expect.objectContaining({ status: GOAL_STATUS.active })]),
);
```

`total` и `all` исключают archived. Фильтрация использует `status`, а не `stage`.

Покрыть progress:

```ts
expect(metric.progress).toMatchObject({
  kind: 'metric',
  current: 125,
  target: 100,
  unit: '%',
  percent: 100,
});
expect(milestones.progress).toMatchObject({
  kind: 'milestones',
  completed: 3,
  total: 6,
  percent: 50,
});
expect(qualitative.progress).toEqual({ kind: 'qualitative', label: 'В движении' });
expect(noProgress.progress).toEqual({ kind: 'none', label: 'Прогресс не задан' });
```

Покрыть реальные Direction/Sphere из полного query snapshot, Direction без Sphere, `directionId: null`, dangling non-null Direction, русскую сортировку групп, updated-desc карточки и неизменность исходных массивов. Не вводить отдельной historical-семантики для архивных Direction/Sphere.

- [ ] **Step 2: Запустить RED**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumLoader.test.ts src/presentation/goals/goalAlbumPresentation.test.ts
```

Expected: FAIL — loader и presentation module отсутствуют.

- [ ] **Step 3: Реализовать минимальный loader и mapper**

Loader повторяет проверенный project-reference pattern:

```ts
const request = Promise.all([
  queries.getGoals.execute(),
  queries.getDirections.execute(),
  queries.getSpheres.execute(),
]).then(([goals, directions, spheres]) => ({ goals, directions, spheres }));
```

`load()` кэширует in-flight/resolved snapshot, `refresh()` заменяет cache новым `Promise.all`.

Mapper строит `Map<string, Direction>` и `Map<string, Sphere>` один раз, объединяя `spheres.active` и `spheres.archived`. KPI считаются из `Goal.status`; `total` не включает archived. Все labels задаются exhaustive `switch` по существующим enums. Metric/milestone percent ограничивается диапазоном 0–100; qualitative не получает percent. `nextProgress: null` преобразуется в «Следующий шаг не задан».

Группировка применяется после filter selection. Реальные Sphere и Direction сортируются `localeCompare(..., 'ru')`; карточки — `updatedAtMs` descending, затем title и id. `directionId: null`, Direction без Sphere и dangling Direction остаются тремя различимыми presentation states и никогда не теряются молча.

- [ ] **Step 4: Запустить GREEN и mutation-oriented regression**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumLoader.test.ts src/presentation/goals/goalAlbumPresentation.test.ts src/application/commands/GoalCommands.test.ts src/infrastructure/persistence/GoalPersistence.test.ts
```

Expected: PASS; удаление status-check, Direction lookup или percent cap ломает минимум один новый тест, а существующий Goal-фундамент остаётся зелёным.

---

### Task 3: Production-ready GoalCard и все рабочие состояния GoalAlbumPage

**Законченный результат:** route `#/goals` показывает A1-композицию на реальных данных; loading/error/retry/global-empty/filter-empty/data работают, фильтры и view mode являются presentation state, карточки ведут в detail placeholder, а `#/goals/new` честно останавливается до A3.

**Files:**

- Create: `src/presentation/goals/GoalCard.tsx`
- Create: `src/presentation/goals/GoalAlbumPage.tsx`
- Create: `src/presentation/goals/GoalAlbumPage.test.ts`
- Create: `src/app/lifecycle/BrowserApplicationRouteSync.ts`
- Create: `src/app/lifecycle/BrowserApplicationRouteSync.test.ts`
- Create: `src/app/ApplicationShellRouting.test.ts`
- Modify: `src/app/ApplicationShell.tsx`
- Modify: `src/app/ApplicationShellPerformance.test.ts`

**Interfaces:**

```ts
export interface GoalCardProps {
  readonly goal: GoalCardViewModel;
  readonly onOpen: (goalId: string) => void;
}

export type GoalAlbumLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly model: GoalAlbumModel };

export interface GoalAlbumPageProps extends GoalAlbumQueries {
  readonly route: GoalAlbumRoute;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
}

export interface GoalAlbumScreenProps {
  readonly state: GoalAlbumLoadState;
  readonly route: Exclude<GoalAlbumRoute, { readonly view: 'create' }>;
  readonly filter: GoalAlbumFilter;
  readonly viewMode: GoalAlbumViewMode;
  readonly onFilterChange: (filter: GoalAlbumFilter) => void;
  readonly onViewModeChange: (mode: GoalAlbumViewMode) => void;
  readonly onRouteChange: (route: GoalAlbumRoute) => void;
  readonly onRetry: () => void;
}

export function GoalAlbumPage(props: GoalAlbumPageProps): ReactElement;
export function GoalAlbumScreen(props: GoalAlbumScreenProps): ReactElement;

export function settleGoalAlbumLoad(
  request: Promise<GoalAlbumSource>,
  isCurrent: () => boolean,
): Promise<GoalAlbumLoadState | null>;

export interface BrowserApplicationRouteSyncInput {
  readonly windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly readHash: () => string;
  readonly restore: (route: RoutedApplicationSection) => void;
}

export function startBrowserApplicationRouteSync(
  input: BrowserApplicationRouteSyncInput,
): () => void;
```

- [ ] **Step 1: Добавить RED-тесты рендера loading/error/empty/data/card/routes**

Использовать `renderToStaticMarkup` и реальные view models. Покрыть:

- loading имеет `role="status"`, «Загружаем цели…» и не показывает глобальный empty;
- error имеет `role="alert"`, нейтральный текст и кнопку «Повторить»;
- пустой model показывает «В Альбоме пока нет целей» и ссылку `#/goals/new`;
- непустой model с пустым filter показывает отдельный filter-empty и кнопку возврата к «Все»;
- data показывает четыре KPI, пять status filters с `aria-pressed`, grid/by-direction controls и реальные группы;
- status filters и view-mode controls находятся в отдельных `role="group"` с понятными `aria-label`; выбранный view mode также имеет `aria-pressed`;
- GoalCard показывает cover/placeholder, полный длинный title, Direction, stage, status, horizon, каждый progress-kind и полный `nextProgress`;
- `<a href="#/goals/goal-id">` обеспечивает реальный переход даже без JS;
- detail existing, detail not-found и create placeholder содержат возврат `#/goals`, но не формы A2/A3.
- deferred success/rejection после cleanup старой попытки возвращает `null` и не может перезаписать новый state; текущая попытка возвращает `ready`/`error`;
- `BrowserApplicationRouteSync.test.ts` меняет `readHash`, dispatches `popstate` и `hashchange`, получает album/detail/create и Routine routes, а после `stop()` больше не вызывает `restore`;
- `ApplicationShellRouting.test.ts` фиксирует использование `initialApplicationRoute`, `startBrowserApplicationRouteSync`, Goals state/render branch и запрет evening startup redirect при любом распознанном direct route;
- `ApplicationShellPerformance.test.ts` сначала ожидает lazy `GoalAlbumPage`, чтобы shell wiring также начал с RED.

Representative assertions:

```ts
expect(emptyMarkup).toContain('В Альбоме пока нет целей');
expect(emptyMarkup).toContain('href="#/goals/new"');
expect(dataMarkup).toContain('Картина будущего');
expect(dataMarkup).toContain('aria-pressed="true"');
expect(dataMarkup).toContain('По направлениям');
expect(cardMarkup).toContain('href="#/goals/goal-active"');
expect(cardMarkup).toContain('68 из 100 %');
expect(cardMarkup).toContain('Следующий шаг');
expect(detailMarkup).toContain('Полный экран цели будет подключён на этапе A2');
expect(createMarkup).toContain('Форма создания будет подключена на этапе A3');
expect(createMarkup).not.toContain('<form');
```

- [ ] **Step 2: Запустить RED**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumPage.test.ts src/app/lifecycle/BrowserApplicationRouteSync.test.ts src/app/ApplicationShellRouting.test.ts src/app/ApplicationShellPerformance.test.ts
```

Expected: FAIL — GoalCard/Page, runtime route sync и lazy shell wiring отсутствуют.

- [ ] **Step 3: Реализовать page controller и semantic A1 markup**

`GoalAlbumPage` импортирует React hooks и `type ReactElement`. Hooks вызываются безусловно при любом route. `shouldLoad = route.view !== 'create'`: create render показывает placeholder, а effect сразу завершается без queries; переход create → album/detail снова включает effect без нарушения Rules of Hooks. Album/detail path создаёт loader через `useMemo`, хранит `reloadToken`, filter и viewMode; effect ставит loading, использует `loader.load()` для первого снимка и `loader.refresh()` для retry. Loader существует только в lifetime экземпляра страницы: resolved cache не переживает unmount/повторное открытие, а retry всегда получает свежий `Promise.all`.

`settleGoalAlbumLoad` инкапсулирует success/error mapping и до построения модели проверяет `isCurrent()`. Effect передаёт cleanup flag; поэтому его deferred-тесты исполняют stale-completion contract в текущем Node/Vitest без новой DOM-зависимости. Scoped CSS подключается в Task 4 после появления файла, поэтому этот блок остаётся самостоятельно компилируемым.

```ts
useEffect(() => {
  if (!shouldLoad) return undefined;
  let active = true;
  setState({ status: 'loading' });
  const request = reloadToken === 0 ? loader.load() : loader.refresh();
  void settleGoalAlbumLoad(request, () => active).then((nextState) => {
    if (nextState !== null) setState(nextState);
  });
  return () => {
    active = false;
  };
}, [loader, reloadToken, shouldLoad]);
```

Header содержит только «Альбом целей» и «Добавить цель». Future overview содержит четыре реальные KPI и не изображает главную цель периода. Filters используют `GOAL_STATUS` values; view control хранит только `'grid' | 'by-direction'`.

GoalCard — `<article>` с единственной flow-content ссылкой. `href` строится `buildGoalAlbumRoute({ view: 'detail', goalId })`. Handler перехватывает только обычный левый клик; при `metaKey`, `ctrlKey`, `shiftKey`, `altKey` или non-left button браузер сохраняет open-in-new-tab semantics. Обложка использует `<img alt="Обложка цели …">`; placeholder — существующий `AppIcon name="goals"`.

Metric/milestone progress получают `<progress max="100" value={percent}>`; qualitative и none не создают ложную полоску. Title и `nextProgress` выводятся полностью.

Detail route ищет карточку в `state.model.cards`. Unknown id показывает «Цель не найдена», существующий id — название/status и A2-placeholder. Create placeholder не вызывает application mutation.

После появления page-модуля подключить его к shell. Один `initialApplicationRoute` определяет initial section и соответствующий `goalRoute`/`routineRoute`. Route restoration использует единый resolver:

```ts
const restored = parseApplicationRoute(window.location.hash);
if (restored?.section === APP_SECTION.goals) {
  setGoalRoute(restored.route);
  setActiveSection(APP_SECTION.goals);
  return;
}
if (restored?.section === APP_SECTION.routine) {
  setRoutineSection(restored.route.section);
  if (restored.route.date !== null) setSelectedDate(restored.route.date);
  setActiveSection(APP_SECTION.routine);
}
```

Вынести только browser-listener lifecycle в `startBrowserApplicationRouteSync`, повторив существующий injectable `BrowserCurrentDateRefresh` pattern: helper читает текущий hash при `popstate`/`hashchange`, вызывает `parseApplicationRoute`, передаёт только распознанные routes и возвращает cleanup. `ApplicationShell` применяет полученный Goal/Routine route к своим state setters; тест на `EventTarget` подтверждает обе подписки и снятие listeners.

`openSection(APP_SECTION.goals)` пишет album route через `history.pushState`; `openGoalRoute(route)` пишет detail/create route и сохраняет active Goals. Переход в нерутовый section очищает только распознанный app-owned hash. Evening startup auto-redirect прекращается при любом `initialApplicationRoute !== null`, поэтому прямой `#/goals` не заменяется экраном вечера.

Ленивый page boundary получает только:

```tsx
<GoalAlbumPage
  route={goalRoute}
  getGoals={application.getGoals}
  getDirections={application.getDirections}
  getSpheres={application.getSpheres}
  onRouteChange={openGoalRoute}
/>
```

Не передавать `CreateGoal`, `UpdateGoal`, `ArchiveGoal` или repositories: A1 read-only за пределами navigation state.

- [ ] **Step 4: Запустить GREEN и интегрированный presentation suite**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumNavigation.test.ts src/presentation/navigation/ApplicationRoute.test.ts src/presentation/goals/GoalAlbumLoader.test.ts src/presentation/goals/goalAlbumPresentation.test.ts src/presentation/goals/GoalAlbumPage.test.ts src/app/lifecycle/BrowserApplicationRouteSync.test.ts src/app/ApplicationShellRouting.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/presentation/navigation/AppSection.test.ts src/app/ApplicationShellPerformance.test.ts
```

Expected: PASS без console errors/warnings; A1 presentation не импортирует repositories и не вызывает mutation commands.

---

### Task 4: A1 visual system, responsive и accessibility contract

**Законченный результат:** экран визуально повторяет иерархию/плотность A1 внутри существующего shell, не создаёт horizontal overflow на 1600/1440/1280/1024/390/360, сохраняет полные длинные данные, touch targets, focus-visible, safe area и reduced motion.

**Files:**

- Create: `src/presentation/styles/goal-album.css`
- Create: `src/presentation/goals/GoalAlbumLayout.test.ts`
- Modify: `src/presentation/goals/GoalAlbumPage.tsx` — подключить созданный scoped stylesheet.

**CSS contract:**

- Все feature selectors начинаются с `.goal-album-` либо scoped через `.goal-album-page`.
- Page canvas: `width: min(calc(100% - 2rem), 82rem)`, `min-width: 0`, compact header override вместо глобального 5rem H1.
- Future overview: matte graphite surface, four-column KPI grid; без featured/main-goal imitation.
- Controls: wrapping flex/grid, `min-height: 2.75rem`, gold selected state, green только status badges active/achieved.
- Card grid: `repeat(auto-fit, minmax(min(100%, 13.5rem), 1fr))`; card/link/copy получают `min-width: 0`.
- Cover: `aspect-ratio: 16 / 9`, `object-fit: cover`; placeholder использует ту же геометрию.
- Title/next step: `white-space: normal; overflow-wrap: anywhere`; без line-clamp/text-overflow.
- Breakpoints: `64rem` — overview/group compaction; `48rem` — stacked header/control/group content; `30rem` — single KPI/card column и полный-width CTA.
- Mobile bottom padding учитывает `env(safe-area-inset-bottom)`; карточки/CTA не перекрываются fixed shell navigation.
- Явные `:focus-visible` и `@media (prefers-reduced-motion: reduce)`; без постоянного фиолетового акцента.

- [ ] **Step 1: Добавить RED CSS-contract tests**

`GoalAlbumLayout.test.ts` читает только новый scoped CSS, а не огромный `global.css`.

```ts
expect(css).toMatch(/\.goal-album-page\s*{[^}]*min-width:\s*0/);
expect(css).toMatch(
  /\.goal-album-card-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*13\.5rem\),\s*1fr\)\)/,
);
expect(css).toMatch(/\.goal-album-card-title[^{]*{[^}]*overflow-wrap:\s*anywhere/);
expect(css).toMatch(/\.goal-album-filter[^}]*min-height:\s*2\.75rem/);
expect(css).toMatch(/:focus-visible/);
expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
expect(css).toMatch(
  /@media \(max-width:\s*30rem\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
);
expect(css).toContain('env(safe-area-inset-bottom)');
expect(css).not.toMatch(/line-clamp|text-overflow:\s*ellipsis/);
```

- [ ] **Step 2: Запустить RED**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumLayout.test.ts
```

Expected: FAIL — scoped CSS отсутствует.

- [ ] **Step 3: Реализовать scoped CSS по A1 и существующим tokens**

Создать stylesheet и импортировать его из `GoalAlbumPage.tsx`. Использовать `--color-background`, `--color-surface`, `--color-border`, `--color-accent-gold`, `--color-accent-green`, spacing/radius/motion tokens. Не копировать reference-контент и не добавлять raster assets. Минимальное свечение допускается только для keyboard/selected feedback; поверхности остаются матовыми.

Desktop держит четыре KPI и 4–5 карточек при доступной ширине. Tablet меняет число колонок через auto-fit, не фиксированную ширину. На mobile порядок остаётся: header → overview → filters → view mode → content; фильтры переносятся, а grouped sections не создают вложенный horizontal scroll.

- [ ] **Step 4: Запустить GREEN вместе с shell layout regression**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumLayout.test.ts src/presentation/goals/GoalAlbumPage.test.ts src/presentation/layouts/ApplicationShellLayout.test.ts src/presentation/layouts/ApplicationShellView.test.ts
```

Expected: PASS; существующий sidebar/mobile shell contract не изменён.

---

### Task 5: Интеграционная, визуальная и полная quality-gate приёмка

**Законченный результат:** реальный route проверен с empty и временными data fixtures, visual hierarchy сопоставлена с A1, interactions/back-forward/retry работают, все project gates проходят, итоговый screenshot и diff готовы для отчёта; A2/A3 не начаты.

**Files:**

- Verify: все файлы Tasks 1–4.
- Do not create: demo seed files, root QA reports, A2/A3 components или release archive.

- [ ] **Step 1: Запустить весь целевой suite и проверить scope diff**

Run:

```powershell
npx vitest run src/presentation/goals/GoalAlbumNavigation.test.ts src/presentation/navigation/ApplicationRoute.test.ts src/presentation/goals/GoalAlbumLoader.test.ts src/presentation/goals/goalAlbumPresentation.test.ts src/presentation/goals/GoalAlbumPage.test.ts src/presentation/goals/GoalAlbumLayout.test.ts src/app/lifecycle/BrowserApplicationRouteSync.test.ts src/app/ApplicationShellRouting.test.ts src/presentation/navigation/AppSection.test.ts src/presentation/layouts/ApplicationShellView.test.ts src/presentation/layouts/ApplicationShellLayout.test.ts src/presentation/routine/RoutineNavigation.test.ts src/presentation/pages/SectionPages.test.ts src/app/ApplicationShellPerformance.test.ts
git status --short
git diff --stat
git diff -- src/domain/goal src/application/commands src/application/queries/GetGoals.ts src/application/ports/GoalRepository.ts src/infrastructure/persistence
```

Expected: targeted suite PASS. Последняя команда показывает только существовавший до A1 Goal-foundation diff; реализация альбома не добавляет изменения в этих путях.

- [ ] **Step 2: Запустить приложение и пройти Browser QA во встроенном браузере**

Run в отдельной PTY session:

```powershell
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Открыть `http://127.0.0.1:4173/#/goals` во встроенном браузере Codex. Сначала на пустом `goals` store проверить global empty, CTA и `#/goals/new`; затем вернуться в album.

Для data-state в изолированном browser IndexedDB `lifeos` создать только записи с префиксом `qa-goal-album-`:

| Fixture                           | Status / progress             | Relation                                    | Visual case                             |
| --------------------------------- | ----------------------------- | ------------------------------------------- | --------------------------------------- |
| `qa-goal-album-house`             | active / metric 68 of 100 `%` | `qa-direction-home` → `qa-sphere-home`      | cover, active green, long next step     |
| `qa-goal-album-lifeos`            | future / milestones 3 of 6    | `qa-direction-product` → `qa-sphere-growth` | placeholder, future status              |
| `qa-goal-album-achieved`          | achieved / qualitative done   | `qa-direction-product`                      | achieved state                          |
| `qa-goal-album-unassigned`        | future / null                 | `directionId: null`                         | «Без направления»                       |
| `qa-goal-album-no-sphere`         | future / qualitative moving   | Direction with `sphereId: null`             | «Без сферы»                             |
| `qa-goal-album-missing-direction` | future / null                 | non-null absent Direction id                | «Направление недоступно»                |
| `qa-goal-album-archived`          | archived / milestones 1 of 4  | `qa-direction-product`                      | archive filter, excluded from total/all |

Каждый raw record соответствует существующим `SphereRecord`, `DirectionRecord`, `GoalRecord` (`schemaVersion: 1`, ISO timestamps, `version: 1`); cover fixture использует временный valid image data URL и корректный `sizeBytes`. После transaction reload route и проверить, что KPI равны `active 1 / future 4 / achieved 1 / total 6`, а archive доступен только отдельным фильтром.

Для error/retry без production flag временно переопределить `IDBObjectStore.prototype.getAll` в текущей вкладке, сохранить оригинал в `window.__goalAlbumQaGetAll`, уйти в другой section и вернуться в Goals. Проверить error-state, восстановить prototype и нажать «Повторить»; data-state должен вернуться. После проверки удалить только QA keys из `goals`, `directions`, `spheres` stores и reload.

- [ ] **Step 3: Сравнить с A1 на всех обязательных viewport и пройти interaction/a11y checklist**

Проверить и сохранить screenshot основного data-state на 1600×900. Затем проверить 1440, 1280, 1024, 390×844 и 360×800:

- A1 hierarchy: title → «Картина будущего» → filters/view mode → cards/groups;
- плотность, размеры, отступы, графит/золото/зелёная семантика и отсутствие постоянного фиолетового;
- desktop sidebar, active/collapsed tooltip и mobile overlay-menu;
- cover и placeholder, длинный title/nextProgress, все progress kinds;
- Все/Активные/Будущие/Достигнутые/Архив;
- grid ↔ «По направлениям», Sphere → Direction, «Без сферы», «Без направления», missing Direction;
- GoalCard → direct detail, browser back/forward, direct reload detail/create routes;
- keyboard focus на sidebar, CTA, filters, view controls и cards; `aria-pressed`, loading/error live regions;
- отсутствие horizontal scroll, clipping, перекрытия CTA fixed mobile nav и недоступных touch targets.

Если visual comparison выявляет P0/P1/P2 расхождение, сначала добавить regression assertion там, где дефект проверяем автоматически, затем исправить и повторить screenshot. P3-polish, требующий выхода за утверждённую композицию, зафиксировать как необязательное наблюдение и не реализовывать в этом этапе.

- [ ] **Step 4: Выполнить полный обязательный quality gate свежими командами**

Run последовательно и читать полный exit/output каждой команды:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
git diff --check
```

Expected: каждая команда exit 0, тесты без failures, build создан, Prettier сообщает, что все matched files используют форматирование, `git diff --check` не выводит whitespace errors.

- [ ] **Step 5: Подготовить итоговый handoff и остановиться**

Снять свежие:

```powershell
git status --short
git diff --stat
git diff --numstat
```

Финальный отчёт содержит: что исправлено, первопричину отсутствия раздела, изменённые файлы, routes, components, data flow Goals/Direction/Sphere, grouping rule, результаты шести gate-команд, размер diff и итоговый screenshot/описание. Отдельно перечислить только реальные ограничения ручной QA. Не создавать release archive, commit и не начинать A2/A3.
