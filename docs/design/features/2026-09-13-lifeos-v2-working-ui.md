# Рабочий интерфейс LifeOS V2

## Контракт

Новая страница Today и две формы на существующих LifeAction/Goal. База — принятый core
`ae248e2`. Изменения предыдущих задач в dirty worktree не входят в этот блок.

Approved reference: предоставленный пользователем `05LifeOS_V2_Каталог_макетов.pdf`, страницы
2–3 (визуальный эталон и desktop/mobile списка). PDF не содержит отдельных макетов Today и
форм: их композиция следует явному заданию пользователя. Остальные страницы каталога не
расширяют scope. Чёрный фон, белый текст, один зелёный акцент; локальные V2 tokens имеют
приоритет над общим forest/glass оформлением по прямому указанию пользователя.

FEATURE → Today, новая цель, новое действие.
USER GOAL → быстро записать действие, назначить дату, выполнить галочкой; создать цель без направления.
EXISTING LOGIC → LifeAction, Goal, CompleteLifeAction, SetLifeActionGoal, CreateGoal, Journal.
ARCHETYPE → спокойный список и одношаговая форма; главный визуальный центр — действие/название.
SECTION COLOR → зелёный акцент PDF на чёрном фоне; ошибка дополнительно обозначается текстом.
COMPONENTS → VoiceField, VoiceTextInput, VoiceTextArea, AppIcon, native form/details/checkbox.
MOBILE → одна колонка, компактная нижняя навигация, touch targets ≥44px, safe area.
APPROVED REFERENCE → YES для визуального языка; отдельные Today/form-макеты в PDF отсутствуют.
TEST SCOPE → targeted domain/application/render/route/voice tests, browser QA desktop/mobile,
один npm run verify. Полный Playwright/E2E запрещён.

## Поведение

- Скрытые маршруты: `#/v2/today`, `#/v2/goals/new`, `#/v2/actions/new?goalId=…`.
  Legacy Today остаётся default. Кнопка возврата переключает маршрут без отката данных.
- Today: необязательное главное действие, остальные на сегодня, свёрнутые выполненные,
  быстрое добавление; недатированные действия доступны в свёрнутом блоке для назначения даты.
  Завершение — одна галочка, без Session и заметки. Completed группируется по completedAt.
- Action: обязательное только название; цель и дата optional; описание/заметки объединены
  в существующее description. Приоритет — обычное/главное на выбранный день (isNext).
  На одну дату выбирается не более одного открытого главного действия. Недатированное
  действие можно создать без назначения приоритета. Поздняя классификация использует SetLifeActionGoal.
- Goal: название, желаемый результат (achievementCriteria), optional direction/horizon,
  optional первый шаг как текст (nextProgress), дополнительные description/whyImportant/whyNow.
  Первый шаг не создаёт скрытое действие: после сохранения есть явное «Добавить действие»
  с goalId и текстом первого шага. Точный deadline не подменяется horizon.
- Голосовые поля используют общий runtime, результаты приходят через тот же callback,
  что ручной ввод. Отказ/unsupported не блокирует ручной ввод.
- Loading, empty, retry/error, pending и success предусмотрены. Double submit блокируется.

## Минимальные необходимые расширения

Существующий draft запрещает plannedDate без legacy preparation. Разрешается независимая дата
draft/completed без ослабления legacy ready/in_progress. CreateLifeActionDraft получает optional
goalId/date/isNext и atomic UoW в штатной composition. Новая команда планирования изменяет
существующее действие и назначение главного на дату одной транзакцией. Новых сущностей,
таблиц, Supabase migrations, протокола и crypto нет; completion core не переделывается.

## Границы

Канбан, календарь, древо, фокус, входящие, периоды и ритуалы не реализуются. V1-экраны и
Decision/Project/ActionSession сохраняются. Реальная запись микрофоном на Windows/Android
требует отдельной ручной проверки; подставной speech provider доказывает только интеграцию.

## Совместимость развёртывания

LifeAction синхронизируется существующим механизмом. Новый клиент читает прежние записи,
но бинарник baseline ae248e2 отвергает сочетание plannedDate != null, expectedResult = null,
readyAt = null (ready_fields_incomplete). Это касается простого dated draft и его completion.
На старом клиенте ошибка может отправить событие в карантин и остановить pull на том же cursor.
Перед использованием датированных простых действий нужно обновить все синхронизируемые устройства.
Смешанные версии этим блоком не поддержаны. Gate 1, migrations, protocol и crypto не менялись.
Rollback в этом блоке — переключение на legacy UI внутри новой версии, не откат бинарника.
Нужна ручная проверка Windows → Android → completion → Windows на новых клиентах в тестовом
пространстве: дата, статус, единственный Journal-факт и сохранность после перезапуска.

## Результат проверки 13 сентября 2026

- Итоговый targeted-прогон: 19 файлов, 123 теста — PASS.
- Единственный `npm run verify`: exit 0; TypeScript, ESLint, 388 файлов / 3356 unit/integration
  tests, 55 infra tests, 1 alpha test, production build, Prettier и Git hygiene — PASS.
- ESLint: 15 существующих предупреждений Fast Refresh вне этого блока; сборка предупреждает
  о размере общего bundle. Полный Playwright/E2E не запускался.
- Browser QA на отдельных localhost origins без пользовательских данных: title-only action,
  без даты → сегодня → checkbox → completed, reload; quick add через Enter; необязательное
  главное действие; Goal без Direction; первый шаг и goalId; ссылка из существующей GoalCard;
  ошибочный ввод сохраняет форму; native disclosures; rollback и Back/Forward; keyboard skip/focus.
- Desktop 1600×900 и 1280×720; mobile 390×844 и 360×800. Проверены формы, раскрытые дополнительные
  поля, Today, перенос длинных названий и отсутствие горизонтального переполнения на mobile.
  Кнопки формы доступны над нижней навигацией после прокрутки.
- Во время горячего обновления новых lazy-модулей возникал пустой dev-экран, восстановленный
  перезагрузкой. Финальная production-сборка отдельно открыта и прошла create → completion;
  её консоль не содержит ошибок и предупреждений.
- Ручными остаются реальная диктовка/разрешения микрофона, системная клавиатура и safe areas
  на физических Windows/Android, обмен новыми данными между двумя обновлёнными клиентами.
  Pixel-perfect соответствие отдельным Today/form-макетам не заявляется: таких страниц в PDF нет.

## Файлы этого блока

Предшествующие dirty Markdown/agent/config изменения сохранены и не относятся к этому списку.

- `src/app/ApplicationShell.tsx`
- `src/app/ApplicationStartup.test.ts`
- `src/app/ApplicationStartup.ts`
- `src/app/composition/LifeOsApplication.ts`
- `src/app/composition/PlannerActions.integration.test.ts`
- `src/app/composition/PlannerUiFlows.integration.test.ts`
- `src/app/composition/createLifeOsApplication.ts`
- `src/application/commands/CreateLifeActionDraft.ts`
- `src/application/commands/SetLifeActionPlan.ts`
- `src/application/commands/lifeActionPlanning.ts`
- `src/application/index.ts`
- `src/application/ports/JournalUnitOfWork.ts`
- `src/application/queries/GetPlannerToday.ts`
- `src/domain/life-action/LifeAction.ts`
- `src/infrastructure/persistence/IndexedDbJournalUnitOfWork.ts`
- `src/presentation/goals/GoalCard.test.ts`
- `src/presentation/goals/GoalCard.tsx`
- `src/presentation/navigation/ApplicationRoute.test.ts`
- `src/presentation/navigation/ApplicationRoute.ts`
- `src/presentation/planner-v2/PlannerActionForm.tsx`
- `src/presentation/planner-v2/PlannerForms.test.tsx`
- `src/presentation/planner-v2/PlannerGoalForm.tsx`
- `src/presentation/planner-v2/PlannerToday.test.tsx`
- `src/presentation/planner-v2/PlannerToday.tsx`
- `src/presentation/planner-v2/PlannerV2Navigation.test.ts`
- `src/presentation/planner-v2/PlannerV2Navigation.ts`
- `src/presentation/planner-v2/PlannerV2Workspace.tsx`
- `src/presentation/planner-v2/planner-v2.css`
- `src/presentation/planner-v2/plannerFormSubmission.ts`
- `src/presentation/planner-v2/plannerRouteSubmission.test.ts`
- `src/presentation/planner-v2/plannerRouteSubmission.ts`
- `src/presentation/planner-v2/plannerTodayCommands.ts`
- `src/presentation/styles/goal-album.css`
- `docs/design/features/2026-09-13-lifeos-v2-working-ui.md`
- `docs/superpowers/plans/2026-09-13-lifeos-v2-working-ui.md`
