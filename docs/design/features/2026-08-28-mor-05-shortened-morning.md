# MOR-04.2 / MOR-05 — Главное действие и сокращённое утро

## Status

- Design: `APPROVED BY MASTER PLAN`
- Approved reference: `MORNING SERIES SCREEN 8 / USER MASTER PLAN`
- Implementation: `IN PROGRESS`
- Implementation visual review: `PENDING USER APPROVAL`
- Lock: `UNLOCKED`

## FEATURE

MOR-04.2 завершает проверку главного действия после настройки перед зеркалом. MOR-05 добавляет
ручной сокращённый режим конкретного MorningCycle, нейтральный прогноз оставшегося времени и
взвешенный прогресс утра. MOR-06, история и аналитика не входят в изменение.

## USER GOAL

Пользователь видит действие, ожидаемый результат, время и первый шаг; при отсутствии первого шага
выбирает допустимого кандидата. В незавершённом утре пользователь вручную сокращает только
оставшуюся часть сценария, не теряя выполненные этапы и факты физических подходов, и может
вернуться к обычному режиму без перезапуска MorningCycle.

## CURRENT MOR STATE

- MOR-01…MOR-03 реализуют запуск, быстрый старт и физический план/факт.
- MOR-04 реализует настрой перед зеркалом и переводит карточку «Главное действие» в current.
- Существующий `GetMorningOverview` уже содержит авторитетные правила выбора `TomorrowPlan.firstAction`,
  fallback по первому главному Решению и поиск RoutineBlock с временем.
- `MorningCycle.shortenedMode` и кнопка «Сократить утро» существуют как ранний placeholder без
  конфигурации, возврата, safe-boundary и корректной модели прогресса.

## EXISTING LOGIC TO PRESERVE

- `TomorrowPlan`, `Decision`, `LifeAction` и `RoutineBlock` остаются источниками главного решения,
  ожидаемого результата, первого шага и времени; эти данные не копируются в MorningCycle.
- ID/version MorningCycle, water/cold-shower, physical plan, resolved set actuals, mirror state и
  optimistic concurrency сохраняются.
- Выбор кандидата использует существующее назначение `TomorrowPlan.firstAction`.
- Обычный физический plan и уже записанный fact не переписываются сокращённым режимом.

## NEXT MOR STAGE

- Сначала: MOR-04.2 — проверка главного действия.
- Затем: MOR-05 — `shortened_active` / `reverted_to_normal`, конфигурация overrides, safe boundary,
  weighted progress и remaining forecast.
- После готовности главного действия текущим становится только карточка Work Block; MOR-06 не
  реализуется.

## PAGE / COMPONENT ARCHETYPE

Существующий Morning Center dashboard и in-page detail archetype MOR-04. Сокращение открывает
компактную встроенную configuration surface; отдельный раздел и отдельная навигация не создаются.

## SECTION ACCENT

Routine amber/gold через существующие tokens (`--section-routine`) на графитовой базе. Completed —
зелёный. Skipped/shortened — нейтральный графит с тихой золотой маркировкой, не error red.

## ATMOSPHERIC MOTIF

Существующая спокойная утренняя атмосфера MOR-01…MOR-04: слабое золото, минимум glow, без смены
палитры всего экрана при сокращении.

## MAIN VISUAL CENTER

Текущая stage card остаётся главным визуальным центром. В active shortened state верхняя панель
спокойно показывает `Сокращённый режим`, пересчитанные `Осталось ≈ N мин` и progress; режим не
конкурирует с current stage.

## COMPONENTS TO REUSE

- Morning Center hero/status panel, progress track, stage groups/cards and state messages.
- Morning in-page header/path/focus surface.
- Existing button, radio/segmented, focus-visible, error/status and safe-area patterns.
- Existing RoutineBlock form entry point for планирования времени.

## INTERACTIVE STATES

- normal;
- shortening configuration open;
- saving/disabled;
- `shortened_active`;
- physical override pending until safe boundary;
- `reverted_to_normal`;
- main-action ready, missing-first-step with candidates, missing-time;
- read-only historical;
- load/mutation error with retry.

## MOBILE BEHAVIOR

Одна колонка: metrics → mode/configuration → current stage → remaining stages. Segmented controls
переносятся по строкам без horizontal overflow, touch target не меньше 44 px, нижний padding
учитывает LifeOS bottom navigation/safe area.

## ACCESSIBILITY

Native buttons/radios/fieldset/legend; `aria-live` для режима и прогноза; `aria-busy` и disabled при
mutation; deterministic heading focus; visible `:focus-visible`; no color-only meaning; reduced
motion; neutral complete/shortened labels in accessible text.

## APPROVED VISUAL REFERENCE

YES — пользовательский мастер-план и утверждённый экран №8 серии «Сокращённое утро». В репозитории
нет отдельного bitmap/Figma artifact, поэтому pixel-perfect verdict не заявляется; обязательна
ручная визуальная приёмка реального экрана.

## TEST SCOPE

- Domain: mode lifecycle/idempotency, preserved facts, safe-boundary physical override, rehydrate.
- Application: candidate selection, weighted progress, neutral remaining forecast, CAS/reload.
- Persistence: round-trip new optional record fields without a new IndexedDB store.
- Presentation: normal/config/active/reverted/main-action states and mobile semantics.
- Targeted MOR-05 E2E: normal → shorten → reload → revert; mid-set safe boundary; desktop/mobile.
- `typecheck`, `lint`, `git diff --check`; full verify at most once and only if broad persistence risk
  justifies it.

## BUSINESS LOGIC CONSTRAINTS

- Only manual activation; no late-rise automation.
- Mode is state of one MorningCycle and never leaks to another date.
- Completed stages and resolved set facts never disappear.
- Physical shortening never changes the current pending set; it applies after resolution before the
  next allowed set/exercise.
- Reversion never recreates the MorningCycle and never restores already consumed/skipped work.
- No universal «Пропустить всё»; stage options are explicit.
- Forecast uses baseline norms in v1 but accepts a duration profile boundary for future normal-only
  completed history. A cycle that was ever shortened remains history-ineligible even after revert.
- No user-facing speed comparison, rating, shortened-vs-normal statistics, MOR-06 or history UI.
