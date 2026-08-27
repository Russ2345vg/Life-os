# WALK-04 — завершение прогулки и возвращение

## Цель и границы

Добавить к принятому WALK-03.1 короткий поток завершения: подтвердить завершение активной прогулки, зафиксировать фактическое время, собрать минимальный результат и показать безопасное возвращение к следующему разделу. WALK-04 не добавляет аналитику, графики, голос, GPS, карты, фото, отдельную систему заметок, рекомендации или автоматические изменения Routine, Decision, Goal и других внешних сущностей.

## Авторитетная модель и поток зависимостей

`Walk` остаётся единственным aggregate прогулочной сессии. Существующий `CompleteWalk` остаётся единственным механизмом перехода активной прогулки в `completed`; новый session/completion engine и новая сущность `WalkResult` не создаются.

Зависимости сохраняют направление `UI → Presentation → Application → Domain`, а Infrastructure только реализует существующий `WalkRepository`. React не изменяет предметное состояние и не пишет в IndexedDB напрямую.

## Последовательность завершения

Поток состоит из трёх коротких этапов:

1. Active Walk показывает компактное подтверждение «Завершить прогулку?».
2. Подтверждение вызывает существующий `CompleteWalk`, который сразу сохраняет `status = completed` и `endedAt`. Поэтому время заполнения последующей формы не входит в фактическую длительность.
3. Quick completion сохраняет результат в том же завершённом `Walk`, затем открывает экран «Что дальше?».

Если `CompleteWalk` завершается ошибкой, пользователь остаётся на active screen. Если сохранение результата завершается ошибкой, quick completion остаётся открытым с введёнными значениями. Между этими операциями Walk уже безопасно завершён. Отдельный persistence-механизм для восстановления незаполненной формы после reload в WALK-04 не создаётся: старый или частично заполненный completed Walk остаётся валидным с nullable outcome-полями.

## Доменная модель результата

В существующий `Walk` добавляется nullable-поле `impact` со значениями:

- `better` — «Лучше»;
- `same` — «Так же»;
- `worse` — «Хуже».

Уже существующий `afterState` хранит три оценки `energy`, `tension` и `clarity` в диапазоне 0–10. Уже существующий `result` хранит нормализованный необязательный reflection-текст; отдельное поле или Notes subsystem не создаётся.

Доменный метод записи результата принимает обязательные `afterState` и `impact`, необязательный reflection и `updatedAt`. Метод разрешён только для `completed` Walk, не меняет `endedAt`, интервалы пауз или фактическую длительность и увеличивает `version`.

Существующие completed Walk без `impact` и `afterState` остаются корректными. Abandoned, planned, running и paused Walk не получают completion outcome.

## Application-команда

Новая команда `RecordWalkOutcome`:

- загружает Walk по `walkId`;
- проверяет, что он завершён;
- вызывает доменный метод записи результата;
- сохраняет новую версию через `updateIfVersionMatches`;
- возвращает стандартные ошибки `not_found`, `not_completed`, `outcome_already_recorded` и `version_conflict` без скрытых повторов.

`CompleteWalk` не дублируется и не получает presentation-время. Источником `endedAt` остаётся application `Clock`.

`CreateWalk` принимает уже существующие optional `linkedEntity` и `returnContext` и передаёт их в `Walk.create`, чтобы заложенный контракт не терялся на application-границе. Текущий Walk Center продолжает создавать прогулки без контекста.

## Persistence и обратная совместимость

`WalkRecord` получает optional nullable `impact`. Текущая `schemaVersion: 1` сохраняется, поскольку поле добавляется обратно совместимо. Mapper:

- записывает `impact` для новых Walk;
- читает отсутствующее поле старой записи как `null`;
- отклоняет неизвестное значение `impact`;
- продолжает читать существующие nullable `afterState` и `result`.

Обе операции — первоначальный `CompleteWalk` и последующая запись outcome — используют тот же `WalkRepository` и optimistic version check. Второй store, repository или session engine не создаётся.

## Quick completion UI

После успешного `CompleteWalk` страница удерживает возвращённый completed Walk и показывает компактный `WalkQuickCompletionPanel` в визуальном языке WALK-03.1.

Панель содержит:

- режим прогулки;
- фактическую длительность;
- время начала и завершения;
- read-only `beforeState`, если оно было указано;
- обязательные sliders `energy`, `tension`, `clarity`, инициализированные значениями beforeState либо нейтральным значением 5;
- обязательный segmented choice «Как прогулка повлияла?» без предварительного выбора;
- необязательный короткий textarea: «Что стало понятнее?» для reflection intent и «Что изменилось?» для остальных режимов;
- одну основную CTA «Сохранить итог».

Форма не содержит фото, длинной анкеты или аналитики. Повторная отправка блокируется существующим `WalkSubmissionGuard`.

## Reentry / «Что дальше?»

После успешного `RecordWalkOutcome` открывается компактный `WalkReentryPanel` с подтверждением завершения, одной основной CTA и не более чем одним вторичным действием.

Если `returnContext` существует, экран показывает человекочитаемый источник и optional `nextStep`. Основное действие возвращает в соответствующий существующий раздел:

- `walks` → Walk Center;
- `today` → Сегодня;
- `decision` → Решения;
- `routine` → Распорядок;
- `lifeAction` → Действия;
- `goal` или `project` → Управление.

Идентификатор связанной сущности не выводится как пользовательский текст и не используется для скрытого обновления. Если контекста нет, основное действие возвращает в Walk Center, вторичное — на экран «Сегодня».

## Presentation state и навигация

Локальные фазы `WalksPage` расширяются значениями `completion` и `reentry`. Completed Walk хранится только как presentation-состояние текущего открытого потока. Переходы в другие разделы выполняются callback-ами от `ApplicationShell`; Presentation не импортирует app navigation state и не обращается к Infrastructure.

Навигация не изменяет Routine, Decision, Goal, Project или LifeAction. WALK-04 только показывает существующий `returnContext` и выбирает существующий раздел назначения.

## Responsive и accessibility

Desktop проверяется при 1366×768, mobile — при 390×844 и 360×800. Quick completion и reentry не имеют horizontal overflow и не перекрываются нижней навигацией. Интерактивные элементы имеют touch-target не меньше 44 px, корректные labels, keyboard focus, `aria-live` для ошибок/успеха и поддержку `prefers-reduced-motion`.

## TDD и проверки

RED → GREEN покрывает:

1. `CompleteWalk` переводит Walk в completed и сохраняет `endedAt`;
2. `RecordWalkOutcome` сохраняет `afterState`, `impact` и optional reflection без изменения `endedAt`;
3. mapper/repository восстанавливают новые поля и старые записи без них;
4. composition сохраняет completion после повторного открытия IndexedDB;
5. quick completion открывается после подтверждённого завершения;
6. reentry открывается после успешного сохранения результата;
7. `returnContext` отображается и маршрутизируется без внешних записей;
8. fallback предлагает Walk Center и Сегодня;
9. desktop/mobile flow не имеет критического overflow или конфликта с навигацией.

Browser QA проходит полный сценарий с ожиданием не менее 10 секунд и сохраняет screenshots active, quick completion и reentry для desktop и mobile.

Финальный gate: целевые Walk tests, persistence/composition tests, `npm run test:alpha`, `npm run verify`, Playwright desktop/mobile и `git diff --check`.
