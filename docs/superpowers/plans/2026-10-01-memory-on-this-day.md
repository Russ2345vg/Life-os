# «В этот день» — план реализации

1. Зафиксировать источник `memoryEvents`, текущие маршруты и дизайн-контракт в спецификации.
2. Добавить read-only запрос в `MemoryRepository` и IndexedDB-адаптер. Проверить даты, исключение удалённых и metadata фото на уровне persistence.
3. Открыть запрос через `MemoryQueries`/`MemoryServices`, не создавая второе предметное состояние.
4. Встроить компактный блок в страницу памяти, переиспользовать просмотр и ленивое фото. Проверить loading/empty/error/retry и мобильную композицию.
5. Выполнить targeted tests, `npm run verify`; при доступном браузере — scoped memory E2E и desktop/mobile QA. Для выпуска — отдельный R12 gate и release checks.
