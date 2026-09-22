# Goal unification Implementation Plan

**Goal:** заменить пользовательские проекты единым альбомом целей с сохранением данных.
**Architecture:** goals — единственный источник; project-порты — совместимые проекции.
**Tech Stack:** существующие TypeScript, React, IndexedDB, encrypted sync.
**Spec:** [Дизайн-контракт](../../design/features/2026-09-08-goal-unification.md).

Изменения выполняет главный агент в текущем dirty worktree; исходные правки сохранены отдельно.
Никаких push, удалений пользовательских данных или удалённых DDL.

- [x] Добавить падающие integration tests: две сущности с одинаковым ID/названием,
      связи решения, повторное открытие, legacy replay и rollback.
- [x] Расширить Goal и mapper полями sphereId/isMain/legacyProjectId и статусом paused.
      Project compatibility mapper объединяет старые поля с существующей GoalRecord.
- [x] IndexedDB upgrade: отдельный backup store, атомарный перенос и перевод ссылок.
      Legacy ingress в транзакционном адаптере повторно использует стабильный ID и fence версии.
- [x] Перевести IndexedDbProjectRepository и journal UoW на goals, сохранив optimistic locking.
- [x] Обновить sync references/recovery и старые ссылки; проверить старый импорт и отсутствие дублей.
- [x] Убрать ProjectsSection из навигации, открыть goal detail из всех связей.
      В альбоме добавить отсутствующие команды управления и связанные действия.
- [x] Заменить видимую терминологию по смыслу; сохранить компоненты и responsive.
- [ ] Targeted tests → test:fast → verify → полный E2E (persistence и routing меняются).
- [ ] Browser QA desktop/mobile, независимый read-only review, diff/status и отчёт.

## Передача пользователю

По просьбе пользователя от 08.09.2026 дальнейшие проверки остановлены.
До остановки: scoped suite 204 tests PASS; ранее fast suite 1645 tests PASS.
Последняя правка формы приостановленной цели без направления не прогонялась.
Browser QA: создание цели и связанного решения, reload, альбом на 1440 и 390 px;
ошибок в проверенной browser console нет. Новый E2E ещё не прошёл целиком: исправлены
селекторы двух одноимённых ссылок и поля цели, повторный прогон отменён пользователем.
Финальные verify и полный E2E не выполнялись. Финальная готовность по gate не заявляется.
