# V2 Inbox, Focus and Lists Implementation Plan

**Goal:** реализовать разрешённый блок на текущем V2 baseline до проверенного результата.
**Architecture:** UI → application commands/queries → существующие Goal/LifeAction и новые
InboxIdea/FocusPeriod. IndexedDB adapter обеспечивает атомарность и существующую sync capture.
**Tech Stack:** текущие TypeScript, React, IndexedDB, Vitest; без новых зависимостей.
**Spec:** [контракт](../../design/features/2026-09-13-v2-inbox-focus-lists.md).

Главный агент — единственный автор. Read-only архитектурный и итоговый review независимы.
Проверки разработки ограничены затронутыми файлами. E2E запрещён.

- [x] InboxIdea/FocusPeriod: валидация, application порт, команды и атомарное хранение.
      Проверить title-only, обе конверсии, повтор/гонку, rollback, роли без изменения Goal.
- [x] Добавить коллекции в существующие IndexedDB upgrade, sync registry/adapters и fixtures.
      Проверить roundtrip/relationships/recovery и сохранность старых записей.
- [x] Queries списков: все записи, поиск, фильтры, next action, реальный прогресс.
      Проверить отсутствие направления/цели/даты и неизменность completion при поздней связи.
- [x] V2 страницы и navigation: Inbox, Goal list/focus, Action list/detail. Переиспользовать
      voice fields, формы и команды. Render/route проверки loading/empty/error/pending и контекста.
- [x] Desktop/mobile browser QA, independent diff review, scoped format, verify.
      Финальный отчёт: файлы, проверки, diff stat, ручная QA, ограничения; затем остановиться.

Результат: 19 целевых файлов / 119 тестов прошли. Первый `npm run verify` завершился
с кодом 1 на lint временного служебного скрипта; скрипт вынесен из репозитория. По новому
запросу пользователя свежий `npm run verify` завершился с кодом 0: типы, lint, 3385
unit/integration, 55 infra, 1 alpha, build, format и Git hygiene. Полного E2E не было.
Browser QA: 1440, 390 и 360 px;
свежая загрузка Фокуса без ошибок и предупреждений консоли. Физические устройства и обмен
между двумя обновлёнными клиентами требуют ручной проверки.
