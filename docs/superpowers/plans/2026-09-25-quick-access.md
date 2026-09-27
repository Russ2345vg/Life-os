# Быстрый доступ — план реализации

> Execute inline in the active worktree. Main agent owns edits; supporting review is read-only.

**Goal:** найти запись, создать действие или изменить дату из текущего экрана, сохраняя его черновик.

**Architecture:** существующие application readers → агрегирующая query → правая панель
Presentation; создание и планирование через существующие commands. Локальный реестр dirty/busy
не содержит предметных данных. Навигация остаётся прежней.

**Authorization:** 25.09.2026 пользователь поручил внедрить предложенный «Быстрый доступ».
Выбранное размещение — справа; общая тема Premium. Не присваивать макету APPROVED/LOCKED.

## 1. Query и контракт поиска

- Добавить `src/application/planner/QuickAccessCatalog.ts` и targeted tests.
- Проверить архив, состояния, контекст, ё/е, все слова, порядок, ограничение 30 записей,
  один фактический экземпляр повторения, доступность смены даты и отказ отдельного reader.

## 2. Контекст и панель

- Добавить presentation context для открытия и dirty/busy readers.
- Добавить правую панель с поиском, созданием, датами, retry, сообщениями результата.
- Переиспользовать PlannerSheet, VoiceTextInput, AppIcon и submission helpers.
- Защитить команды от двойного отправления, чтения от устаревших ответов.

## 3. Интеграция

- Подключить видимый trigger, Ctrl/Cmd+K и trigger поверх открытого editor sheet.
- Перечитывать данные после команды и sync без remount фонового экрана.
- Зарегистрировать владельцев черновиков локальными boolean readers; перед переходом
  проверить busy и предложить остаться при dirty. Не копировать секреты в общий context.

## 4. Проверки и handoff

- Targeted query/render/integration tests.
- Scoped E2E: desktop/mobile, существующая форма под панелью, создание, дата, ошибки,
  фокус/Escape, account/sleep, клавиатура/IME и повторы.
- Реальный browser review относительно текущей Premium темы и right-panel reference.
- После стабилизации один `npm run verify`, diff check, read-only review.
- Полный E2E не нужен, если scoped проверки подтверждают границы overlay и старые маршруты
  не меняются. GitHub publication не входит в эту задачу.
