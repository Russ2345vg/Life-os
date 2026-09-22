# Хранение LifeOS в IndexedDB

## Текущая схема

База называется `lifeos`; версия схемы — `26`. Авторитетный список stores и upgrade-процедуры
находятся в `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`.

Рабочий runtime использует stores сфер, направлений, целей, действий, дней, периодов, вкладов,
повторений, баланса, входящих идей и расписания сна. Sync использует отдельные `sync_*` stores для
outbox, metadata, cursor, conflicts, devices, attachments, snapshots, quarantine и applied events.

## Совместимость существующих данных

Схема намеренно сохраняет stores прежних предметных процессов: decisions, sessions, routine,
walks, journal, projects, morning/evening и preparation records. Текущий UI и composition root их
не открывают как пользовательские сценарии. Они остаются для трёх задач:

1. обновление уже существующей базы без потери записей;
2. snapshot/recovery и синхронизация существующих объектов;
3. преобразование старых project/goal links в канонические Goal records.

Физическое удаление этих stores требует отдельной миграции данных и отдельного решения по
Supabase. Очистка интерфейса такую миграцию не выполняет.

## Транзакции и mappers

IndexedDB хранит records из `src/infrastructure/persistence/records`. Репозитории и sync adapters
преобразуют их через mappers. Application-команды владеют изменениями текущих сущностей;
presentation не обращается к базе напрямую.

Upgrade выполняется в одной IndexedDB version-change transaction. Ошибка должна прерывать
транзакцию целиком. Удалять store или поле без проверки пользовательских записей запрещено.
