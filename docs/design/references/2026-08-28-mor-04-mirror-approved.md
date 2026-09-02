# MOR-04 Mirror — Approved Visual Reference

## Status

- Approval: `APPROVED`
- Approval owner: пользователь LifeOS
- Approval date: 28 августа 2026
- Implementation status: `NOT STARTED`
- Lock: `UNLOCKED`

## Reference source

Пользователь утвердил интерактивный mockup MOR-04 в Codex conversation. Исходный mockup сохранён
в thread-owned visualization:

`C:\Users\Руслан\.codex\visualizations\2026\08\27\01a04349-45ff-72b2-89e8-aa67aeb9c096\mor-04-mirror-reference.html`

Этот документ является durable repository record утверждённых визуальных решений. Product
implementation сравнивается с mockup и требованиями ниже; статус реального экрана остаётся
неутверждённым до отдельного post-implementation visual review.

## Approved desktop composition

- существующий тёмный LifeOS shell с активным разделом `Распорядок`;
- Back control `Утренний центр`;
- eyebrow `РАСПОРЯДОК · УТРО`;
- page title `Настрой перед зеркалом`;
- compact time estimate `≈ 5 мин`;
- горизонтальный путь из пяти этапов;
- Quick Start и Physical отмечены зелёным как завершённые;
- Mirror получает янтарный current marker;
- Main Action и Work Block приглушены;
- одна крупная центрированная graphite focus surface;
- тонкая янтарная металлическая кромка и локальный свет без full-card neon;
- primary CTA занимает заметную, но не чрезмерную ширину внутри surface.

## Approved mobile composition

- shell перестраивается в одну колонку;
- нижняя LifeOS navigation остаётся видимой;
- путь превращается в пять компактных markers;
- focus surface занимает основную ширину;
- CTA находится над нижней navigation и safe area;
- нет горизонтального scroll или сжатой desktop-сетки;
- заголовок, инструкция и вопрос сохраняют приоритет и читаемость.

## Approved copy

- Page title: `Настрой перед зеркалом`.
- Subtitle: `Короткая настройка внимания перед главным действием дня.`
- Focus title: `Собери внимание`.
- Instruction: `Посмотри на себя и одним предложением назови, на чём сегодня будет твой главный фокус.`
- Question: `Что я начинаю первым — и почему это важно сегодня?`
- Privacy note: `Ответ не нужно записывать. Достаточно произнести его вслух или сформулировать про себя.`
- Primary CTA: `Завершить настрой`.
- Transition note: `После завершения текущим станет этап «Главное действие».`

## Approved states

### Current

Янтарный current marker, focus icon, approved practice and one primary CTA.

### Success

- green confirmed marker;
- `НАСТРОЙ ЗАВЕРШЁН`;
- `Фокус определён`;
- `Главное действие стало текущим этапом утра.`;
- Main Action становится текущим в stage path.

### Error

- calm inline red error surface;
- `Не удалось сохранить завершение.`;
- `Проверь соединение и повтори действие.`;
- primary recovery action `Повторить`.

### Historical read-only

- green completion fact with `Завершено в HH:MM`;
- explanation that answer content was not stored;
- lock icon and `Исторический день доступен только для просмотра`;
- no mutating CTA.

## Visual tokens

- canvas: graphite / near-black;
- section accent: Routine amber `#C88A42` through semantic token;
- success: Design System green;
- danger: Design System red;
- primary text: milk-white;
- secondary text: cool gray;
- radius: large/xlarge only for the dominant surface;
- glow: local and low-opacity;
- atmosphere: subtle rhythmic/symmetrical lines.

## Explicit exclusions

- no camera, selfie, video or literal digital mirror;
- no text input or saved answer;
- no timer/countdown;
- no mood score, affirmations library, history, analytics or recommendations;
- no multiple primary actions;
- no purple accent, strong neon or decorative glass everywhere.

## Reference QA evidence

Перед утверждением mockup был проверен в rendered browser state:

- desktop composition;
- mobile composition;
- current, success, error and read-only variants;
- mobile frame: `scrollWidth === clientWidth`;
- desktop frame: `scrollWidth === clientWidth`;
- browser console: no warning/error entries.

Это evidence относится только к reference mockup, не к будущей product implementation.
