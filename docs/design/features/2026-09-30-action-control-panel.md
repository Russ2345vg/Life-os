# Управление действием на месте

Дата: 30.09.2026. Статус: реализовано и технически проверено; визуальный результат не помечен
`APPROVED` или `LOCKED`.
[План реализации](../../superpowers/plans/2026-09-30-action-control-panel.md) ·
[Отчёт о проверке](../../architecture/2026-09-30-action-control-panel-verification.md).

## Результат для пользователя

Открыть действие, изменить название, дату или время, выполнить его и продолжить работу
с исходным списком без повторного поиска своего места. Одна карточка доступна из «Сегодня»,
библиотеки действий и результатов глобального поиска. На desktop она открывается справа,
на mobile — в существующей адаптивной панели поверх исходного экрана.

Первый выпуск охватывает Today/завтра, представления библиотеки действий и результаты поиска
типа action. Карточки целей, направлений и сфер не переводятся на новый сценарий.
Создание нового действия остаётся существующим flow. Прямые ссылки на полную карточку работают.

## Основание и визуальный источник

- `PlannerWorkspace` при смене route обнуляет свой snapshot и меняет refresh scope.
- `PlannerLibraryWorkspace` keyed по полному текущему route; открытие отдельной карточки
  размонтирует исходный список с его локальными фильтрами, поиском и раскрытиями.
- Detail body находится в ветке `selectedId` компонента `PlannerActionList`. Ссылка возврата
  ведёт во «Все действия», независимо от места открытия.
- `PlannerSheet` уже реализует native dialog, desktop resize и mobile sheet. QuickAccess,
  форма времени и необязательный итог используют эту же оболочку.
- `QuickAccessPanel` уже умеет искать, создавать действия и менять дату. Эти функции сохраняются;
  новое поведение — открытие общей карточки поверх сохранённого исходного экрана.
- Предыдущее обновление completion отделяет commit от refresh. Его receipt/retry нельзя
  привязать к lifetime нового dialog.

План опирается на активный `D:/LifeOS-App`, включая незакоммиченное обновление надёжного
завершения действия. Оно является baseline, а не частью diff этого документа.

Перед реализацией повторно изучены снимки текущей сборки из предыдущего этапа этой задачи:
`#/v2/today`, `#/v2/actions`, `#/v2/actions/summary-action`, форма итога;
1440×900 и 390×844. Снимки и computed-style evidence сохранены в
`.superpowers/sdd/2026-09-30-reliable-action-completion/{baseline,final}/`.
После реализации desktop/mobile и browser-сценарии проверены отдельно; результаты приведены в
отчёте о проверке.

Проверен действующий cascade: tokens → planner-v2 → planner-master → planner-premium,
локальные planner-library/planner-views. Sheet использует `--surface-1`; desktop — существующую
изменяемую ширину, mobile — ширину экрана, верхний отступ 24 px и safe-area снизу.
Полные дизайн-правила прочитаны в предыдущем этапе; Premium graphite/jade из AGENTS имеет
приоритет над историческими gold/glass примерами документа.

## Дизайн-контракт

```text
FEATURE → управление существующим действием на месте
USER GOAL → выполнить частую операцию и продолжить с того же места
EXISTING LOGIC → application action commands, planning, library read model, completion controller
PAGE/COMPONENT ARCHETYPE → существующая контекстная форма в PlannerSheet
SECTION COLOR → текущий общий graphite/jade; gold для приоритета; success/error по смыслу
ATMOSPHERIC MOTIF → текущая рабочая поверхность, без новой декоративной темы
MAIN VISUAL CENTER → выбранное действие и доступные операции над ним
COMPONENTS TO REUSE → PlannerSheet, PlannerDisclosureCard, VoiceTextInput/VoiceField,
  action editor/date controls, PlanningActionDetails, time form, CompletionResult
MOBILE BEHAVIOR → существующая sheet, 44 px controls, внутренний scroll, safe-area,
  видимый focus, без горизонтального переполнения
APPROVED REFERENCE → отдельный макет не требуется: стандартная форма в существующей оболочке;
  визуальное approval нового экрана не заявляется
TEST SCOPE → location/history, drafts/guards, shared read/completion lifetime,
  scoped desktop/mobile flows, verify
```

Это новая функция существующих страниц, собранная из действующих форм и архетипа sheet.
Если реализация потребует композиции за пределами этого контракта, сначала нужен отдельный
макет по New Feature Design Gate; такой редизайн в данный план не входит.

## Видимое поведение

1. Заголовок действия открывает панель; checkbox по-прежнему выполняет действие напрямую.
   Обычный клик использует панель. Modified click/open in new tab сохраняет standalone URL.
2. В верхней части карточки — название, состояние и выполнение; редактирование названия
   доступно без раскрытия блока редких параметров. Сохранение текста явное.
3. Дата и доступ к форме времени идут сразу следом. Дата допускает Today/завтра и календарный
   выбор в рамках существующих команд. «Без даты» предлагается только в разрешённом состоянии.
4. Описание, потребность, связь с целью, повторения, вклад и поддействия доступны ниже через
   существующие раскрытия. Полная страница использует то же содержимое, без второй реализации.
5. Закрытие возвращает исходную дату, вид библиотеки, запрос, фильтры, раскрытия и место прокрутки.
   Успешная операция обновляет данные этого экрана. Выполненная/перенесённая строка может исчезнуть
   согласно его фильтрам; это не сброс фильтра.
6. Поиск → действие → закрыть: снова тот же поисковый запрос и результаты. Открытие поверх
   формы аккаунта/сна сохраняет её поля; такие поля никогда не копируются в navigation state.
7. Выполнение показывает сохранённый результат. Необязательный итог и refresh-only retry
   сохраняют семантику предыдущего обновления. Close панели не является dismiss receipt.

Состояния панели: loading с понятной подписью; данные; не найдено/архив без доступных mutations;
read error с повтором; сохранение с блокировкой повторов; validation/field conflict с сохранённым
текстом; saved + refresh error; completed с доступным явным возвратом в работу.
Не показывать карточку предыдущего id, пока загружается другой id.

## Навигационный контракт

Единственный владелец location/history — `ApplicationShell`. Вводится обёртка над `PlannerRoute`:

```ts
interface PlannerLocation {
  readonly page: PlannerRoute;
  readonly actionPanel: { readonly actionId: string } | null;
}
```

Примеры: `#/v2/today?day=tomorrow&action=abc`,
`#/v2/actions?view=calendar&action=abc`. Параметр `actionId` уже занят time view и не переиспользуется.
`PlannerWorkspace` и keyed библиотека получают неизменный `location.page`; `actionPanel` передаётся
отдельно. Изменение panel id не меняет base route key, current date или completion scope.

| Событие                          | Результат                                                      |
| -------------------------------- | -------------------------------------------------------------- |
| Открыть панель                   | Одна новая app-owned history entry поверх текущей страницы     |
| Выбрать другое действие в панели | Replace текущей panel entry после проверки её черновиков       |
| Back / Forward                   | Закрыть / снова открыть панель; источник остаётся mounted      |
| Close / Escape основной панели   | Перейти к известной source entry; если её нет, replace на page |
| Прямой `#/v2/actions/:id`        | Совместимая standalone-карточка с общим содержимым             |
| Прямой overlay URL / reload      | Восстановить page и id из URL; close возвращает к page         |
| Другая страница                  | Принятый переход закрывает панель и её дочерние dialogs        |

Локальные фильтры и scroll гарантированно сохраняются в живой сессии открытия/закрытия панели.
Их восстановление после полного reload не обещается; данные и URL восстанавливаются как обычно.

Shell операции `navigate`, `openAction`, `closeAction` возвращают `Promise<boolean>`.
UI меняет focus/закрывает поиск только после принятого перехода. Один coordinator сериализует
клики и browser events; парные popstate/hashchange не исполняют переход дважды.

App-owned history metadata содержит только version, tracking session id, entry id, index и
идентификатор source entry. Она namespaced и сохраняет чужие поля `history.state`.
Ни entities, ни drafts, ни query text, ни secrets в неё не записываются. URL авторитетен для location.
На событии захватываются hash и metadata вместе, а не перечитываются после ожидания guard.

Если guard отклоняет Back/Forward между известными entries одной tracking session, восстанавливается
позиция через `history.go(delta)` с подавлением соответствующего повторного события. Нельзя
подменять URL записи, в которую браузер уже перешёл. Close использует history только при известной
source entry; для direct/reloaded панели применяется replace.

Для неизвестной/unowned history boundary delta не угадывается. При принятии адрес нормализуется
и становится началом новой отслеживаемой цепочки; при отказе создаётся новая entry с последним
принятым location, сохраняя чужую entry и черновик. Точное восстановление прежнего Forward-стека
за этой границей не гарантируется. При таком rebase создаётся новый tracking session id,
старые source entry ids инвалидируются; delta вычисляется только внутри одной tracking session.
Это fallback для внешнего вмешательства в history, не путь
обычных panel transitions. Переход из документа защищает существующий beforeunload.

## Владение данными и операциями

- Существующая IndexedDB и application-команды остаются источником предметного состояния.
  Panel state содержит только id из location, UI-состояния и несохранённый пользовательский текст.
- Root владеет одной `PlannerLibraryReadModel` на services/base route/date. Библиотека и панель
  используют эту же модель; второй `PlannerLibraryWorkspace` не монтируется.
- Подписка активна для библиотечного источника. Для других страниц она активируется при первом
  открытии панели и живёт до смены base scope. После close её нельзя отключать: последний
  unsubscribe очищает snapshot и завершает waiters, что может дать ложный ready после commit.
  Цена решения — чтения после первой панели над аккаунтом/сном продолжаются до ухода со страницы.
- Один root completion owner обслуживает Today, библиотеку и панель. Tasks стабильны относительно
  panel id/visibility: Today — workspace → planning → library; остальные — planning → library.
  Для ещё неактивной library task ничего не инвалидирует. Вызов из панели доступен после подписки.
- Receipt остаётся у root после закрытия панели; saved + failed можно восстановить из фонового
  feedback или после повторного открытия. Pending refresh не считается несохранённым текстом.
  Смена base scope закрывает controller и подавляет поздний UI feedback, не отменяя начатый commit.
- Shared action callbacks извлекаются из существующих handlers; goal-specific callbacks остаются
  в библиотеке. Дата использует текущий changeDate/undo, completed-date exception сохраняется.
  Время передаёт закреплённый expectedVersion; выполнение — показанный expectedCompletionKey.
- Текстовый editor сохраняет field-based drafts через `plannerActionDraft`: внешняя смена даты
  не блокирует dirty title, внешнее изменение самого title показывает конфликт и сохраняет ввод.
  Новая универсальная CAS-защита текстовых команд в scope не входит.

## Черновики, dialogs и focus

Panel subtree получает отдельную область существующего guard registry. Hooks форм по-прежнему
передают только dirty/busy; background registry остаётся отдельным. Закрытие панели не требует
отбрасывать несохранённую форму под ней. Реальный уход со страницы проверяет и панель, и текущий
route leave guard, сохраняя diary/memory autosave.

При dirty close/switch показывается подтверждение: «Есть несохранённые изменения.» с действиями
«Продолжить редактирование» и «Закрыть без сохранения». Автоматического сохранения всех форм нет.
Во время записи закрытие/смена action заблокированы: «Дождитесь завершения сохранения.».
После подтверждённого commit можно закрыть панель, пока root заканчивает чтения. Для выполнения
busy guard проверяет фазу `saving`, а не общий `completion.busy`, включающий refresh.
Beforeunload учитывает dirty/busy панели. Сохранённый receipt сам по себе unload не блокирует.
Подтверждение ухода только разрешает переход: черновики удаляются после принятия всего перехода.
Если затем background autosave отклоняет page leave, карточка и её ввод остаются открытыми.

Дочерние формы времени и итога используют действующие native dialogs и отдельные guard scopes.
Одновременно активен один дочерний editor. Escape закрывает только верхний dialog/menu;
попытка Back закрыть panel проверяет все её дочерние черновики. Принятый close не оставляет
осиротевших time/summary dialogs. Draft итога привязан к исходному completionKey.
Пока summary/time открыты, другой action не выбирается; сначала завершить или закрыть форму.
Root хранит transient origin summary: исходная страница либо id panel session. Summary,
открытый из панели, явно получает её guard scope, даже если рендерится React sibling у root.
Закрытие панели удаляет только принадлежащий ей summary; receipt выполнения остаётся у root.
Summary исходной страницы сохраняет прежнее поведение.

Menu/confirm порталы внутри карточки направляются в ближайший dialog, не в inert background.
QuickAccess action handoff закрывает поисковый dialog только после принятия и запоминает
transient return target. Первое открытие из поиска возвращает в поиск; переключение A→B через
поиск внутри уже открытой панели сохраняет исходный return target. При настоящем уходе со страницы
поиск не открывается на новом маршруте. Shell хранит transient return target по managed panel
entry id до смены исходной страницы/reload, в том числе пока панель закрыта через Back. Поэтому
Back → Forward → Close возвращает тот же поиск. Query остаётся в существующем QuickAccess owner,
в history state не записывается. Reload не восстанавливает transient search provenance.

Scroll lock панели должен сосуществовать с QuickAccess/time/summary: снятие верхнего dialog
не разблокирует фон, пока открыт нижний. Initial focus панели — заголовок, без автоматического
показа mobile-клавиатуры. После close — opener с `preventScroll`; если он исчез, заголовок
исходного списка/поле поиска. Saved/error feedback доступен внутри активного dialog.

## Приёмка и границы

- Переименование, перенос, время и выполнение из трёх точек входа используют общие callbacks.
- Open/close не размонтирует исходный экран, не сбрасывает фильтры и не меняет выбранный день.
- Dirty stay/discard и busy работают одинаково через Close, Escape, Back и смену action.
- История, direct URLs, modified click, invalid id, удаление выбранной записи и midnight покрыты.
- Completion refresh failure → close → reopen → retry сохраняет один command/Journal/contribution;
  draft итога не ретаргетится, старые ответы не меняют другой action.
- Desktop/mobile, keyboard/focus, touch targets, nested dialogs, scroll и console проверены.
- Нет новой схемы данных, зависимости, общего modal framework, autosave текста, новых sync rules,
  массового redesign всех сущностей или переноса UI drafts в persisted store.

Самые рискованные границы — history cancellation, scoped guards, lazy read lifetime и вложенные
dialogs. План проверяет их отдельно до подключения всех входов.
