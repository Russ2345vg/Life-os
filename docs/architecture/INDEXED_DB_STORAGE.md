# Хранение LifeOS в IndexedDB

## Схема версии 2

Браузерная база данных называется `lifeos` и открывается с версией `2`. В версии 1 создаются
четыре исходных object store, а обновление до версии 2 добавляет пятый object store с основным
ключом `id`:

- `days`;
- `decisions`;
- `lifeActions`;
- `actionSessions`.
- `routineBlocks`.

Версия базы и `schemaVersion` отдельной record решают разные задачи. Версия базы определяет
структуру object store и индексов, а `schemaVersion` определяет формат сериализованной сущности.

## Индексы

В версии 1 определены следующие индексы:

| Object store     | Индекс           | Поле           | Уникальный |
| ---------------- | ---------------- | -------------- | ---------- |
| `days`           | `byDate`         | `date`         | да         |
| `decisions`      | `byPlannedDate`  | `plannedDate`  | нет        |
| `lifeActions`    | `byPlannedDate`  | `plannedDate`  | нет        |
| `lifeActions`    | `byDecisionId`   | `decisionId`   | нет        |
| `actionSessions` | `byLifeActionId` | `lifeActionId` | нет        |
| `actionSessions` | `byStatus`       | `status`       | нет        |
| `routineBlocks`  | `byAnchorDate`   | `anchorDate`   | нет        |

`null` в необязательном индексируемом поле допустим. Такая запись сохраняется, но не получает ключ
в соответствующем индексе. Поэтому, например, черновик `Decision` без `plannedDate` доступен по `id`,
но не попадает в поиск по дате.

## Record mappers

IndexedDB хранит только records из `src/infrastructure/persistence/records`. Репозитории не
сохраняют предметные сущности напрямую:

- `save` сначала вызывает соответствующий mapper: `DayRecordMapper`, `DecisionRecordMapper`,
  `LifeActionRecordMapper`, `ActionSessionRecordMapper` или `RoutineBlockRecordMapper`;
- чтение вызывает соответствующий `fromRecord` после завершения транзакции;
- ошибки повреждённой record или неподдерживаемой `schemaVersion` передаются вызывающему коду без
  маскировки;
- восстановление через `rehydrate` не создаёт предметных событий.

## Границы транзакций

Каждая операция репозитория использует одну транзакцию одного object store. Чтение выполняется в
режиме `readonly`, сохранение через `put` — в режиме `readwrite`. Promise операции завершается
только после результата `IDBRequest` и события `complete` транзакции. `error` и `abort` отклоняют
операцию контролируемой инфраструктурной ошибкой.

Уникальный `days.byDate` обеспечивает один день на календарную дату. Нарушение ограничения
возвращает `persistence.constraint_violation`. Ошибки открытия и остальные ошибки транзакции
возвращают `persistence.database_open_failed` и `persistence.transaction_failed` соответственно.

## IndexedDB и InMemory-репозитории

`IndexedDbDayRepository`, `IndexedDbDecisionRepository`, `IndexedDbLifeActionRepository`,
`IndexedDbActionSessionRepository` и `IndexedDbRoutineBlockRepository` обеспечивают постоянное браузерное хранение и всегда
восстанавливают новые экземпляры сущностей из records. Подключение принадлежит `LifeOsIndexedDb`
и может быть явно закрыто методом `close`.

`IndexedDbLifeActionRepository` ищет действия по календарной дате через `byPlannedDate`, а по
связанному решению — через `byDecisionId`. Черновики без даты и действия без решения сохраняются и
доступны по `id`, но не попадают в соответствующие индексные выборки.

`IndexedDbActionSessionRepository` ищет историю действия через `byLifeActionId`. Метод
`findUnfinished` использует индекс `byStatus`: состояния `running` и `paused` считаются
незавершёнными, а `completed` игнорируется. Если хранилище содержит больше одной незавершённой
сессии, метод возвращает контролируемую ошибку `session.multiple_unfinished_detected`.

`RoutineBlockRecord` сохраняет назначение и только для `existingAction` — `actionId`. Старые
записи этапа 13.1 без поля `assignment` читаются как `reminder`; обновление версии базы для этого
не требуется, потому что структура object store и индексов не меняется.

InMemory-репозитории остаются быстрыми тестовыми адаптерами. Они хранят ссылки на сущности только в
памяти процесса и теряют состояние после перезапуска. Рабочий composition root открывает
`LifeOsIndexedDb`, создаёт пять IndexedDB-репозиториев и передаёт прикладные команды и запросы в
presentation через `LifeOsApplication`. React-компоненты не обращаются к IndexedDB напрямую.
