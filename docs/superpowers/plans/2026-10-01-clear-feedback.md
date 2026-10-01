# Состояние данных рядом с работой — Implementation Plan

> **For agentic workers:** использовать `superpowers:executing-plans`, задачи выполнять последовательно.
> Главный агент вносит изменения; независимые агенты выполняют read-only review по `AGENTS.md`.

**Goal:** сделать состояние данных доступным из рабочего раздела, уточнить его объяснение
и обеспечить возврат с обязательной UX-проверкой.

**Architecture:** существующий nav открывает Account через guards; shell хранит только return route.
`AccountSyncPage` продолжает читать AccountOverview и вызывать свой service. Меняются вход,
подписи и UI-навигация; транспортный механизм сохраняется.

**Tech Stack:** React 19, TypeScript, текущие CSS tokens, Vitest, managed Playwright.

**Spec:** [UX-спецификация, редакция 2](../../design/features/2026-10-01-clear-feedback.md).
**UX baseline:** [Восемь шагов проверки](../../design/references/2026-10-01-feedback-ux-audit/README.md).

Дата: 01.10.2026. Статус: реализовано; [результат и UX-проверка](../../architecture/2026-10-01-data-status-ux-verification.md). Он заменяет прежний широкий план
переустройства feedback. «Без учёта этих правок» принято буквально: обсуждённые bugfix исключены.

## Global Constraints

- Новых зависимостей, миграций, application-команд и status engine нет.
- Предсуществующие незакоммиченные изменения сохраняются.
- Главный агент меняет файлы; независимые агенты исследуют и проверяют read-only.
- UI не изменяет предметное состояние напрямую; существующие service/guard контракты сохраняются.
- Commit, push, установщик и публикация в этот план не входят.

Не создавать общий OperationFeedback, новый status provider, страницу/панель или журнал операций.
Не менять PilotSyncCoordinator, SyncStatusContext, sync mapper, action runners, Diary queue,
MemoryEditor. Новый control не показывает «всё сохранено/синхронизировано»: исключённые
исправления не подменяются новым UI.

## Review Focus

1. Отказ guard при входе/возврате не теряет route и return target — задача 1.
2. Direct URL/reload/повторный вход/Back/Forward не создают Account→Account loop — задача 1.
3. Малый desktop и длинный mobile текст: вход доступен, Today не опускается — задача 2.
4. Unavailable/sign-in/recovery/busy не получают недоступные действия и auto-sync — задача 3.
5. Пользователь находит вход, не путает pending с задачами и прошлый обмен с записью draft — задача 4.

## Карта файлов

| Файл                                                     | Ответственность                           |
| -------------------------------------------------------- | ----------------------------------------- |
| `src/presentation/planner-v2/PlannerWorkspace.tsx`       | Вход, return route, back callback         |
| `src/presentation/planner-v2/AccountSyncPage.tsx`        | Back label, подписи ReadyAccountPanel     |
| `src/presentation/planner-v2/planner-master.css`         | Локальное размещение входа                |
| `src/presentation/planner-v2/account-sync.css`           | Перенос подписей и пояснение              |
| `src/presentation/planner-v2/AccountSyncPage.test.tsx`   | Семантика и прежнее service поведение     |
| Новый `tests/e2e/current.data-status-navigation.spec.ts` | Вход/возврат, guards, responsive/focus    |
| `tests/fixtures/account-sync.tsx`                        | Детерминированные UI-состояния без облака |
| `tests/e2e/account-sync.spec.ts`                         | Регрессия существующих действий аккаунта  |

Перед реализацией проверить Git root/status. Сохранить предсуществующий dirty baseline предыдущих
обновлений. Прочитать спецификацию и обязательные дизайн-правила до UI-работы. Baseline уже есть;
повторять захват только если исходный интерфейс изменился. Все задачи ниже пока не выполнены.

### Задача 1. Вход и возврат через существующую навигацию

**Files:** `PlannerWorkspace.tsx`, `AccountSyncPage.tsx`, новый
`tests/e2e/current.data-status-navigation.spec.ts`.

**Interfaces:** `PlannerRoute` из `PlannerNavigation.ts`, текущий
`navigate(target: PlannerRoute): Promise<boolean>`. Локальное React state
`accountReturnRoute: PlannerRoute | null` принадлежит workspace, не сохраняется в IndexedDB/URL.
Локальные handlers: `openDataStatus(): Promise<boolean>` и
`returnFromDataStatus(): Promise<boolean>`; оба используют существующий `navigate`.
Для Account props добавить optional `backLabel?: string`, default «К плану дня»;
контракт `onBack: () => void` сохраняется.

- [ ] Добавить browser-регрессии: Today→Account→Today; Diary с датой→Account→та же дата;
      Actions с route-view→Account→тот же route. Проверить отсутствие sync/signup вызовов от перехода.
- [ ] Добавить guard-сценарии: отказ входа при неуспешно сохранённом draft; отказ возврата из
      заполненной account form. Текст, route и return target сохраняются. Использовать изолированные
      test patterns из `current.diary.spec.ts` и `current.quick-access.spec.ts`, без пользовательской базы.
- [ ] Добавить direct-entry/reload fallback, повторный вход из другого раздела и browser Back/Forward.
      После ухода с Account return target очищен; Forward без нового входа использует Today.
      Проверять route-параметры, не обещать произвольное local state размонтированной страницы.
- [ ] Запустить `npm run test:e2e -- tests/e2e/current.data-status-navigation.spec.ts`;
      подтвердить ожидаемый FAIL нового поведения, не ошибку setup.
- [ ] Реализовать вход через тот же guard-aware путь. Запоминать источник только при разрешённом
      входе; отказ оставляет прежнее значение. Не копировать draft/секреты в navigation state.
      Direct-entry/reload ведёт назад в Today; новый вход запоминает актуальный источник.
      Успешный уход очищает return target; Account не может стать собственным источником возврата.
- [ ] Передать backLabel через AccountSyncPage/View в AccountHeader. Возврат вызывает `navigate`.
      Modified click сохраняет href; новая вкладка не наследует in-memory return route.
- [ ] Повторить выбранные навигационные сценарии до PASS на desktop/mobile.

### Задача 2. Обнаружимый вход в оболочке

**Files:** `PlannerWorkspace.tsx`, `planner-master.css`, browser test из задачи 1.

**Interfaces:** текущие NavLink/AppIcon и callback задачи 1. Текст — «Состояние данных»,
URL — `#/v2/account`. Локальный CSS-класс `planner-data-status-link`; sync state внутри control нет.

- [ ] Расширить тест: desktop control после QuickAccess, перед nav; один клик без прокрутки на
      1440×900 и 1280×720. Mobile: «Ещё» → первый пункт «Состояние данных», без второго account entry.
- [ ] Проверить, что до изменения DOM тест обнаруживает отсутствующий новый вход.
- [ ] Добавить desktop link и mobile menu entry. Сохранить responsive breakpoints. Скрытая копия
      не занимает место и не фокусируется. Верхняя строка Today и bottom nav не меняют состав/высоту.
- [ ] Проверить Tab/Enter, видимый focus, Escape меню; control не доступен за native dialog.
      Не менять модальность или guards ради shortcuts.
- [ ] Сравнить координату первого действия Today до/после на одинаковых данных: контент не сдвинут
      вниз. Проверить target ≥44 px и отсутствие horizontal overflow.
- [ ] Запустить `npm run test:e2e -- tests/e2e/current.data-status-navigation.spec.ts` до PASS.

### Задача 3. Понятные подписи существующего состояния

**Files:** `AccountSyncPage.tsx`, `account-sync.css`, `AccountSyncPage.test.tsx`,
`tests/fixtures/account-sync.tsx`, `tests/e2e/account-sync.spec.ts`.

**Interfaces:** AccountSync/AccountOverview, callbacks и порядок account steps не меняются.
Использовать ReadyAccountPanel; новый компонент/источник transport data не нужен. Fixture получает
query states `ready`, `offline`, `pending`, `error` дополнительно к существующим состояниям.
Значения создаёт текущий fixture service, не реальный аккаунт.

- [ ] Добавить render tests точных подписей спецификации: «Состояние данных», «Ожидают отправки»,
      «Сохранённые конфликтные версии», время обмена. Проверить 0/несколько pending, неизвестное время.
- [ ] Проверить, что mount не вызывает syncNow; существующая кнопка вызывает его один раз,
      busy блокирует повтор, unavailable/sign-in/recovery не получают ready-кнопку.
      Back использует заданные label/callback без побочной команды.
- [ ] Запустить `npm run test:target -- src/presentation/planner-v2/AccountSyncPage.test.tsx`;
      подтвердить FAIL новых assertions.
- [ ] Уточнить heading и подписи ReadyAccountPanel, email оставить в hero. Добавить пояснение
      о различии сохранения на устройстве и обмена из спецификации. Значения/причинность старых
      статусов не переписывать в UI. Не переносить password/recovery forms и не дублировать live messages.
- [ ] Добавить локальный перенос label/value на 320 px без изменения общего каскада.
      Расширить fixture для UX-проверки; сохранить тесты регистрации/recovery/sign-out.
- [ ] Повторить targeted tests до PASS, затем
      `npm run test:e2e -- tests/e2e/account-sync.spec.ts` на desktop/mobile.

### Задача 4. Обязательная UX-проверка результата

**Создать после реализации:** `docs/architecture/2026-10-01-data-status-ux-verification.md`
и снимки `implementation-*` в `docs/design/references/2026-10-01-feedback-ux-audit/`.

Экспертный baseline audit уже проведён. Это не проверка будущего UI и не исследование с участниками.
Следующую матрицу выполнить на реализации:

| Задание                             | Проверяемый результат                                        | Способ                               |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Из Today найти сведения о данных    | 1 клик desktop / 2 mobile, без прокрутки меню                | Browser + пользовательский проход    |
| Из Diary перейти и вернуться        | Сохранён route/дата, guard работает, текст не теряется       | Scoped E2E + ручной проход           |
| Объяснить «Ожидают отправки: 2»     | Речь об изменениях, не о двух задачах                        | Вопрос после просмотра без подсказки |
| Объяснить время прошлого обмена     | Нет вывода о доставке текущего незаписанного draft           | Пользовательский проход              |
| Выбрать действие при истёкшем входе | Существующая форма входа, без ложного sync control           | Fixture + пользовательский проход    |
| Пройти без мыши                     | Control/menu/back достижимы, focus видим, modal не обходится | Keyboard audit                       |
| Открыть узкий экран                 | Нет обрезки/перекрытия/horizontal scroll                     | 390×844 и 320 px                     |

- [ ] Провести экспертный проход первой реализации: screenshot+DOM для каждого состояния.
      При проблемах уточнять только согласованный UX-scope, не включать исключённые bugfix молча.
- [ ] Проверить 1440×900, 1280×720, 390×844 и 320 px на одинаковых данных. Сохранить menu,
      Account ready/offline/pending/error/sign-in/unavailable из заданных fixture states, back и focus evidence.
- [ ] Проверить keyboard, reduced motion, contrast новых текстов по computed colors, zoom/reflow,
      console и Правило №38. Реальная мобильная клавиатура и screen reader — отдельная ручная QA,
      если недоступны; screenshot не доказывает полное соответствие WCAG.
- [ ] Зафиксировать статус рекомендуемой ручной QA: при участии пользователя на работающей сборке
      провести короткий проход по первым пяти заданиям.
      Записать время нахождения, лишние переходы, ошибки понимания, подсказки. Цель обнаружения
      ≤10 секунд без подсказки — критерий, не уже измеренный результат. Если участия не было,
      поставить «не проведено», не заменять вымышленными цифрами или участниками.
- [ ] Повторить только изменившиеся задания после доработки. Экспертная матрица обязательна;
      пользовательский проход не блокирует технический handoff. Его отсутствие явно отметить,
      не утверждая, что понятность интерфейса проверена с участниками.

### Задача 5. Gate и отчёт

- [ ] После стабилизации выполнить один `npm run verify`: он уже включает typecheck, lint,
      unit, infra, alpha, build и формат. Domain/application контракты не меняются; отдельный test:fast
      не обязателен.
- [ ] Scoped E2E — `current.data-status-navigation.spec.ts` и `account-sync.spec.ts` из задач выше.
      Если затронут связанный guard, дополнить конкретными сценариями `current.quick-access.spec.ts`
      или `current.diary.spec.ts`. Не повторять зелёные suites без влияющего изменения.
- [ ] Независимый read-only review: нет дублирования функций, guards сохранены, return route
      не хранит текст, ограничение достоверности старых статусов не скрыто.
- [ ] Изучить diff, выполнить `git diff --check` и `git status --short`. В отчёте разделить реальные
      результаты, UX-наблюдения, исключённые исправления и ручную QA. Не ставить APPROVED/LOCKED
      без соответствующего утверждения пользователя.

Полный E2E не запланирован: storage, transport и routing mechanism сохраняются; вход/возврат
ограничены одним destination и покрываются выбранными routes/guards. При общем изменении
навигации или межсценарной регрессии сначала объяснить новый риск по `AGENTS.md`.

## Проверка планирования

Для текущего этапа: свежий UX audit, проверка ссылок/файлов/npm-команд, локальный Prettier
и Git hygiene. Продуктовые tests/verify не нужны: продуктовый код не меняется.
Снимки исходного UI не являются свидетельством реализации нового UX.
