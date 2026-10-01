# Проверка панели управления действием

Дата: 30.09.2026. Рабочая ветка: `codex/motion-release-1.0.19`.
Статус: реализовано и технически проверено; коммита, push и visual approval не было.

## Результат

Обычное открытие действия из «Сегодня», «Завтра», представлений библиотеки и Quick Access показывает
одну карточку поверх исходной страницы. Закрытие сохраняет день, запрос, фильтры и прокрутку;
Back/Forward управляют панелью, прямой URL и прежняя полная карточка работают. Название, дата,
время, выполнение и повторное открытие используют существующие application-команды.

`ApplicationShell` владеет URL/history. Библиотека и панель используют одну root read model и
один completion owner, поэтому закрытие панели не теряет сохранённый результат или retry после
ошибки обновления. Черновики панели и вложенных форм защищены своим guard; настоящий переход
со страницы дополнительно проверяет исходную форму. Новых зависимостей и схемы данных нет.

Реализация переиспользует `PlannerActionList`, `PlannerSheet` и существующие controls. Форма
названия и частые действия расположены сверху, дополнительные поля остаются в раскрытиях.
Стандартный Premium graphite/jade не менялся. Тестовые fixtures библиотеки и аккаунта обновлены
для общего владельца данных и реального `ApplicationShell`.

## Проверки

- `npm run verify` — exit 0: typecheck, lint (0 ошибок, 6 предупреждений), 1912 unit/integration
  passed и 1 skipped, infra 60 passed, alpha 1 passed, production build, Prettier и
  `git diff --check`.
- `npm run test:e2e -- tests/e2e/current.action-panel.spec.ts` — 32/32 passed, desktop/mobile.
- `npm run test:e2e -- tests/e2e/current.library-reactive.spec.ts tests/e2e/current.daily-workflow.spec.ts tests/e2e/current.action-completion-recovery.spec.ts`
  — 42/42 passed, desktop/mobile, включая 100/1000 записей и retry без повторной записи.
- `npm run test:e2e -- tests/e2e/current.quick-access.spec.ts tests/e2e/current.diary.spec.ts tests/e2e/current.memory.spec.ts --grep 'quick access|daily diary saves|failed photo and browser back|memory save failure'`
  — 24/24 passed, desktop/mobile; `VITE_LIFEOS_MEMORY_ENABLED` не задан.
- Соседний scoped прогон: completion summary 2/2, date undo 2/2, sheet resize 2 passed/2
  ожидаемых skipped по viewport, time planning 8/8 passed. Общий запуск этих файлов завершился
  с ошибкой только из-за устаревших ожиданий Quick Access, обновлённых и затем проверенных
  отдельным зелёным прогоном выше.
- Browser visual review: 1440×900 и 390×844, открытая карточка, прокрутка, вложенные dialogs,
  focus и keyboard, 44 px touch controls, отсутствие горизонтального overflow и page errors.
  Снимки изучены во время проверки; отдельный утверждённый макет для стандартной формы не требуется.

Полный E2E не запускался: изменение затрагивает ограниченный набор маршрутов и форм, а выбранные
сценарии покрывают общие границы history, guard, сохранения и адаптивной панели. Проверка на
физическом телефоне и отдельное визуальное утверждение пользователем не выполнялись.
