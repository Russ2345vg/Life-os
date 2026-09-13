# LifeOS V2 — отчёт по Канбану, Календарю и Древу

## Результат

Три представления подключены к существующим разделам «Цели» и «Действия» через
компактный переключатель. Нижняя навигация сохраняет четыре пункта, legacy V1 доступен.
Предметные записи, repositories и sync-поля остаются прежними.

- Канбан целей: существующие состояния future/active/paused/achieved/archived,
  изменение через меню, фокус как отметка, контекст/важность/горизонт/следующий шаг,
  только существующий измеримый прогресс. Архив — чтение и переход в полную карточку.
- Канбан действий: без даты/запланировано/выполнено/отменено, одна галочка completion,
  формы даты и связи, без нового workflow и drag-and-drop.
- Календарь: месяц и выбранный день, плановые даты LifeAction, выполненное явно
  отличается. Изменение даты завершённого действия сохраняет completedAt и Journal.
  У текущего Goal нет точного срока; горизонт не превращается в день, цели доступны
  в блоке «Без даты». Новое поле дедлайна не добавлено.
- Древо: сфера → направление → цель → действие. Есть пустые родители, группы без
  сферы/направления/цели, сохранены прямые sphereId у Goal. Карточки сфер и направлений
  открываются внутри ветки; Goal и LifeAction ведут в существующие полные карточки.
  Связи изменяются у тех же записей; раскрытие — только presentation state.

Коллекции индексируются один раз без запросов на карточку. Группы показываются по
30 элементов с кнопкой продолжения; формы и дочерние ветки монтируются при раскрытии.
Виды используют один порядок выбора следующего шага со списком.

## Переиспользованные команды

| Команда            | Использование                                                |
| ------------------ | ------------------------------------------------------------ |
| UpdateGoal         | status/stage с expectedVersion; назначение и смена Direction |
| SetLifeActionPlan  | назначение, изменение и снятие плановой даты                 |
| CompleteLifeAction | обычное идемпотентное V2 completion с существующим Journal   |
| SetLifeActionGoal  | назначение/снятие Goal, включая завершённые действия         |

Для completed узко расширен SetLifeActionPlan/LifeAction.setPlan: перенос не вызывает
legacy reschedule и не меняет главный приоритет другого открытого действия.
Legacy-подготовленные действия сохраняют обязательную дату; ограничения in_progress,
cancelled и archived остаются. Новых application-команд или предметных сущностей нет.

## Проверки

Целевые проверки: 123 теста в 12 файлах, exit 0. Покрыты новые проекции, рендер,
round-trip маршрутов, IndexedDB reload, ID/Journal/completion, состояния Goal,
связывание/снятие связи, конфликт версии, rollback и соседние контракты LifeAction.
Проекция проверена на 2500 действиях. Наборы:

- PlannerViews.integration.test.ts — 5 тестов.
- PlannerViews.test.tsx, PlannerLibrary.test.tsx, PlannerV2Navigation.test.ts — 12 тестов.
- LifeAction.test.ts, LifeActionRehydrate.test.ts, LifeActionV2Core.test.ts,
  PlannerActions.integration.test.ts, LifeOsV2Core.integration.test.ts,
  GoalCommands.test.ts, plannerCatalogModel.test.ts, plannerViewsModel.test.ts — 106 тестов.

Browser QA выполнена в отдельном headless Edge-профиле на собственном Vite-сервере
127.0.0.1:42813. Сервер остановлен, его порт освобождён. Пользовательская база не
использовалась. Проверены:

- desktop 1440×1000, mobile 390×844, 360×844 и 320×844;
- смена колонки Goal и reload; completion Action и disabled повтор;
- перенос даты completed Action, выбор дня и доступность «Без даты»;
- дерево, назначение/снятие Goal у того же Action;
- конфликт версии Goal: исходная колонка сохраняется, error/reload/retry работают;
- отсутствие горизонтального overflow страницы, четыре пункта навигации;
- keyboard focus, reduced motion, переключение месяцев, зоны дней ≥44×44 на 320 px;
- длинные названия, пустые состояния, выполненные и записи без родителей;
- console/page errors отсутствуют в основном browser-сценарии.

Скриншоты сопоставлены со страницами 4–6 предоставленного PDF: чёрная основа,
монохромная типографика, зелёный акцент, мобильные горизонтальные колонки, календарь
с отдельными деталями дня, компактное раскрытие дерева. Различия обусловлены текущей
моделью: нет точного срока Goal и дополнительных типов календарных событий.
Правило №38 применено с явным пользовательским V2-переопределением палитры/атмосферы.
Отдельное пользовательское визуальное утверждение результата не присваивалось.

Независимые architecture и final read-only reviews выполнены. Замечание о выборе
следующего шага устранено общим компаратором и регрессионным тестом; существенных
открытых замечаний нет. Полный Playwright/E2E не запускался по прямому запрету.

Выполнен один `npm run verify`, exit code 0: TypeScript, ESLint, 3399 тестов
unit/integration в 397 файлах, 55 infrastructure tests, alpha (1 тест), production
build, Prettier и Git hygiene. ESLint: 15 предсуществующих предупреждений, 0 ошибок.
Сборка также сообщает о крупном основном chunk; новые зависимости не добавлены.
V2 bundle: 61,40 kB JavaScript (14,26 kB gzip), 16,94 kB CSS (3,82 kB gzip).
После gate изменена только документация результата; её формат проверен отдельно.

## Файлы текущего блока

Изменены:

- src/application/commands/SetLifeActionPlan.ts
- src/domain/life-action/LifeAction.ts
- src/presentation/planner-v2/PlannerActionList.tsx
- src/presentation/planner-v2/PlannerLibraryWorkspace.tsx
- src/presentation/planner-v2/PlannerV2Navigation.ts
- src/presentation/planner-v2/PlannerV2Navigation.test.ts
- src/presentation/planner-v2/PlannerV2Workspace.tsx
- src/presentation/planner-v2/plannerCatalogModel.ts

Созданы:

- src/app/composition/PlannerViews.integration.test.ts
- src/presentation/planner-v2/PlannerCalendar.tsx
- src/presentation/planner-v2/PlannerKanban.tsx
- src/presentation/planner-v2/PlannerTree.tsx
- src/presentation/planner-v2/PlannerViewParts.tsx
- src/presentation/planner-v2/PlannerViewSwitcher.tsx
- src/presentation/planner-v2/PlannerViews.test.tsx
- src/presentation/planner-v2/planner-views.css
- src/presentation/planner-v2/plannerGoalCommands.ts
- src/presentation/planner-v2/plannerViewsModel.ts
- src/presentation/planner-v2/plannerViewsModel.test.ts
- docs/design/features/2026-09-13-v2-kanban-calendar-tree.md
- docs/superpowers/plans/2026-09-13-v2-kanban-calendar-tree.md
- docs/codex/2026-09-13-v2-kanban-calendar-tree-report.md

## Ограничения и ручная проверка

Нужна ручная проверка на физическом Android: системный выбор даты/select, клавиатура,
touch-scroll и размеры шрифта. Реальный обмен двух устройств не проверялся;
sync-протокол/crypto/security не менялись, поля уже входят в текущий sync-контракт.

Сознательно не реализованы DnD, недельный календарный режим, новый дедлайн Goal,
новые события/контрольные точки, reopen completed, ритуалы, планирование недели/30 дней/
квартала/года, аналитика, таймеры, удаление legacy, глобальный редизайн, зависимости.

## Git

Исходная ветка: v2-current-baseline. Исходный HEAD:
a4418fbbc136eb1334f7e6a6e3d94616a7e65f19; baseline подтверждён как предок HEAD.
Предсуществующие изменения docs/.agents/.codex и пользовательские референсы сохранены
и исключены из блока. Диагностические материалы находятся в игнорируемом test-results.
Push не выполнялся.
