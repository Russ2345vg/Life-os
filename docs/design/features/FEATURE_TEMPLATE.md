# LifeOS Feature Design Specification

## Status

- Design: `DRAFT | CONTRACT DEFINED | APPROVED`
- Implementation: `NOT STARTED | IN PROGRESS | COMPLETE`
- Visual review: `NOT REQUIRED | PENDING | APPROVED`
- Lock: `UNLOCKED | LOCKED`

`APPROVED` и `LOCKED` допустимы только после явного утверждения пользователем, если для функции
предусмотрен visual review.

## Feature

Название и краткое описание функции. Указать тип изменения: новый раздел, новая страница, новый
пользовательский сценарий, новая функция существующей страницы, новый UI-компонент или изменение
только бизнес-логики без нового UI.

## User goal

Какой наблюдаемый пользовательский результат должна дать функция и какой основной сценарий она
поддерживает.

## Existing logic to preserve

Авторитетный источник состояния, существующие domain/application-контракты, связанные функции и
поведение, которые нельзя изменить без отдельного требования.

## Section

Раздел LifeOS, к которому относится функция.

## Accent

Section accent из утверждённой палитры LifeOS и его семантическая роль.

## Atmosphere

Атмосферный мотив раздела, его интенсивность и ограничения. Для изменения без UI указать
`Not applicable`.

## Page archetype

Утверждённый page/component archetype из `LifeOS_DESIGN_RULES_v1.md` или обоснование уникальной
композиции.

## Main visual center

Единственный главный визуальный объект или действие страницы. Для изменения без UI указать
`Not applicable`.

## Layout

Структура страницы или компонента, иерархия блоков, desktop/tablet-сетка и поведение временных
слоёв.

## Components to reuse

Существующие shared components, design tokens, patterns и icons. Отдельно зафиксировать результат
проверки на дубликаты до создания нового компонента.

## States

- Loading:
- Empty:
- Error / retry:
- Success feedback:
- Disabled:
- Interactive states: default / hover / pressed / selected / focus.

## Mobile

Как композиция перестраивается на mobile, порядок контента, доступность главного действия,
touch-zones и допустимость горизонтального скролла.

## Accessibility

Keyboard/focus, контраст, текстовые обозначения состояний, reduced motion, labels/tooltips и
альтернативы drag & drop.

## Approved references

- Required: `YES | NO`
- Reference/link:
- Approval owner:
- Approval status: `NOT REQUIRED | PENDING | APPROVED`
- Rationale:

## Business logic constraints

Какие бизнес-правила, данные, команды, queries, persistence-контракты и пользовательские данные
нельзя менять ради визуального оформления.

## Test scope

Targeted/scoped tests, проверяемые состояния и контракты. Для значимой UI-задачи также указать
desktop/mobile viewports, browser console, keyboard/focus, visual review и чек-лист Правила №38.
Full regression включать только по общей testing strategy.

## Definition of Done

- [ ] Дизайн-контракт определён до реализации.
- [ ] Существующая логика и авторитетный источник состояния сохранены.
- [ ] Проверены shared components и design tokens; дубликаты не созданы.
- [ ] Реализованы обязательные loading / empty / error / success состояния.
- [ ] Выполнены targeted/scoped tests.
- [ ] Для значимой UI-задачи выполнены desktop/mobile и visual review.
- [ ] Пройден чек-лист Правила №38.
- [ ] Accessibility-требования проверены.
- [ ] Approved reference получен, если он обязателен.
- [ ] Пользователь явно утвердил визуальный результат до статуса `APPROVED`/`LOCKED`, если visual
      review предусмотрен.
