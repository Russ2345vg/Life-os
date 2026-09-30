# Холодный душ — browser evidence

Маршрут `#/v2/today`, активный `D:/LifeOS-App`. Новые Chrome contexts с синтетическими данными;
пользовательские данные не менялись. Снимки показывают реализацию, не имеют статуса APPROVED.

- [Исходный desktop](baseline-today-desktop.png), [исходный mobile](baseline-today-mobile.png).
- [Пустой блок, desktop](result-empty-desktop.png), [пустой блок, mobile](result-empty-mobile.png).
- [История, desktop](result-history-desktop.png), [390 px](result-history-390.png), [360 px](result-history-360.png).

Проверены 1440×900, 390×844, 360×844 и 360×800. В календаре минимальная ширина кнопок 48.56 px при 390 px
и 44.28 px при 360 px, высота 44 px. Горизонтального overflow нет. Enter раскрывает секцию
исправления, `:focus-visible` имеет solid outline. Reduced-motion media применяется. Console и
pageerror в основном сценарии пусты.

## Правило №38

- Иерархия: в компактном блоке одна основная отметка; история и оценки раскрываются по запросу.
- Цвет: graphite/jade текущего cascade; подтверждённое выполнение зелёное, ошибка красная;
  календарные статусы дополнительно обозначены ✓/−/текстом.
- Поверхности: существующие токены радиуса, отступов, поля/кнопки. Нет нового фона, декора или glow.
- Состояния: loading/retry покрыты render tests; empty/success/busy/failure/retry — browser tests.
- Mobile: формы становятся одной колонкой, все календарные touch targets ≥44 px; fixed nav
  допускает прокрутку к любому содержимому блока.
- Доступность: labelled section/forms/selects/buttons, keyboard-focus, disabled future dates,
  текстовые status/alert и отсутствие новых обязательных анимаций.
- Монохром: выбранный день имеет outline и aria-pressed, результат читается текстом и символом.

Scoped E2E покрывает отметку/самочувствие, прошлый день, пропуск/исправление, reload, счётчики,
future-disabled, размеры/overflow и ошибку сохранения с сохранением draft. Дополнительный
регрессионный сценарий проверяет исправление при фиксированном timestamp.
