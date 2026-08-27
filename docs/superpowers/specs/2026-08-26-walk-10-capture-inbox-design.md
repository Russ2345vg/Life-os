# WALK-10 — Walk Capture и входящие с прогулок

Дата: 2026-08-26. Дизайн согласован в задаче до реализации. WALK-10 реализован в текущем
worktree; фактические проверки и ограничения фиксируются в соответствующем implementation plan.

## Цель и границы

Путь: Active/Paused Walk → «Сохранить мысль» → короткий текст → сохранение → продолжение Walk
→ «Входящие с прогулок» → открытие/редактирование → «Обработано».

Сохранение мысли не ставит прогулку на паузу, не завершает её и не меняет Decision, Routine,
WalkOutcome, Action, Goal или Project. Необработанные мысли не блокируют completion и Reentry.

Рабочий каталог — только `D:\LifeOS-App`. WALK-01–09 являются сохраняемым baseline:
920 исходных файлов, включая незакоммиченные изменения; Git index и HEAD не изменять.
Главный агент — единственный автор изменений, субагенты работают read-only.

Не входят: WALK-11, универсальная Notes-система, создание Action/Decision/Goal, преобразование
в заметку, voice, speech-to-text, фото, GPS, карты, AI, теги, аналитика, рекомендации,
переписывание Walk engine, общая реформа routing, новые зависимости, commit/push.

## Existing capture/note infrastructure

В текущем коде нет самостоятельной Note/Inbox-сущности или API с нужным lifecycle.

| Файл                                                                         | Назначение                                       | Переиспользовать?                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `D:/LifeOS-App/src/domain/journal/JournalEntry.ts`                           | Событие аудита с закрытыми типами                | Нет: это не редактируемый текстовый Inbox                 |
| `D:/LifeOS-App/src/application/ports/JournalRepository.ts`                   | Append-only журнал                               | Нет: не владелец текста мысли                             |
| `D:/LifeOS-App/src/domain/reflection/Reflection.ts`                          | Ответы вечернего осмысления                      | Нет: принадлежит EveningCycle                             |
| `D:/LifeOS-App/src/domain/action-session/SessionResultNote.ts`               | Итог ActionSession                               | Нет: мысль не является результатом работы                 |
| `D:/LifeOS-App/src/application/commands/CreateLifeActionDraft.ts`            | Создание Action                                  | Не подключать в WALK-10                                   |
| `D:/LifeOS-App/src/domain/walk/Walk.ts`                                      | Execution aggregate, итог и elapsed              | Читать связь и elapsed; не использовать result для мыслей |
| `D:/LifeOS-App/src/application/ports/Clock.ts` и `IdGenerator.ts`            | Время и идентификаторы                           | Да, через application-порты                               |
| `D:/LifeOS-App/src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts` | Схема IndexedDB, версия 17                       | Да, аддитивное обновление                                 |
| `D:/LifeOS-App/src/presentation/walk/WalkSubmissionGuard.ts`                 | Защита от повторной отправки                     | Да                                                        |
| `D:/LifeOS-App/src/presentation/walk/WalkSessionFlow.tsx`                    | Active/paused UI, короткий ввод и focus patterns | Да, точечное расширение                                   |

Выбран отдельный минимальный WalkCapture. Альтернативы — Journal и Walk.result — отклонены:
они имеют другую семантику и lifecycle. Универсальный Notes-модуль не создаётся.

## Источники истины и контракт

WalkCapture владеет только текстом мысли и статусом её обработки. Walk остаётся владельцем
исполнения, времени, linkedEntity, returnContext и итогового результата.

| Поле            | Правило                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `id`            | Существующий EntityId, создаваемый через IdGenerator                   |
| `walkId`        | Ссылка на исходный Walk; не изменяется при обработке                   |
| `type`          | Только `text`                                                          |
| `content`       | Trim; от 1 до 500 символов, без молчаливого обрезания                  |
| `capturedAt`    | Время сохранения из Clock; неизменно после создания                    |
| `walkElapsedMs` | Результат существующего `Walk.elapsedDurationMilliseconds(capturedAt)` |
| `status`        | `pending` или `processed`                                              |
| `createdAt`     | Равно capturedAt при создании; неизменно                               |
| `updatedAt`     | Время последнего изменения текста или статуса                          |
| `version`       | Существующий подход оптимистической конкуренции при редактировании     |

Capture не хранит копию Walk, decisionId, Routine context или WalkOutcome. Отображаемый
контекст читается через walkId. Смена даты не перепривязывает сохранённую мысль.

Domain не зависит от React или browser API. Изменения проходят через application-команды;
Presentation не обращается к конкретным IndexedDB-адаптерам.

## Application и persistence

Команды: создать text capture, изменить текст, отметить обработанным. Запросы: pending Inbox,
мысли конкретного Walk и одна мысль для открытия карточки.

Создание читает исходный Walk и проверяет running/paused, валидирует текст, получает Clock/Id
и записывает только Capture. Никакие команды pause/complete/update Decision или Routine не
вызываются. Elapsed вычисляется существующим методом Walk, без второго таймера.

Проверка active-состояния относится к снимку прочитанного Walk, без общей транзакции двух
агрегатов. Если другая вкладка завершает Walk после чтения, Capture сохраняется, а новая запись
Walk не перезаписывается. Этот контракт явно покрыт конкурентным application-тестом.

Повторный submit блокируется существующим синхронным guard и disabled-state во время записи.
В пределах этой отправки один capture получает один id. Две отдельно сохранённые мысли могут
иметь одинаковый текст: дедупликация по содержимому и сложная очередь повторов не нужны.
Подтверждение сохранения показывается после завершения транзакции, не до неё.

Редактирование и обработка меняют только Capture с проверкой version. Конфликт не должен
молча перезаписать чужую правку: пользователь получает ошибку и возможность обновить данные.
Повторная обработка уже processed не создаёт запись и не переводит её обратно в pending.
Редактировать текст можно и после обработки; статус при этом остаётся processed.

В IndexedDB версии 18 добавляется store `walkCaptures` с ключом `id` и индексами по `walkId`
и `status`. Records/mappers и InMemory-репозиторий следуют существующим паттернам проекта.
Миграция 17 → 18 не переписывает существующие записи или stores. Сохранность старых данных
подтверждается отдельным тестом миграции; legacy fixtures не должны заранее создавать новый store.

Нет cascade delete. При прерывании, завершении или удалении Walk ранее сохранённые мысли
остаются. Если Walk уже недоступен, мысль всё равно можно открыть/изменить/обработать;
UI показывает безопасное сообщение о недоступном контексте.

## UI

### Active и paused

- Вторичная кнопка «Сохранить мысль» не конкурирует с Pause/Resume и Finish.
- Компактный inline composer: одна textarea «Мысль», «Отмена», «Сохранить», лимит 500.
- Открытие переводит фокус в textarea; закрытие возвращает его на кнопку запуска.
- Отмена/Escape не создают Capture. Ошибка сохранения оставляет введённый текст и форму.
- После успеха форма закрывается, появляется спокойное «Мысль сохранена» через live region.
- Timer продолжает следовать состоянию Walk. Capture-запросы не меняют его источник времени.
- Счётчик сохранённых мыслей восстанавливается из repository после reload, а не из React state.

### Inbox и история

В Walks Center добавляется компактный вход «Входящие с прогулок · N», где N — число pending
captures. Список и карточка открываются внутри WalksPage, без нового глобального раздела.

Строка показывает короткий текст, capturedAt, режим/намерение прогулки и доступный связанный
контекст Decision/Routine/обычной прогулки. Новые сверху; при равном времени — стабильный
порядок по id. Для отсутствующего Walk используется fallback, без создания ghost-сущностей.

Карточка содержит текст, контекст, редактирование и «Обработано». После обработки запись
исчезает из pending Inbox, но остаётся в repository. В существующей карточке завершённого
Walk появляется «Сохранённые мысли · N» с доступом ко всем его мыслям, включая processed.
Reentry не требует разбирать мысли и сохраняет поведение WALK-07–09.

Ошибки чтения/записи Capture отображаются локально и не подменяют состояние Walk.
Loading/empty/error/disabled/success состояния предусматриваются для composer и Inbox.

### Mobile и визуальный источник

Источник — существующий Walk UI WALK-03.1 и `D:/LifeOS-App/docs/codex/UI_RULES.md`.
Графитовая база, gold для Save/focus, green для saved/processed; без purple и больших карточек.

Inline composer использует обычный поток и прокрутку, safe-area отступы и доступные controls.
Он не вводит полноэкранный modal, фиксированную высоту, отдельный таймер или новый viewport engine.
Проверяются 360/390/430 px, фокус, доступность textarea и Save, bottom navigation и отсутствие
чёрного/пустого экрана при вводе и уменьшении видимой области.

Playwright-эмуляция и уменьшенный viewport не доказывают работу настоящей экранной клавиатуры.
Для этого требуется отдельная ручная проверка на устройстве; до её выполнения отчёт явно
сохраняет это ограничение и не заявляет полноценный mobile keyboard PASS.

## Proposed minimal design: файлы

Новые product-модули, каждый со своей ответственностью:

- `D:/LifeOS-App/src/domain/walk-capture/WalkCapture.ts` — модель и инварианты.
- `D:/LifeOS-App/src/application/ports/WalkCaptureRepository.ts` — порт хранения.
- `D:/LifeOS-App/src/application/commands/CreateWalkCapture.ts` — создание.
- `D:/LifeOS-App/src/application/commands/UpdateWalkCapture.ts` — редактирование.
- `D:/LifeOS-App/src/application/commands/ProcessWalkCapture.ts` — обработка.
- `D:/LifeOS-App/src/application/queries/GetPendingWalkCaptures.ts` — pending Inbox.
- `D:/LifeOS-App/src/application/queries/GetWalkCaptures.ts` — мысли конкретного Walk.
- `D:/LifeOS-App/src/application/queries/GetWalkCaptureById.ts` — карточка мысли.
- `D:/LifeOS-App/src/infrastructure/persistence/InMemoryWalkCaptureRepository.ts` — тестовый адаптер.
- `D:/LifeOS-App/src/infrastructure/persistence/IndexedDbWalkCaptureRepository.ts` — runtime-адаптер.
- `D:/LifeOS-App/src/infrastructure/persistence/records/WalkCaptureRecord.ts` — record.
- `D:/LifeOS-App/src/infrastructure/persistence/mappers/WalkCaptureRecordMapper.ts` — mapper.
- `D:/LifeOS-App/src/presentation/walk/WalkCaptureComposer.tsx` — короткий ввод.
- `D:/LifeOS-App/src/presentation/walk/WalkCaptureInbox.tsx` — компактный список.
- `D:/LifeOS-App/src/presentation/walk/WalkCaptureDetails.tsx` — открытие и обработка.

Точечные изменения: существующая IndexedDB schema, exports соответствующих слоёв,
LifeOsApplication/createLifeOsApplication и передача команд через ApplicationShell;
WalksPage, WalkSessionFlow и scoped CSS в global.css. Изменение Shell ограничено wiring,
не routing. Domain Walk и существующие Decision/Routine команды не переписываются.

Новые тесты располагаются рядом с контрактами и в отдельном WALK-10 Playwright spec.

## Критерии приёмки и проверки

Новые behavior changes поставляются через RED → GREEN:

1. Running и paused Walk сохраняют text capture с правильным walkId, временем и elapsed.
2. Trim применяется; пустой и слишком длинный текст отклоняются без записи.
3. Сохранение не меняет запись Walk, его status/version или данные Decision/Routine.
4. Несколько мыслей сохраняются отдельно; повторный submit не создаёт случайный дубль.
5. Reload восстанавливает Walk и ранее сохранённые мысли.
6. Pending Inbox сортируется newest first; processed исчезает из Inbox, но остаётся в storage
   и списке мыслей исходного Walk.
7. Редактирование сохраняется; ошибка/CAS-конфликт не теряют текст и не затирают чужие данные.
8. Completion, Reentry, abandon и удаление Walk не требуют обработки и не удаляют captures.
9. Обновление схемы сохраняет существующие данные, включая WALK-01–09.
10. Обычная прогулка без мыслей, active/pause/resume, WALK-08 Routine и WALK-09 Decision
    проходят соседние проверки без изменения своих контрактов.

Browser QA: reflection Walk → ожидание не менее 5 секунд → мысль → продолжающийся timer
→ вторая мысль → reload → обе мысли сохранены → completion/Reentry → Inbox → карточка
→ редактирование/обработка. Дополнительно paused, отмена, empty и защита от двойной отправки.

Скриншоты: active с composer, подтверждение сохранения, Inbox, карточка Capture,
mobile composer с keyboard-safe layout. Настоящая клавиатура отмечается отдельно от эмуляции.

Проверки реализации: целевые unit/application/persistence тесты, регрессии Walk/Routine/Decision,
typecheck, lint, build, применимый quality gate, форматирование, git diff --check, изучение diff
и итоговый git status. Не запускать тесты для одной лишь записи этой спецификации.

Финальный отчёт после реализации содержит 12 разделов из задания пользователя, фактические
результаты команд, screenshots и ограничения QA. WALK-11 не начинается; после отчёта — остановка.
