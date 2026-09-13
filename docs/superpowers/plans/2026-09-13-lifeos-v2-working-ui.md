# План рабочего интерфейса V2

Контракт: [Рабочий интерфейс V2](../../design/features/2026-09-13-lifeos-v2-working-ui.md).
Реализация в текущей задаче; главный агент пишет код, исследователи/reviewers работают read-only.

- [x] Падающие тесты dated draft, atomic create goalId/date, планирования/главного на дату;
      минимальные расширения LifeAction/CreateLifeActionDraft и SetLifeActionPlan; целевой прогон.
- [x] Application query Today по plannedDate/completedAt без Session; тесты и реализация.
- [x] Тесты маршрутов и presentation submit; реализовать три V2 экрана, voice controls,
      ошибки/повтор/сохранение, default goalId и возможность поздней классификации.
- [x] Подключить отдельную оболочку V2, безопасный Back/Forward/rollback и переход из GoalCard.
- [x] Browser QA фактического пути, desktop 1600×900/1280×720 и mobile 390×844/360×800,
      keyboard/focus/overflow/console, сравнение с PDF и checklist №38.
- [x] Целевые проверки затронутых контрактов, read-only review и refinement.
- [x] Один npm run verify, git diff --check/stat/status, отчёт и остановка.

Во время разработки только целевые тесты. Полный Playwright/E2E и следующие представления
запрещены. Legacy completion/session и принятый Bridge не переделываются.

Результаты и ограничения: [контракт и отчёт](../../design/features/2026-09-13-lifeos-v2-working-ui.md).
