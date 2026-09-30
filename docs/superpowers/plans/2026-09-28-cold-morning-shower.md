# Утренний холодный душ — план реализации

> Выполняет главный агент по superpowers:executing-plans. Исследование и итоговый review read-only.

**Goal:** Отметки холодного душа, необязательное самочувствие, календарь и история в «Сегодня».

**Architecture:** Чистый domain-модуль и отдельный application-сервис над существующим атомарным
SleepScheduleRepository. Опциональное поле в record сохраняет старые данные. UI использует
application API и текущие компоненты/токены.

**Tech Stack:** TypeScript, React, IndexedDB, Vitest, Playwright; новых зависимостей нет.

**Spec:** `docs/design/features/2026-09-28-cold-morning-shower.md`.

## Ограничения и риски проверки

- Только активный worktree, сохранить предсуществующие изменения потребностей целей.
- QR не подтверждает душ; не менять будильник или факты WakeResult/MorningCycle.
- Дата через CurrentDateProvider, не UTC и не cycleDate сна.
- Нет отметки отличается от пропуска; будущие даты запрещены.
- Повтор и исправление не дублируют день; оценки после пропуска сбрасываются.
- Старый record и новое поле проходят sync/recovery; неверный payload отклоняется атомарно.
- Mobile-календарь и формы остаются доступными при длинных подписях.

## 1. Domain и application

- [x] Добавить failing tests в `src/domain/sleep/ColdShower.test.ts` для уникальности дня,
      независимых optional-оценок, коррекции, валидации и границ недели/месяца.
- [x] Проверить RED через `npm run test:target -- src/domain/sleep/ColdShower.test.ts`.
- [x] Реализовать `ColdShower.ts`: `recordColdShower(entries, input, now)`,
      `summarizeColdShowers(entries, today, month)` и валидатор persisted entry.
- [x] Добавить `ColdShowerService.test.ts`, затем сервис с `getEntries`, `record` и
      `remove` над repository.update, clock и CurrentDateProvider. Проверить отсутствие настроек,
      прошлую дату, future rejection и сохранение sleep fields.
- [x] Проверить targeted GREEN.

## 2. Persistence и composition

- [x] Добавить ColdShowerPersistence tests: legacy без поля, round-trip, concurrent
      edits, invalid persisted payload без частичного изменения.
- [x] Расширить опциональное поле в SleepScheduleState/Record и mapper. Проверить RED/GREEN.
- [x] Подключить сервис в createLifeOsApplication; integration reload и StructuredSyncFixtures
      с непустым журналом подтверждают существующие sync/recovery contracts.
- [x] Запустить targeted persistence/composition/structured-sync/recovery tests.

## 3. Стандартный UI

- [x] Добавить render tests и scoped E2E `current.cold-shower.spec.ts`: completion,
      optional assessment, skip, past-day correction, reload, stats, desktop/mobile.
- [x] Создать ColdShowerPanel с загрузкой/ошибкой/retry, compact CTA, оценками,
      month-calendar, selected date и историей. Использовать application commands.
- [x] Вставить panel через optional ReactNode в PlannerToday и service в PlannerWorkspace.
- [x] CSS локальный `cold-shower.css`, после текущего cascade, только существующие tokens.
- [x] Targeted render GREEN и browser QA 1440×900, 390×844, 360×800, keyboard, console.

## 4. Завершение

- [x] `npm run test:fast` при изменении общего state contract.
- [x] Один `npm run verify` после стабилизации, scoped E2E журнала и соседнего sleep flow.
- [x] Read-only final review, исправления по evidence, `git diff --check`, diff/status.
- [x] Итог: изменения, проверки и фактические ограничения; без commit/push/publication.

## Решения и итоговые доказательства

Опциональное поле не материализуется при чтении старого record: legacy round-trip сохраняется,
application трактует отсутствие как пустой журнал. Persistence-тесты вынесены в Infrastructure,
а application-тесты используют in-memory порт, согласно ограничениям слоёв ESLint.

При фиксированном времени browser regression обнаружил несброшенную локальную оценку после
смены статуса. Key формы теперь включает статус и значения, а не только timestamp. Проверка
сначала воспроизвела «ожидалось пустое значение, получено 4», затем прошла на desktop/mobile.

| Проверка                                             | Результат                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted domain/application/persistence              | 17 первоначальных проверок, затем 5 после разделения application/persistence — PASS                                                      |
| Targeted render/composition/structured-sync/recovery | 59 проверок — PASS                                                                                                                       |
| test:fast                                            | 911 проверок — PASS                                                                                                                      |
| verify                                               | typecheck, lint, 1654 unit/integration + 1 существующий skip, 55 infra, alpha, build, формат, diff — PASS                                |
| Scoped shower browser flows                          | 3 сценария × desktop/mobile; основные 4 проверки прошли после исправления, fixed-timestamp 2 проверки отдельным targeted запуском — PASS |
| Соседний sleep-preparation                           | 2 сценария × desktop/mobile — PASS                                                                                                       |
| Browser QA                                           | 1440×900, 390×844, 360×844 и 360×800, focus/keyboard/reduced motion, console и overflow — PASS                                           |
| Independent read-only review                         | Блокирующих замечаний нет                                                                                                                |

Полный E2E пропущен по локальному scope. В managed teardown был RECOVERED: primary Windows tree
cleanup сообщил Access denied, exact owned server root завершился, порт 4173 освобождён.
Успех teardown подтверждён runner. Предсуществующие/параллельные правки целей и native-release
файлов не входят в этот патч. Коммит, публикация и push не выполнялись.
