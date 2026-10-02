# План полного развития раздела «Прогулки»

> Для исполнителя: выполнять задачи последовательно с `superpowers:executing-plans`.
> Главный агент — единственный автор кода; независимое исследование/review — read-only
> по правилам AGENTS.md. Галочки означают фактическую готовность, а не согласие с идеей.

**Цель:** полноценный раздел прогулок с быстрым стартом, устойчивой активной сессией,
мыслями, историей, связями с LifeOS, планированием и понятной аналитикой.

**Архитектура:** существующие `Walk`/`WalkCapture` и stores остаются владельцами данных.
Новый application API и IndexedDB adapters связывают их с текущим `PlannerWorkspace`.
Производные показатели не создают второе хранилище прогулок; planner владеет расписанием.

**Стек:** существующие React, TypeScript, IndexedDB, Vite, Vitest, Playwright и encrypted sync.
Новые зависимости не предусмотрены.

**Спецификация:** [Полное развитие раздела «Прогулки»](../../design/features/2026-10-01-walks.md).

**Статус:** 01.10.2026 пользователь разрешил продолжить («давай сделаем»).
Макет W01 утверждён 01.10.2026: «Да, утверждаю». Локальная реализация W02–W14
подготовлена к review; ограничения совместимости, native QA и синхронизации личной цели
зафиксированы в приёмке. Commit, push и выпуск не разрешены.

Фактическая реализация и оставшиеся ограничения зафиксированы в
[приёмке раздела](../../design/features/2026-10-01-walks-qa.md). В частности,
старый sync-клиент не получает новые поля до согласования возможностей протокола;
недельная цель пока локальна; list-проекция не возвращает фото, но legacy cursor читает
запись целиком. Эти пункты не следует отмечать выполненными до отдельной проверки.

## Обязательные ограничения

- Работать только в активном worktree; сохранить старые прогулки, мысли, фото и ID.
- Не восстанавливать прежние страницы, application root или удалённые подсистемы.
- UI → Application → Domain; Infrastructure реализует порты; App связывает слои.
- Не использовать `any`; не изменять предметные данные напрямую из React.
- Общий Premium-язык: графит, jade основного действия, золото приоритета, отдельные success/error.
- Главный экран и активный flow реализуются после утверждения их макета.
- Никаких обязательных оценок, вопроса или рефлексии для свободного старта/завершения.
- Текст мысли 1–500 символов после trim; итог до 1000; оценки — целые 0–10;
  таймер — целые 1–1440 минут; фото — одно, до 5 МиБ.
- Commit после проверенного этапа возможен только в рамках действующих Git-разрешений.

## Области особого внимания

| Риск                                       | Проверяемое ожидание                                 | Владелец проверки |
| ------------------------------------------ | ---------------------------------------------------- | ----------------- |
| Одновременный старт в двух вкладках        | Одна запись; проверка и сохранение атомарны          | W03               |
| Закрытие приложения на паузе/перевод часов | Нет потерянной паузы или отрицательного времени      | W02, W05          |
| Старые данные и разные версии клиентов     | Нет потери полей, фото, legacy-связей                | W03, W04          |
| Частичный успех создания действия из мысли | Повтор возвращает одно действие, мысль не теряется   | W09               |
| Пустые/неполные оценки и полночь           | Нет ложных нулей, двойного счёта и причинных выводов | W07, W13          |

## Поставки и зависимости

| Поставка                     | Этапы   | Пользовательский результат                                                |
| ---------------------------- | ------- | ------------------------------------------------------------------------- |
| A — ежедневный минимум       | W01–W07 | Старт, пауза, восстановление, мысль, завершение, простая история          |
| B — осмысление и история     | W08–W11 | Подсказки, разбор мыслей, связи, фильтры, фото, восстановление удалённого |
| C — регулярность и понимание | W12–W13 | Планирование, личная цель, аналитика с исходными записями                 |
| Проверка полного раздела     | W14     | Приёмка, совместимость, desktop/mobile, готовность к последующему выпуску |

Критический путь: W01 → W02 → W03 → W04 → W05 → W06 → W07.
Затем W08; W09 использует W06/W07; W10 использует W03/W07; W11 использует W09/W10;
W12 использует W09; W13 использует W07/W10/W12; W14 — все предыдущие.
Это порядок выполнения одним автором, не предложение параллельно менять общий worktree.

Сложность: W01/W02/W06/W08 — средняя; W03/W04/W09/W11/W12 — высокая из-за сохранения
данных и связей; W05/W07/W10/W13 — средняя или высокая; W14 зависит от найденных дефектов.
Календарные сроки до проверки W03/W04 ненадёжны. Точки переоценки — конец W04 и каждой поставки.

## Общий цикл исполнения

Для каждой задачи с изменением поведения: добавить указанный тест → `test:target` с этим
файлом и ожидаемым FAIL именно по новому поведению → минимальная реализация → PASS → review.
Если существующая проверка уже покрывает обратимую правку, новый зеркальный тест не добавлять.
После стабилизации законченного патча перед handoff — один `npm run verify`; при изменении
общего domain/application контракта перед ним `npm run test:fast`.
Не повторять зелёные проверки без изменения проверенного контракта.

Пути с пометкой «создать» ниже — предлагаемые новые файлы, остальные проверены в дереве.
Новые E2E-команды запускаются только после создания соответствующего файла.

## W01. Утвердить устройство раздела и визуальные сценарии

**Файлы:** эта спецификация и план; создать
`docs/design/references/2026-10-01-walks/README.md` и reference-изображения.
**Вход:** существующая оболочка, CSS и предложение пользователя о полном развитии.
**Выход:** утверждённые экраны обзора, старта, active/paused и завершения.

- [ ] Обсудить предложенные defaults, необязательные оценки и границу GPS/native-функций.
- [x] Обновить browser baseline текущего worktree; сохранить desktop/mobile-снимки в references.
- [x] Подготовить макет на текущих стилях: первый запуск, активная прогулка, пауза,
      итог без оценки, ошибка сохранения и конфликт двух активных прогулок.
- [ ] Проверить 390×844 и desktop, controls ≥44 px, keyboard/focus, safe area и клавиатуру.
- [x] Получить явное визуальное утверждение, записать, какие изображения утверждены.

Материалы W01: [макет и результаты browser-проверки](../../design/references/2026-10-01-walks/README.md).
Responsive и keyboard focus проверены в браузере; настоящая мобильная клавиатура
остаётся проверкой реализации. Макет не является доказательством работы хранения или sync.

**Приёмка:** основной CTA понятен сразу; пользователь может начать и завершить без анкеты.
Здесь нет продуктового кода и полного E2E.

## W02. Адаптировать domain к простому сценарию

**Изменить:** `src/domain/walk/Walk.ts`, `src/domain/walk/Walk.test.ts`.
**Создать:** `src/domain/walk/WalkReflection.ts`, `src/domain/walk/WalkReflection.test.ts`.
**Интерфейс:** `WalkStartData.reflectionQuestion?: string | null`;
`Walk.reviseReflection(data: WalkReflectionData): Walk`, где поля `result: string | null`,
`afterState: WalkStateSnapshot | null`, `impact: WalkImpact | null`, `updatedAt: Date`.
Метод доступен только completed, не создаёт reentry, увеличивает domain version ровно один раз.
`recordOutcome` сохраняется для совместимости существующего legacy-контракта.

- [ ] Тест: free/recovery/reflection запускаются без вопроса, включая freeThought;
      введённый вопрос нормализуется и ограничен 500 символами, пустой превращается в null.
- [ ] Тест: completed без оценок валиден; редактирование итога сохраняет независимые null-поля.
- [ ] Тест: старый итог с reentry не теряет reentry при редактировании текста; старый результат
      не стирается случайным отсутствующим полем в application patch.
- [ ] Для legacy reentry сохранить инвариант обязательного impact: его очистка возвращает
      domain error, UI объясняет ограничение. Новые записи без reentry принимают impact=null.
- [ ] Тест времени: старт 10:00, пауза 10:10–10:15, завершение 10:25 → 20 минут.
      Завершение на открытой паузе и некорректное время проверяются отдельно.
- [ ] Изменить только нужные инварианты и прогнать `Walk.test.ts` и `WalkReflection.test.ts`.

**Приёмка:** lifecycle остаётся прежним; новых обязательных полей и обхода инвариантов нет.

## W03. Создать надёжное хранение и application API

**Создать:** `src/application/walk/WalkServices.ts`, `WalkCommands.ts`, `WalkQueries.ts`,
`WalkCommands.test.ts`, `WalkQueries.test.ts`;
`src/application/ports/WalkRepository.ts`, `WalkUnitOfWork.ts`, `CommittedWalkChanges.ts`;
`src/infrastructure/persistence/IndexedDbWalkRepository.ts`, `IndexedDbWalkUnitOfWork.ts`,
`WalkPersistence.integration.test.ts`.
**Изменить:** `WalkRecord.ts`, `WalkRecordMapper.ts` и mapper-тесты в существующих каталогах;
`src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts` только при нужде в новых полях/index/store.

**Контракты:** определить в `WalkServices.ts` именованные readonly DTO:

- `StartWalkInput`: `requestId`, `intent`, `type`, `mode`, nullable `question`,
  `targetMinutes`, `sphereId`, `beforeState`; значения enum из существующего domain.
- `WalkCommandTarget`: строковый `walkId`, целый `expectedVersion`, строковый `requestId`.
- `WalkServices.commands.start(input: StartWalkInput): Promise<Walk>`;
  `pause/resume/complete/abandon(input: WalkCommandTarget): Promise<Walk>`.
- `startExisting(input: WalkCommandTarget & { mode: WalkMode; targetMinutes: number | null;
question: string | null }): Promise<Walk>` запускает старую planned-запись по её ID,
  сохраняет дату/контекст и использует тот же атомарный active guard и receipt.
- `saveReflection(input: WalkCommandTarget & { reflection: Partial<Omit<WalkReflectionData,
'updatedAt'>> }): Promise<Walk>`; отсутствующее поле сохраняет прежнее значение,
  null означает явную очистку с учётом legacy-ограничения W02.
  Application собирает полные domain-данные и подставляет `updatedAt` через Clock.
- `queries.get(id: string): Promise<Walk | null>`;
  `queries.getActive(): Promise<readonly Walk[]>` — массив нужен для remote-conflict;
  `queries.list(query: WalkHistoryQuery): Promise<WalkHistoryPage>`.
- `WalkHistoryQuery`: `from/to` как DayDate, optional intent/status/sphereId/search/cursor;
  страница: summaries без photo bytes, `nextCursor: string | null`, размер 30.
- `changes.subscribe(listener: () => void): () => void` — после подтверждённого commit.

- [ ] Repository хранит переданную domain version, проверяет expectedVersion и не увеличивает
      её второй раз. Создание отличается от update через `expectedVersion: null`.
- [ ] Определить durable receipt `{requestId, operation, walkId, inputHash}` в transaction metadata:
      тот же request/input возвращает подтверждённый результат; другой input с тем же ID — ошибка.
      Не полагаться только на disabled-кнопку или in-memory Set.
- [ ] Атомарно проверять отсутствие running/paused и сохранять старт вместе с receipt/outbox.
- [ ] Проверить два concurrent start, повтор complete, version conflict, rollback при ошибке
      записи и отсутствие commit-event при rollback.
- [ ] Проверить startExisting: ID и legacy returnContext не меняются, новой записи нет;
      конфликт с другой активной прогулкой не изменяет planned-запись.
- [ ] Query читает старые записи, сортирует стабильно, не материализует фотографии списка.
- [ ] Прогнать новые application/integration-тесты и существующие mapper-тесты.

**Приёмка:** две вкладки не создают две локальные активные прогулки; ошибка сохранения
не оставляет половину операции. Расположение receipt metadata фиксируется до кода после
проверки действующего mutation pipeline; новый sync store без отдельного контракта не вводить.

## W04. Совместимость sync и восстановление

**Изменить:** `src/infrastructure/sync/LifeOsSyncRegistry.ts`,
`pilot/PilotSyncRegistryAdapters.ts`, `recovery/IndexedDbRecoveryStore.ts`
внутри `src/infrastructure/sync/` и их тесты.
**Создать:** `src/infrastructure/sync/pilot/WalkSync.integration.test.ts`.
**Вход:** W02/W03. **Выход:** одна политика для local write, remote apply и snapshot restore.

- [ ] Добавить fixtures старых planned/running/paused/completed, с/без reentry, с фото,
      с `goalLinksVersion: 1` и project→goal нормализацией.
- [ ] Проверить roundtrip и передачу новых nullable/optional-полей без потери старых.
      Старые клиенты не должны молча стирать поля или отвергать новый свободный старт.
- [ ] Зафиксировать capability/version gate для клиентов, не поддерживающих новый формат.
      Пока gate не реализован, не включать новые несовместимые записи для mixed-version sync.
- [ ] Внести согласованную обработку нескольких remote-active: сохранить обе записи,
      вернуть conflict в query/UI, блокировать новый старт; recovery не должен терять snapshot.
- [ ] Сохранить существующий orphan-safe контракт capture, guarded delete и фото через attachments.
- [ ] Проверить `WalkSync.integration.test.ts`, `PilotSyncRegistryAdapters.test.ts`,
      `StructuredSyncIdentity.test.ts`, `StructuredSyncApply.test.ts`,
      `recovery/IndexedDbRecoveryStore.test.ts` по затронутым контрактам.

**Приёмка:** локальный старт единственный, конфликт offline-устройств видим и разрешается явно.
Это обязательный блок перед поставкой A, а не обещание будущей надёжности.
Если потребуется общая миграция/recovery нескольких разделов, назвать этот риск и добавить
полный E2E по AGENTS.md; локальные изменения прогулок проверять scoped-набором.

## W05. Подключить раздел и активную прогулку

**Изменить:** `src/application/planner/PlannerServices.ts`,
`src/app/composition/createLifeOsApplication.ts` и `.test.ts`,
`src/presentation/planner-v2/PlannerNavigation.ts` и `.test.ts`, `PlannerWorkspace.tsx`.
**Создать:** в `src/presentation/planner-v2/walks/` файлы `PlannerWalks.tsx`,
`WalkStartForm.tsx`, `WalkActive.tsx`, `useWalkState.ts`, `walks.css`, `WalkActive.test.tsx`;
`tests/e2e/current.walks-lifecycle.spec.ts`.

- [ ] Composition предоставляет `PlannerServices.walks`; прежние flat API вроде createWalk
      не возвращаются. Уточнить composition-тест с учётом этой границы.
- [ ] Добавить пункт «Прогулки» в desktop и «Ещё» mobile; существующие основные пункты не заменять.
- [ ] Добавить parse/build маршрутов и обратные переходы, error для неизвестного walk ID.
- [ ] Реализовать утверждённый W01 макет, старт одним нажатием и форму дополнительных параметров.
- [ ] Timer — render-производная от timestamps; обновление экрана не пишет БД каждую секунду.
- [ ] Подписаться на confirmed commits и существующее событие sync; отписываться на unmount.
- [ ] Тестировать refresh в running и paused, закрытие/повторный вход, background/возврат,
      истечение target без auto-complete, конфликт active и перевод часов назад.
- [ ] Render tests и `npm run test:e2e -- tests/e2e/current.walks-lifecycle.spec.ts`.

**Приёмка:** быстрый старт и lifecycle работают на desktop/mobile; нижние controls не
перекрыты навигацией. Browser QA не считается проверкой реального Android background.

## W06. Сохранение мыслей и единый голосовой ввод

**Создать:** `src/application/walk/WalkCaptureCommands.ts`, `WalkCaptureCommands.test.ts`,
`src/application/ports/WalkCaptureRepository.ts`,
`src/infrastructure/persistence/IndexedDbWalkCaptureRepository.ts`,
`WalkCapturePersistence.integration.test.ts`;
в `src/presentation/planner-v2/walks/` — `WalkCaptureComposer.tsx`, `WalkCaptures.tsx`;
`tests/e2e/current.walks-captures.spec.ts`.
**Интерфейс:** `capture({walkId, requestId, content}): Promise<WalkCapture>`;
`update({captureId, expectedVersion, content}): Promise<WalkCapture>`;
`listForWalk(walkId: string): Promise<readonly WalkCapture[]>`.

- [ ] Проверить родителя в application: новую мысль можно записать при running/paused;
      после завершения можно редактировать существующую, но не подделывать время capture.
- [ ] Тесты trim, 500/501 символ, пустой ввод, сохранённое elapsed и двойной submit.
- [ ] Ошибка записи оставляет текст; обновление списка не закрывает composer.
- [ ] Подключить `VoiceTextArea`/`VoiceField` без отдельного SpeechRecognition в компоненте.
- [ ] Проверить keyboard, permission denied/unsupported, поздний результат после unmount.
- [ ] Прогнать application/persistence-тесты и scoped captures E2E на обоих проектах.

**Приёмка:** мысль доступна после refresh; нет ложного «Сохранено» или дубликата.

## W07. Завершение и минимальная история

**Создать:** в `src/presentation/planner-v2/walks/` — `WalkCompletion.tsx`,
`WalkHistory.tsx`, `WalkDetails.tsx`, `WalkCompletion.test.tsx`;
`tests/e2e/current.walks-completion.spec.ts`.
**Использовать:** W02 `reviseReflection`, W03 complete/query, W06 мысли.

- [ ] Сначала подтвердить completed и время, затем открыть необязательную форму итога.
- [ ] «Готово» без полей закрывает форму; сохранение итога не создаёт повторное завершение.
- [ ] Тест: оценки null отличаются от 0; редактирование после reload сохраняет время прогулки.
- [ ] Добавить список последних прогулок и детали с состояниями loading/empty/error/retry.
- [ ] Проверить повтор complete после lost-response и ошибку сохранения reflection после
      успешного complete: факт прогулки существует, форма не теряет текст.
- [ ] Выполнить targeted render, lifecycle/completion E2E и применимый verify.

**Приёмка поставки A:** весь сценарий из спецификации проходит без обязательной анкеты.

## W08. Необязательные сценарии размышления

**Создать:** `src/application/walk/WalkGuidance.ts`, `WalkGuidance.test.ts`;
`src/presentation/planner-v2/walks/WalkGuidance.tsx`.
**Использовать:** `WalkReflectionTemplate.ts`, `advanceReflectionStage`, `disableReflectionGuidance`.
**Интерфейс:** `advance/disable(input: WalkCommandTarget): Promise<Walk>`;
`getPrompt(template: WalkReflectionTemplate, stage: WalkReflectionStage): string`.

- [ ] Привязать понятные вопросы к существующим этапам без новой state machine.
- [ ] Проверить последовательность, завершённый последний этап, freeThought без этапов.
- [ ] Проверить отключение guidance, пустой ответ и восстановление стадии после refresh.
- [ ] Добавить эти browser-сценарии в lifecycle E2E и выполнить целевую выборку.

**Приёмка:** подсказки можно полностью игнорировать, основные controls всегда доступны.

## W09. Разбор мыслей и актуальные цели/действия

**Создать:** `src/application/walk/WalkCaptureProcessing.ts`, `WalkCaptureProcessing.test.ts`,
`WalkContextResolver.ts`, `WalkContextResolver.test.ts`;
`src/infrastructure/persistence/WalkCaptureProcessing.integration.test.ts`;
`tests/e2e/current.walks-links.spec.ts`.
**Изменить:** capture domain/record/mapper для результата обработки;
конкретные actions UI в `PlannerToday.tsx`, `PlanningGoalDetail.tsx`, `PlanningActionDetails.tsx`.
**Интерфейс:** `createAction({captureId, expectedVersion, requestId}): Promise<{actionId: string}>`;
`markProcessed({captureId, expectedVersion}): Promise<WalkCapture>`;
`resolveReturn(walk: Walk)` возвращает доступный текущий маршрут либо причину недоступности.

- [ ] Вход из цели/действия передаёт типизированный контекст, не произвольный URL.
- [ ] Создание действия и отметка обработки имеют атомарную границу либо durable receipt
      для восстановления частичного успеха через существующие application-команды.
- [ ] Тест: сбой после создания действия и retry не создают второе действие.
- [ ] Тест: удалённая цель, legacy project ID с `goalLinksVersion`, недоступный routine.
- [ ] Завершение прогулки само не меняет action status/progress; проверить это явно.
- [ ] Прогнать integration, context tests и scoped links E2E.

**Приёмка:** мысль остаётся исходной записью; пользователь видит созданное действие и может открыть его.

## W10. Полная история, фото и восстановление удалённых записей

**Изменить:** W03 queries/repository/records, W06 captures view, W07 history/details;
`src/infrastructure/sync/LifeOsSyncRegistry.ts` и adapters при изменении deletion payload.
**Создать:** `src/application/walk/WalkHistory.test.ts`,
`src/infrastructure/persistence/WalkHistory.integration.test.ts`,
`tests/e2e/current.walks-history.spec.ts`.
**Интерфейс:** `remove/restore(input: WalkCommandTarget): Promise<Walk>`;
nullable deletion metadata и ожидаемая версия; фото через existing attachment contracts.

- [ ] Добавить фильтры спецификации, pagination 30, URL/Back и пустую выборку.
- [ ] Проверить одинаковые timestamps на границе страницы: нет пропуска/дубля.
- [ ] Добавить одно фото ≤5 МиБ, замену и удаление; ошибка фото не откатывает completion.
- [ ] Добавить soft-delete/restore без физической очистки и без удаления связанных действий.
- [ ] Проверить orphan capture: мысль видима, источник отмечен как удалённый/недоступный.
- [ ] На 1000 прогулок проверить bounded page-read: список не читает фото bytes и не
      рендерит всю историю. Время отклика измерить и записать на используемом устройстве.
- [ ] Прогнать history integration, mapper/sync deletion/attachments tests и history E2E.

**Приёмка:** фильтры и восстановление не меняют фактические даты, длительности и чужие сущности.

## W11. Дневник и память жизни

**Создать:** `src/application/walk/WalkDiaryFacts.ts`, `WalkDiaryFacts.test.ts`,
`WalkMemoryExport.ts`, `WalkMemoryExport.test.ts`;
`tests/e2e/current.walks-journal.spec.ts`.
**Изменить:** `src/application/diary/DiaryService.ts`, diary presentation,
`src/application/memory/MemoryServices.ts` только при необходимости расширения draft API.
**Интерфейс:** `getDayFacts(date: DayDate): Promise<{completedCount: number; durationMs: number}>`;
`prepareMemory(walkId: string)` — черновик через действующие `prepareCreate/save`.

- [ ] Отделить производные факты дня от редактируемого diary payload.
- [ ] Перенос текста требует preview и явного сохранения; не менять завершённую запись молча.
- [ ] Экспорт в memory создаёт редактируемый draft; повтор одного request не дублирует событие.
- [ ] Проверить удаление источника, отсутствие итога/фото и отказ при сохранении назначения.
- [ ] Прогнать новые tests, затронутые DiaryService/Memory тесты и scoped journal E2E.

**Приёмка поставки B:** прогулка, мысль, действие, запись дневника и memory имеют разных
владельцев; ни одна интеграция не перезаписывает пользовательский текст автоматически.

## W12. Планирование и личная регулярность

**Создать:** `src/application/walk/WalkPlanning.ts`, `WalkPlanning.test.ts`,
`WalkPreferences.ts`, `WalkPreferences.test.ts`;
`src/presentation/planner-v2/walks/WalkPlan.tsx`, `WalkPreferences.tsx`;
`tests/e2e/current.walks-planning.spec.ts`.
**Изменить:** типизированные metadata действия и их domain/record/sync roundtrip;
переиспользовать действующие команды планирования и повторений.
**Интерфейс:** `plan({requestId, date, targetMinutes, recurrence})` возвращает action ID;
`startPlanned({actionId, requestId})` создаёт факт через W03;
настройка регулярности — `{weeklyCount: number | null, weeklyMinutes: number | null}`.

- [ ] Специфицировать типизированную связь action→walk до её записи; title не используется как ID.
- [ ] Планировать разовую прогулку и повторяющееся действие через planner без второго recurrence engine.
- [ ] Перенос/отмена используют существующий action lifecycle; старые planned Walk остаются читаемы.
- [ ] Старый planned Walk запускается командой W03 `startExisting`, а не `startPlanned`
      для нового planner action; отдельный E2E проверяет сохранение ID и контекста.
- [ ] После фактической прогулки отдельно предложить завершить связанное действие.
- [ ] Настройки nullable: выключены по умолчанию; положительные целые, без штрафов за пропуск.
      Владелец — WalkPreferences, persisted/sync через отдельный согласованный settings-контракт.
- [ ] Проверить повторения, запуск из конкретного occurrence, двойной старт, перенос даты
      плана после факта, удаление связанного действия и восстановление старого planned Walk.
- [ ] Выполнить targeted planner/walk tests и planning E2E, при общем контракте test:fast.

**Приёмка:** один план прогулки виден согласованно в «Сегодня» и разделе прогулок.

## W13. Аналитика и наблюдения

**Создать:** `src/application/walk/WalkAnalytics.ts`, `WalkAnalytics.test.ts`,
`WalkInsights.ts`, `WalkInsights.test.ts`;
`src/presentation/planner-v2/walks/WalkAnalytics.tsx`;
`tests/e2e/current.walks-analytics.spec.ts`.
**Интерфейс:** `getAnalytics({from: DayDate, to: DayDate})` возвращает completed count,
durationMs, activeDays, medianDurationMs, pairedCount, три nullable meanDelta и source IDs.
`getInsights(analytics)` выдаёт описательные утверждения с IDs и размером выборки.

- [ ] Fixture: completed 10 и 30 минут + abandoned 5 минут → count 2, минуты 40,
      медиана 20; abandoned отражён отдельно.
- [ ] Fixture: before energy=0, after=2 → delta +2; отсутствие before → не входит в пары.
- [ ] Проверить 4/5 пар на границе порога, напряжение +2 как рост напряжения,
      отсутствие среднего при 0 парах, inclusive период и прогулку через полночь.
- [ ] Один основной график по дням, таблица-альтернатива, значения доступны без цвета.
- [ ] Переход по метрике открывает те же source IDs/фильтр; удалённые записи исключены.
- [ ] Не сохранять вторую историю агрегатов и не отправлять данные во внешнюю аналитику.
- [ ] Выполнить analytics/insights tests и scoped analytics E2E.

**Приёмка поставки C:** числа воспроизводимы по истории; неполные данные не дают ложных выводов.

## W14. Приёмка всего раздела и подготовка handoff

**Создать:** `docs/design/features/2026-10-01-walks-qa.md` при фактической проверке.
**Обновить:** `docs/codex/PROJECT_MAP.md`, `docs/codex/TEST_MATRIX.md` по реализованному API.

- [ ] Сверить каждый пункт спецификации с реализованным поведением и test evidence.
- [ ] Проверить desktop 1440×900, mobile 320/360/390 px и переходы 700–760 px;
      клавиатуру, screen reader labels, reduced motion, ошибки, loading/empty/success.
- [ ] Пройти правило №38 с актуальным jade-акцентом, сделать comparison с утверждённым reference.
- [ ] Проверить реальный refresh/background и двухклиентный sync; для native-сборки
      отдельная ручная QA. Не выдавать эмуляцию viewport за проверку Android.
- [ ] Выполнить актуальный `npm run verify`, затем scoped текущие walks E2E;
      добавить `current.data-status-navigation.spec.ts` и `current.quick-access.spec.ts`
      при изменении общих переходов/поиска.
- [ ] Если этот этап явно выполняется как подготовка релиза или финальная регрессия R12,
      после verify выполнить `npm run test:e2e` целиком, объяснив релизный критерий.
      Для обычного промежуточного handoff полный suite автоматически не запускать.
- [ ] Зафиксировать ограничения, фактические команды и результаты; проверить diff/status.

**Приёмка:** нет скрытых failures/skips вместо проверки; unresolved mobile/native/sync
ограничения перечислены. Отказ от релиза оставляет старые данные и stores целыми.

## Контрольные команды

Пример targeted-команды после создания нового файла:

```bash
npm run test:target -- src/application/walk/WalkCommands.test.ts
npm run test:target -- src/infrastructure/persistence/WalkPersistence.integration.test.ts
npm run test:fast
npm run verify
npm run test:e2e -- tests/e2e/current.walks-lifecycle.spec.ts tests/e2e/current.walks-completion.spec.ts
git diff --check
git status --short
```

Селектор E2E по умолчанию выполняется на desktop-chrome и mobile-chrome.
Для локализации можно передать `--project=mobile-chrome` каноническому wrapper.
Не запускать весь E2E «на всякий случай» после каждого этапа. При timeout локализовать
последний scenario/project, а не повторять весь suite без диагноза.

## Что не входит в эти поставки

GPS/карты/шагомер, внешняя погода, Health API, social sharing, облачный AI-анализ,
новый движок уведомлений и фоновый native tracking требуют отдельных спецификаций.
Следующий конкретный шаг после обсуждения плана — W01: макет главного и активного экранов
на текущей оболочке с утверждением визуального результата.
