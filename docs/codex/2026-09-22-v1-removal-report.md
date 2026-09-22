# Удаление LifeOS V1 — технический отчёт

## Безопасная точка возврата

Состояние до очистки сохранено коммитом `cf22184` (`chore: snapshot LifeOS V2 before V1 removal`).
История Git не переписывалась.

## Что было найдено

V1 присутствовал как отдельная shell/navigation ветка, страницы Today/Morning/Evening/Routine/
Walks/History/Management, глобальные voice commands, update/sync panels, browser stores,
application-команды и queries, IndexedDB adapters, стили, demo seed, unit/integration/E2E tests и
fixtures. Текущий planner использовал часть общих domain records, IndexedDB schema, sync registry,
settings payload и goal migration.

## Что удалено

- V1 shell, маршруты, переходы и кнопка возврата;
- старые страницы, layouts, presentation models, dialogs и стили;
- утренние, вечерние, routine, walk, session и старые voice-command application-сценарии;
- adapters и in-memory repositories, которые использовались только этими сценариями;
- V1 tests, browser fixtures, demo seed и устаревшие E2E;
- browser preference keys старой оболочки из active local-storage policy;
- недостижимые exports и импорты.

## Что оставлено

Planner, balance, sleep, voice text input, Supabase, auth/sync runtime, IndexedDB schema и текущая
модель «Сферы → Направления → Цели → Действия» сохранены. Старые object stores, records, mappers,
sync registrations и migration aliases оставлены как слой совместимости пользовательских данных.
Они не создают экранов, маршрутов или application API.

## Данные и Supabase

Данные не удалялись и Supabase schema не менялась. Автоматически безопасно удалить из runtime
оказались только старые UI preference keys; значения в браузере не стираются, policy просто больше
не синхронизирует их.

Отдельной миграции требуют:

- физическое удаление старых IndexedDB stores;
- удаление соответствующих sync entity types или Supabase rows;
- переименование `lifeos.local-settings.v1`, `lifeos-sync-pair-v1` или `/storage/v1/`.

До инвентаризации пользовательских данных эти действия выполнять нельзя.

## Остаточная совместимость

Слова `legacy`/`v1` остаются только в migration, record normalization, sync protocol tests и
версированных storage keys. Это метки формата сохранённых данных, а не переключатели приложения.
Стабильные URL текущего интерфейса сохраняют `#/v2`, чтобы не ломать прямые ссылки V2.
