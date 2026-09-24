# LifeOS Premium — Implementation Plan

**Goal:** применить утверждённый вариант 2 ко всем существующим экранам без изменения данных и бизнес-логики.
**Architecture:** общие тематические tokens и завершающий слой planner-premium.css; локальная перегруппировка Today; отдельная визуальная палитра native alarm. Главный агент меняет файлы, review read-only.
**Tech Stack:** существующие React/TypeScript/CSS, Kotlin Android, без новых зависимостей.
**Spec:** docs/design/features/2026-09-24-premium-all-screens.md.

## Ограничения

Сохранить dirty baseline (снимок в Codex visualizations/2026/09/24/01a0d363-05ab-7803-a9bb-92ecaaa37d39/premium-baseline), команды, маршруты, persistence, keyboard/focus/44px и resized sheets. Не копировать старое золото/лес. Реальный состав Today включает сценарии и просроченные; их не удалять ради совпадения с пустым изображением. Не менять Android alarm lifecycle/permissions/dismissal.

## Review focus

Длинные русские названия; 320/360/390px и 700–760px; sheets с клавиатурой и изменением ширины; ошибки/disabled/unknown различимы; default palette не окрашивает ошибки и завершения как selected.

## Шаги

- [x] Зафиксировать approved reference и baseline, прочитать текущие CSS и компоненты.
- [x] Общая система: tokens.css с jade accent и плотными материалами; planner-master aliases согласовать; новый planner-premium.css последним импортом в PlannerWorkspace. Обновить базовый startup вид без поведения.
- [x] Today: перенести day switch в header, direction перед единой рабочей областью, quick-create перед задачами; сохранить существующие handlers/names, сценарии, приоритеты и ошибки. Progress наверху справа, shortcuts без коллекции вложенных карточек. DOM/tab order соответствует видимому.
- [x] Каталоги/детали/формы: единая поверхность и спокойные разделители, focus/hover, progress и цветовые состояния через tokens. Sleep/account/voice/menu/update включить в тот же набор. Проверить сложные views и mobile.
- [x] Native alarm: только цвета, поля и кнопки в существующем Activity; сохранить камеру и hold-lifecycle. CompileDebugKotlin через имеющийся Gradle при доступной среде; отдельно сообщить отсутствие device QA.
- [x] Targeted: PlannerToday, PlannerLibrary, BalanceWorkspace, SleepPreparationPage, PlannerSheetResize tests. Browser: existing MASTER responsive/hierarchy, daily flow, filters, sheets, scenarios, spheres. Проверить реальный preview desktop/mobile и сравнить с эталоном.
- [ ] После стабилизации npm run verify; при обнаружении общего layout риска — полный E2E с предварительным обоснованием. Review и git diff --check; отчёт по фактическому покрытию. Без commit/push/release.

## Ход проверки

- Исходные файлы сохранены отдельно от уже dirty Git; рабочее дерево не заменялось.
- Новые CSS-компоненты не создают предметного состояния. В Today изменён порядок существующих блоков.
- Targeted render/unit: 32 passed. Новый тест порядка quick-add сначала падал, после перемещения DOM прошёл.
- Native Android: offline Gradle `testUniversalDebugUnitTest --tests com.lifeos.desktop.WakeDismissalPolicyTest` — BUILD SUCCESSFUL, 111 с. Kotlin компилируется; device QA недоступна.
- Review обнаружил и помог убрать обрезание calendar focus, несовпадающий mobile breakpoint и обратный tab order кнопок quick-add.
- Browser: desktop 1440, mobile 390 и 730, реальные разделы и формы просмотрены; приложение содержит сохранённые данные, ручной QA их не менял.
- Набор scoped E2E: master (включая 320/730), daily-workflow, filters, scenarios, sheet-resize, ui-refinement. Full E2E не выбран: команды/persistence/routing не меняются, риски layout и DOM покрываются указанными сценариями.
- Первый verify: typecheck/lint/1412 unit passed; infra остановился на startup timing. E2E ошибочно запущен до завершения infra; следующий запуск infrastructure выполняется отдельно после E2E. Код инфраструктуры не меняется.

## Итог проверки реализации

- UI fix: правый отступ строки Today возвращён к 52px. E2E воспроизводил пересечение star/menu при 730–1920px; повторный набор responsive — 28/28 PASS.
- Общий scoped результат: 70 уникальных сценариев PASS, 2 штатных platform skips (из 72). Повторены только 28 layout-сценариев после исправления отступа; остальные успешные сценарии не перезапускались.
- Verify по этапам: typecheck PASS; lint PASS (существующее предупреждение fast-refresh); unit 1412 PASS + 1 skip; isolated infra 55/55 PASS после устранения конкурирующего запуска; alpha PASS; production build PASS.
- Полный format-check остаётся FAIL на предсуществующем `docs/design/references/2026-09-24-weekly-review/current-shell.html`. Файл старого weekly-прототипа не изменялся в этой задаче; весь verify не объявляется зелёным. Формат изменённых файлов проверен отдельно.
- Новый production preview обслуживается на 127.0.0.1:5173. Установщики Windows/Android не выпускаются и не устанавливаются.
- Нативные экраны требуют device QA: сборка Kotlin и unit-тесты не заменяют реальную камеру/клавиатуру/экран блокировки.
- Commit/push/release не выполнялись; посторонние dirty изменения сохранены.

- Финальный production browser: Today открыт в новой вкладке, console errors = []. Временный viewport сброшен.
- Локальный Prettier изменённых файлов и `git diff --check` — PASS.
- Итог: реализация завершена; общий repository gate не зелёный из-за указанного старого HTML, device QA остаётся ручным ограничением.
