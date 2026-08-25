# WALK-05 — режим прогулки «Размышление»

## Цель и границы

Развить уже существующий минимальный reflection intent в лёгкий сопровождаемый сценарий: перед прогулкой пользователь задаёт один основной вопрос и выбирает шаблон, а во время активной сессии видит не более одного текущего этапа и сам решает, когда перейти дальше или отключить сопровождение.

WALK-05 не добавляет ответы на этапы, WalkCapture, Inbox, заметки, голос, фото, GPS, рекомендации, новые outcome-типы или автоматические изменения Decision, Goal, Project, Routine и LifeAction. Существующие WALK-04 quick completion и reentry остаются без изменений.

## Выбранный подход

Reflection-конфигурация и текущий этап становятся nullable-полями существующего `Walk`. Продвижение выполняется доменными методами через application-команды и сохраняется тем же `WalkRepository`.

Отклонены два альтернативных подхода:

1. Хранить выбранный шаблон и текущий этап только в React. Это проще визуально, но состояние потеряется после reload и создаст второй источник предметного состояния.
2. Создать отдельный `WalkReflectionSession` aggregate и отдельный persistence engine. Это дублирует lifecycle существующего `Walk` и нарушает принятый контракт WALK-01—04.

## Авторитетная модель и зависимости

`Walk` остаётся единственным execution aggregate прогулки. Новая конфигурация reflection не получает собственного repository или store.

Направление зависимостей сохраняется:

`UI → Presentation → Application → Domain`

Infrastructure расширяет только существующие `WalkRecord`, `WalkRecordMapper` и реализации `WalkRepository`. React вызывает application-команды и не изменяет предметный cursor напрямую.

Существующий Evening Reflection subsystem не переиспользуется как engine: он принадлежит lifecycle вечернего цикла, генерирует вопросы из другого контекста и имеет другой persistence contract. WALK-05 использует только общие архитектурные принципы — детерминированный набор вопросов, явный cursor и восстановление после reload.

## Reflection-шаблоны

Поддерживаются пять стабильных идентификаторов:

- `decision` — принятие решения;
- `problem` — разбор проблемы;
- `goal` — обдумывание цели;
- `strategy` — стратегическое размышление;
- `freeThought` — свободное размышление без этапов.

Шаблоны с сопровождением содержат по пять стабильных stage identifiers в порядке исходного продуктового контракта:

- decision: facts → assumptions → options → choiceCost → smallestTest;
- problem: situation → rootCause → constraints → changeOptions → nextExperiment;
- goal: currentPosition → desiredResult → mainObstacle → nearestLever → nextStep;
- strategy: context → constraint → priority → sacrifice → mainResult.

Domain хранит идентификаторы, порядок и допустимость этапов. Presentation содержит русские названия, краткие описания и текст текущего вопроса. Это не позволяет UI самостоятельно определять порядок, но не связывает domain с экранными формулировками.

`freeThought` не создаёт stage cursor: активный экран показывает только основной вопрос прогулки.

## Изменения существующего Walk

В `Walk` добавляются обратно совместимые nullable-поля:

- `reflectionTemplate: WalkReflectionTemplate | null`;
- `reflectionStage: WalkReflectionStage | null`.

Правила:

1. Не-reflection Walk всегда имеет оба поля `null`.
2. Новый reflection Walk получает выбранный template; если пользователь ничего не менял, используется `freeThought`.
3. Planned reflection Walk может иметь template и `reflectionStage = null`.
4. При старте guided template получает первый допустимый stage; `freeThought` остаётся без stage.
5. Running или paused reflection Walk может перейти только к следующему stage своего template.
6. Переход с последнего stage завершает сопровождение и устанавливает `reflectionStage = null`, но не завершает прогулку.
7. Отключение сопровождения также устанавливает `reflectionStage = null` и не меняет основной `reflectionQuestion`.
8. Продвижение не сохраняет текстовый ответ и не создаёт внешнюю сущность.
9. Каждое фактическое изменение stage увеличивает `version` и обновляет `updatedAt`; `startedAt`, интервалы пауз и elapsed duration не меняются.

Старые Walk без новых полей rehydrate-ятся с `null`. Старый активный reflection Walk без template продолжает показывать свой `reflectionQuestion` как свободное размышление и не получает ошибочный stage.

## Подготовка и запуск

`WalkPreparationDraft` и `CreateWalk` получают optional reflection template. Поле используется только при `intent = reflection`; для free и recovery оно не отображается и не передаётся.

Reflection preparation содержит:

- одно необязательное текстовое поле «Вопрос для размышления»;
- compact selector из пяти шаблонов;
- `freeThought` выбран по умолчанию;
- при выборе guided template — короткий read-only preview названий этапов;
- существующую длительность и optional beforeState.

Основной вопрос остаётся необязательным ради быстрого запуска. Если пользователь оставляет поле пустым, существующий локальный question picker формирует один fallback-вопрос. Шаблон не генерирует дополнительный главный вопрос и не меняет пользовательский текст.

## Application-команды

Две небольшие команды используют существующий optimistic update:

### `AdvanceWalkReflectionStage`

- загружает Walk по `walkId`;
- вызывает доменный переход к следующему этапу;
- сохраняет через `updateIfVersionMatches`;
- возвращает обновлённый Walk либо стандартные `not_found`, domain или `version_conflict` ошибки.

### `DisableWalkReflectionGuidance`

- загружает Walk;
- отключает stage guidance доменным методом;
- сохраняет новую версию тем же способом;
- не завершает и не ставит прогулку на паузу.

Команды не выполняют скрытые retry и не обращаются к Decision, Goal, Routine или другому aggregate.

## Persistence и backward compatibility

`WalkRecord` получает optional nullable строки `reflectionTemplate` и `reflectionStage`. `schemaVersion: 1` сохраняется, поскольку новые поля optional и старые записи остаются валидными.

Mapper:

- пишет оба поля для новых Walk;
- читает отсутствие полей как `null`;
- проверяет известный template и stage;
- передаёт комбинацию в domain, где проверяется соответствие stage выбранному template;
- не меняет существующие timestamps, outcome и return context.

IndexedDB repository продолжает использовать store `walks`; миграция базы, новый object store или отдельный repository не нужны.

## Active reflection UI

Существующий `WalkActivePanel` сохраняет крупный timer, режим, основной вопрос, pause и completion controls.

Для guided reflection дополнительно показывается одна компактная guidance card:

- шаблон;
- «Этап N из 5»;
- один текущий stage prompt;
- основная кнопка «Следующий этап»;
- вторичная команда «Без сопровождения».

После последнего этапа основная кнопка называется «Завершить сопровождение». Она скрывает guidance card, но активная прогулка продолжается. Никакого автоматического переключения по таймеру нет.

Free, recovery, legacy reflection и `freeThought` не показывают stage controls. Они продолжают использовать уже существующий focus block.

При ошибке сохранения текущий stage остаётся видимым, а ошибка показывается рядом с controls. Двойная отправка блокируется существующим `WalkSubmissionGuard`. После успешного перехода текущий prompt обновляется с `aria-live="polite"`; фокус остаётся на предсказуемом control и не переносится неожиданно по экрану.

## Reload, pause и completion

Stage cursor восстанавливается вместе с active Walk через существующий `GetActiveWalk`. Reload не создаёт новую прогулку и не сбрасывает шаблон.

Pause/resume не меняют reflection template или stage. Guided controls остаются доступными только в active panel и не влияют на elapsed duration.

Complete, quick completion и reentry используют существующий WALK-04 flow. Завершение сохраняет последний template/stage как исторический контекст, но не требует пройти все этапы и не добавляет вопросов в completion form.

## Responsive и accessibility

Desktop проверяется при 1366×768, mobile — при 390×844 и 360×800. Template selector и stage preview переходят в одну колонку на узких экранах. Active guidance card не создаёт horizontal overflow, а controls имеют touch target не меньше 44 px и не перекрываются мобильной навигацией.

Selector использует native radio semantics, preview — семантический ordered list, текущий этап — heading/region с понятной подписью. Keyboard и visible focus работают без специальных pointer-only действий. Анимации не обязательны; существующий `prefers-reduced-motion` соблюдается.

## TDD и проверки

RED → GREEN покрывает:

1. допустимые reflection templates и стабильный порядок stages;
2. создание reflection Walk с template и запрет template для других intents;
3. инициализацию первого stage при start;
4. ручное продвижение, последний stage и отключение guidance;
5. запрет stage-команд для неподходящего Walk;
6. optimistic conflict и отсутствие скрытых retry;
7. mapper/repository round-trip и чтение legacy record без новых полей;
8. восстановление текущего stage после повторного открытия IndexedDB;
9. template selector только для reflection preparation;
10. active card с одним текущим этапом и без обязательного ввода;
11. отсутствие reflection controls у free/recovery/freeThought;
12. сохранение pause/resume/complete и WALK-04 flow;
13. desktop/mobile layout, keyboard focus, console errors и horizontal overflow.

Browser QA проходит guided reflection: выбрать template, задать основной вопрос, начать прогулку, перейти минимум на один этап, reload, проверить восстановление, отключить сопровождение, pause/resume и завершить через существующий quick completion/reentry.

Финальный gate: целевые domain/application/persistence/presentation tests, Walk composition integration, `npm run test:alpha`, `npm run verify`, Playwright desktop/mobile, `git diff --check` и review cumulative diff без WALK-06 scope.

## Явные non-goals WALK-05

- сохранение ответов или мыслей по этапам;
- `WalkCapture`, pending inbox или Notes subsystem;
- linked-entity picker и запуск из Decision/Goal/Routine;
- автоматическое изменение внешних сущностей;
- новые completion outcome/result types;
- reentry persistence или recommendation engine;
- аналитика прохождения этапов;
- голос, фото, GPS, карты, погода или социальные функции;
- WALK-06 и последующие этапы.
