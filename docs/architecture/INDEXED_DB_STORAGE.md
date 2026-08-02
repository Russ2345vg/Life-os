# Хранение LifeOS в IndexedDB

## Схема версии 1

Браузерная база данных называется `lifeos` и открывается с версией `1`. При первом открытии
создаются сразу четыре object store с основным ключом `id`:

- `days`;
- `decisions`;
- `lifeActions`;
- `actionSessions`.

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

`null` в необязательном индексируемом поле допустим. Такая запись сохраняется, но не получает ключ
в соответствующем индексе. Поэтому, например, черновик `Decision` без `plannedDate` доступен по `id`,
но не попадает в поиск по дате.

## Record mappers

IndexedDB хранит только records из `src/infrastructure/persistence/records`. Репозитории не
сохраняют предметные сущности напрямую:

- `save` сначала вызывает `DayRecordMapper.toRecord` или `DecisionRecordMapper.toRecord`;
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

`IndexedDbDayRepository` и `IndexedDbDecisionRepository` обеспечивают постоянное браузерное
хранение и всегда восстанавливают новые экземпляры сущностей из records. Подключение принадлежит
`LifeOsIndexedDb` и может быть явно закрыто методом `close`.

InMemory-репозитории остаются быстрыми тестовыми адаптерами. Они хранят ссылки на сущности только в
памяти процесса и теряют состояние после перезапуска. IndexedDB-адаптеры на этом этапе не
подключены к React-приложению; репозитории `LifeAction` и `ActionSession` будут реализованы отдельным
этапом.
