# Решения LifeOS для Codex

Этот файл — краткий индекс утверждённых решений, а не журнал идей. Полный контекст и последствия
хранятся в `docs/decisions/ADR-*.md`. Новое решение добавляется сюда только после его утверждения
и появления отдельного ADR, если решение архитектурно значимо.

| Решение                                                                  | Канонический источник                        |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| Независимые слои Domain, Application, Infrastructure, Presentation и App | `ADR-0001-clean-independent-architecture.md` |
| Предметное состояние изменяют application-команды                        | `docs/architecture/ARCHITECTURE.md`          |
| На одну дату допускается не более трёх активных главных решений          | `ADR-0004-main-decision-limit.md`            |
| `LifeAction` может быть связан с `Decision`; связь хранится в действии   | `ADR-0006-life-action-decision-link.md`      |
| В системе допускается одна незавершённая `ActionSession`                 | `ADR-0010-single-unfinished-session.md`      |
| Persistence использует сериализуемые records и отдельные mappers         | `ADR-0012-persistence-record-format.md`      |
| Основные разделы объединены `ApplicationShell`                           | `ADR-0023-application-navigation-shell.md`   |
| Хронология результатов является read-only представлением                 | `ADR-0025-read-only-history-timeline.md`     |
| Настройки интерфейса хранятся локально и не являются domain-state        | `ADR-0026-local-interface-settings.md`       |
| Текущий день запускается явным пользовательским действием                | `ADR-0027-explicit-day-start.md`             |
| Экран дня использует единую presentation-модель состояний                | `ADR-0029-today-screen-state-model.md`       |

Если краткая формулировка расходится с ADR или кодом, остановись и проверь историю изменения до
реализации.
