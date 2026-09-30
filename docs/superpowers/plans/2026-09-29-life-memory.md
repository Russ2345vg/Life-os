# «Память жизни» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. По AGENTS.md главный агент — единственный автор кода; независимые агенты исследуют и проверяют read-only.

**Goal:** Добавить личную ленту событий с одной фотографией, ручной связью с дневником и обзором «Мой год».

**Architecture:** Независимый MemoryEvent хранится через application-сервис и MemoryRepository;
IndexedDB реализует порт. Дневник остаётся источником своих записей, память хранит выбранный
пользователем снимок. Фото переиспользуют существующий encrypted attachment pipeline;
годовой обзор вычисляется из событий.

**Tech Stack:** текущие TypeScript, React, IndexedDB, Vite, Tauri Windows/Android, Supabase sync;
Vitest и Playwright. Новые зависимости планом не предусмотрены.

**Spec:** [спецификация и дизайн-контракт](../../design/features/2026-09-29-life-memory.md).

Статус: пользователь разрешил исполнение 29.09.2026 сообщением «реализовывай»
и утвердил UI-reference сообщением «да утверждаю». Задачи 1–8 реализованы и проверены;
проверка реальных устройств и поставки A/B задачи 9 остаются отдельным этапом.
Сохранять предсуществующий dirty worktree и не включать чужие
изменения в commits. Push/publish требуют соответствующего разрешения.

Прогресс: backend и production UI задач 2–8 реализованы, макет задачи 1 явно утверждён.
Ревью выявило два UI-дефекта; они воспроизведены browser-тестами и исправлены.
Фактические доказательства и ограничения: [отчёт проверок](../../design/features/2026-09-29-life-memory-verification.md).

## Global Constraints

- Одна необязательная фотография на воспоминание. Это осознанное ограничение первой версии.
- occurredOn: DayDate, обязательная локальная календарная дата, не позднее сегодня.
- Проверка будущего — только в application при создании/изменении даты, не в mapper/sync/restore.
- title: trim, 1–160 символов; body: trim, 0–10000 символов, plain text.
- Типы: moment / achievement / trip / decision / insight; по умолчанию moment.
- Фото: максимум 5 MiB; JPEG, PNG и WebP; без обещания EXIF-очистки или HEIC-конвертера.
- Сортировка: occurredOn DESC, createdAt DESC, id DESC; выдача порциями по 30.
- Первая версия не предлагает безвозвратное удаление или автоматический срок очистки.
- На «Сегодня» новая большая панель не добавляется.
- Domain не зависит от React/browser/Application; UI вызывает application-команды; без any.
- Новый тип регистрируется для чтения/sync/recovery независимо от default-off VITE_LIFEOS_MEMORY_ENABLED.
- Full E2E не запускается после каждого этапа; перед реальным релизом он обязателен.

## Review Focus

- Сбой ответа после commit и повтор submit: одна запись, сохранённый черновик — задачи 2 и 6.
- Удаление источника/сферы/цели: память и исторические подписи доступны — задачи 2, 3 и 7.
- Полночь/Новый год/29 февраля: группировка по occurredOn без UTC-сдвига — задачи 2 и 8.
- Фото ещё не в облаке при delete/restore/recovery: байты не теряются — задачи 4 и 5.
- Старый клиент после первого нового sync type: отсутствие ложной совместимости — задачи 3 и 9.

---

## Карта файлов и переиспользование

Новые файлы группируются по текущим слоям, существующие крупные модули не реорганизуются:

- `src/domain/memory/MemoryEvent.ts`, `MemoryPhoto.ts`, `index.ts` — инварианты/чистые типы.
- `src/application/memory/MemoryService.ts`, `MemoryQueries.ts`, `MemoryDiaryImport.ts`, `index.ts`
  и `src/application/ports/MemoryRepository.ts` — команды, фильтры, годовая проекция, подготовка импорта.
- `src/application/ports/MemoryPhotoReader.ts` и
  `src/infrastructure/memory/BrowserMemoryPhotoReader.ts` — проверка/декодирование выбранного фото
  через порт; browser API не попадают в Domain или application-сервис.
- `src/infrastructure/persistence/IndexedDbMemoryRepository.ts`,
  `records/MemoryEventRecord.ts`, `mappers/MemoryEventRecordMapper.ts` — атомарное хранение.
- `src/presentation/planner-v2/memory/PlannerMemory.tsx`, `MemoryTimeline.tsx`,
  `MemoryEditor.tsx`, `MemoryYearView.tsx`, `memory.css` — новый flow внутри текущей оболочки.
- Composition: `src/app/composition/LifeOsApplication.ts`, `createLifeOsApplication.ts`;
  route/shell: `PlannerNavigation.ts`, `PlannerWorkspace.tsx`, при необходимости `ApplicationShell.tsx`.
- Sync/attachment/recovery — точные существующие точки перечислены в задачах 3–5.
- Экспорты: `src/domain/index.ts`, `src/application/index.ts`,
  `src/infrastructure/persistence/mappers/index.ts`, ближайшие локальные index.ts по текущему образцу.

### Task 1: Утвердить композицию нового раздела

**Files:** спецификация выше; создать `docs/design/references/2026-09-29-life-memory/README.md`
и локальный прототип/снимки в том же каталоге на этапе дизайна.

**Interfaces:** использует текущую оболочку/PlannerSheet/tokens; результат — утверждённые
desktop/mobile виды «Лента», «Редактор», «Мой год», empty и photo-pending.

- [x] Обновить browser baseline активного worktree и эффективные токены; использовать наблюдения
      спецификации как исходную точку, не считать их утверждением нового интерфейса.
- [x] Подготовить макет в текущей оболочке: 1440×1000, 390×844 и 360×800, длинный заголовок,
      карточки с фото/без фото, реальные состояния без декоративной имитации данных пользователя.
- [x] Проверить новую композицию по Правилу №38 и показать макет пользователю.
- [x] Зафиксировать ссылку/дату явного визуального утверждения. UI-код задач 6–8 начинается после
      этого шага; согласование самой идеи не подменяет утверждение макета.

### Task 2: Событие и локальные application-команды

**Files:** новые domain/application/persistence файлы карты;
изменить `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.ts`, composition и экспорты.
**Tests:** новые `src/domain/memory/MemoryEvent.test.ts`,
`src/infrastructure/persistence/MemoryCommands.integration.test.ts`,
`src/infrastructure/persistence/MemoryEventPersistence.test.ts`;
существующий `src/infrastructure/persistence/indexed-db/LifeOsIndexedDb.test.ts`.

**Interfaces:**

- `MemoryKind`, `MemoryContext`, `MemoryDiarySource`, `MemoryEvent`, `MemoryPhoto` — поля из spec.
- `MemoryRepository.findById(id: EntityId): Promise<MemoryEvent | null>` включает deleted.
- `MemoryRepository.save(event: MemoryEvent, expectedVersion: number | null, options?: MemorySaveOptions): Promise<MemoryEvent>`:
  null означает создание; версия проверяется в одной транзакции.
  `removePhoto: true` задаёт явное удаление фото; null без этого намерения сохраняет pending reference
  и фотографию, которая успела загрузиться после открытия редактора.
- `MemoryRepository.list(query: MemoryQuery): Promise<MemoryPage>`; query = year, kind?, sphereId?,
  search?, highlightOnly?, deleted, cursor?; page = items, nextCursor. Limit фиксирован: 30.
- `MemoryEventSummary` = поля события без photo bytes + hasPhoto; MemoryPage.items содержит
  эти summaries. Реализация читает cursor последовательно и не удерживает dataUrl всего года.
- `MemoryRepository.listYear(year: number): Promise<readonly MemoryEventSummary[]>` для годового обзора.
- `MemoryService.prepareCreate(): MemoryDraft` генерирует стабильный id через IdGenerator и
  предлагает today через CurrentDateProvider; повтор сохранения сохраняет этот id.
- `MemoryService.save(draft: MemoryDraft, expectedVersion: number | null): Promise<MemoryEvent>`;
  `remove(id: EntityId, expectedVersion: number): Promise<MemoryEvent>`;
  `restore(id: EntityId, expectedVersion: number): Promise<MemoryEvent>`.
- `MemoryDraft` = редактируемые поля spec + id; source/context задаются application, версии/время
  обновляет сервис. Clock/CurrentDateProvider/IdGenerator — существующие порты.
- Application проверяет `creationEnabled` для создания, импорта, копирования/восстановления и
  редактирования; чтение и применение remote sync не зависят от этого флага.

- [x] Написать тесты: пустой/161-символьный title и body 10001 отклоняются; границы 160/10000
      принимаются; future date отклоняется; 29.02.2024 допустима, 29.02.2025 — нет.
- [x] Проверить разные локальные даты устройств: сохранённая в другом часовом поясе запись
      принимается mapper/sync, читается, редактируется без изменения даты и восстанавливается.
- [x] Проверить optimistic conflict, abort, повтор той же save-попытки после потерянного ответа,
      два события в один день, reset курсора, поиск без учёта регистра, независимость context/source.
      Повтор create с тем же id и тем же payload возвращает уже сохранённое; с иным — conflict.
- [x] Запустить каждый новый файл через `npm run test:target -- <путь>` и увидеть ожидаемый FAIL.
- [x] Реализовать domain validation, команды и атомарный репозиторий; миграция добавляет store
      и составной индекс `[occurredOn, createdAt, id]` в следующей свободной версии после текущей 30.
      Не записывать пустые drafts и не пересоздавать существующие stores.
- [x] Повторить целевые тесты до PASS; migration-тест открывает предыдущую БД с данными diary/goal,
      обновляет схему и подтверждает неизменность записей. Отдельно проверить disabled-creation.
- [x] Просмотреть scoped diff; checkpoint commit включает только изменения этой задачи.

### Task 3: Structured sync и совместимость устройств

**Files:** `src/application/sync/SyncRegistry.ts`,
`src/infrastructure/sync/LifeOsSyncRegistry.ts`,
`src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`,
`src/infrastructure/sync/pilot/StructuredSyncFixtures.ts`, composition wiring флага.
**Tests:** `src/infrastructure/sync/LifeOsSyncRegistry.test.ts`,
`src/infrastructure/sync/pilot/StructuredSyncAdapters.test.ts`,
`src/infrastructure/sync/pilot/StructuredSyncApply.test.ts`,
`src/infrastructure/sync/pilot/IndexedDbPilotMutationRecorder.test.ts`,
`src/application/sync/pilot/PilotSyncProtocol.test.ts`,
`src/application/sync/pilot/PilotPullEngine.test.ts`.

**Interfaces:** новый sync type `memory_event` → MemoryEventRecord/mapper;
relationship к источникам optional/orphan-safe; remove/restore = обычный upsert полной записи
с изменённым deletedAt, без protocol operation tombstone;
`attachmentFields: ['photo']`. Контракт текущего PilotSyncProtocol не ослабляется.

- [x] Зафиксировать регрессионными тестами local mutation capture, round-trip, remote edit/delete/
      restore, отсутствующий source/goal/sphere, конфликт устройств без потери пользовательского текста.
- [x] Проверить фактический outgoing operation после remove: upsert; после применения на другом
      клиенте parent record и attachment reference остаются, restore сохраняет фото.
- [x] Проверить, что новый клиент читает memory_event при выключенном creation flag, а application
      не создаёт его через альтернативные entry points. Проверить сохранение других entity types.
- [x] Запустить затронутые targeted файлы, реализовать регистрацию/mapper/композицию, повторить до PASS.
- [x] Документировать воспроизводимый риск старого клиента: неизвестный type → quarantine и pull
      не продвигается. Добавить это в rollout; не вводить skip неизвестных событий.
- [x] Выполнить `npm run test:fast` после стабилизации общего контракта; проверить scoped diff.

### Task 4: Одна фотография через существующий attachment pipeline

**Files:** `src/application/sync/attachments/AttachmentContracts.ts`,
`src/infrastructure/sync/attachments/AttachmentRegistration.ts`,
`AttachmentTransferService.ts`, `AttachmentBootstrap.ts`,
`src/infrastructure/sync/pilot/PilotSyncRegistryAdapters.ts`,
MemoryPhoto/domain, MemoryRepository и его mapper.
Новые `src/application/ports/MemoryPhotoReader.ts`,
`src/infrastructure/memory/BrowserMemoryPhotoReader.ts` и wiring в createLifeOsApplication.ts.
**Tests:** `src/infrastructure/sync/attachments/SyncAttachmentIntegration.test.ts`,
`src/infrastructure/sync/attachments/AttachmentTransferService.test.ts`,
новый `src/domain/memory/MemoryPhoto.test.ts`, MemoryEventPersistence.test.ts.

**Interfaces:** DurableAttachment.entityType расширяется `'memory_event'`; поле parent = `photo`.
`MemoryPhoto { dataUrl: string; mimeType: string; sizeBytes: number }` имеет существующую форму
LocalSyncImage. Новые transport/buckets/ключи шифрования не создаются.
`MemoryPhotoReader.read(input: { bytes: Uint8Array; mimeType: string }): Promise<MemoryPhoto>`
проверяет лимит и поддерживаемый MIME до декодирования. BrowserMemoryPhotoReader проверяет
реальное декодирование, освобождает object URLs/bitmap и возвращает dataUrl без перекодирования.
UI получает reader через composition; add/remove photo изменяют черновик, persist выполняет save.

- [x] Написать кейсы memory parent: offline create → restart → upload → download на втором
      поддерживаемом клиенте; редактирование текста во время pending-download сохраняет reference.
- [x] Добавить точные границы: 0 и 5 MiB + 1 отклоняются, 5 MiB принимается; неверный MIME/base64,
      повреждённые/недекодируемые данные не заменяют прежнее фото. UI допускает JPEG/PNG/WebP.
- [x] Добавить `src/infrastructure/memory/BrowserMemoryPhotoReader.test.ts` для валидации/cleanup;
      реальное декодирование и отмену выбора файла проверить scoped browser-сценарием задачи 6.
- [x] Проверить replacement, retry, quota failure, integrity quarantine и мягкое delete/restore.
      При remove памяти байты/reference сохраняются, parent soft-delete не запускает их очистку.
- [x] Запустить targeted тесты (FAIL), добавить memory ветки registration/transfer/материализации.
      Использовать отдельный checkpoint `attachment-bootstrap:memory-v1:<spaceId>`; второй проход
      идемпотентен и не создаёт повторных attachments.
- [x] Повторить targeted до PASS, включая неизменные goal/walk сценарии в этих же файлах.
      Проверить diff: открытые dataUrl не попадают в structured sync/logs.

### Task 5: Снимки и восстановление до пользовательского ввода

**Files:** `src/infrastructure/sync/IndexedDbSnapshotService.ts`,
`src/infrastructure/sync/recovery/IndexedDbRecoveryStore.ts`; при необходимости расширить
валидацию `src/application/sync/recovery/SyncRecoveryService.ts` без смены смысла общего протокола.
**Tests:** соответствующие `.test.ts` у трёх файлов, MemoryEventPersistence.test.ts.

**Interfaces:** snapshot включает memoryEvents; версия появления store учтена в
`hasCompleteStoreManifest`; memory parent использует существующий `syncSnapshotImage` fallback.

- [x] Написать тесты старого snapshot без memory store и нового с обязательным store; повреждённый
      новый snapshot отклоняется до изменения пользовательских данных.
- [x] Проверить restore offline-фото без cloudVerifiedAt и восстановление подтверждённой ссылки;
      deleted event восстанавливается как deleted с доступным фото для дальнейшего restore.
- [x] Запустить targeted (FAIL), расширить snapshot capture/materialization/restore; подтвердить
      сохранение pre-restore snapshot и атомарность существующего recovery пути.
- [x] Повторить targeted до PASS вместе с goal/walk/diary fixtures. Не обещать backup локальному
      пользователю, если existing recovery service недоступен без активной sync-конфигурации.
- [x] Если задачи 3–5 меняли общие пути после прошлого test:fast, повторить его один раз;
      подготовить scoped diff для независимого read-only review.

### Task 6: Лента, редактор, просмотр и восстановление

**Files:** новые PlannerMemory.tsx, MemoryTimeline.tsx, MemoryEditor.tsx, memory.css;
PlannerNavigation.ts, PlannerWorkspace.tsx, AppIcon.tsx, composition exports.
**Tests:** новые `src/presentation/planner-v2/memory/PlannerMemory.test.tsx`,
`MemoryEditor.test.tsx`, существующий `src/presentation/planner-v2/PlannerNavigation.test.ts`;
новый `tests/e2e/current.memory.spec.ts`.

**Interfaces:** `#/v2/memory?year=YYYY&mode=timeline|year&kind=...&sphereId=...&highlight=1&deleted=1`
и `#/v2/memory/<id>`; новые поля query необязательны, невалидный year → текущий год.
MemoryQueries предоставляет `list(query)` и `get(id)`; React не обращается к IndexedDB напрямую.
Редактор вызывает MemoryService из задачи 2; native file selection остаётся явным действием.

- [x] После утверждения макета написать render/interaction тесты пустой ленты, 31+ событий,
      сброса фильтров/курсора, отсутствующего фото, длинного текста, disabled/busy/error/conflict.
- [x] Проверить stable draft id, double-submit, Esc/кнопку закрытия/backdrop/route guard,
      сохранение текста при ошибке фото и возвращение фокуса в инициатор панели.
- [x] Реализовать UI на PlannerSheet/VoiceTextInput/VoiceTextArea/RouteLeaveGuard и общих controls.
      Показать одну photo preview только для загружаемых карточек; редактор должен знать available/
      pending/reference state, чтобы правка текста не удаляла нескачанную фотографию.
- [x] Добавить toggle «Главное», delete и фильтр «Удалённые» с restore через сервис; прямой URL
      удалённого события даёт понятное состояние, не позволяет случайно редактировать удалённое.
- [x] Выполнить targeted render/navigation tests и scoped E2E
      `npm run test:e2e -- tests/e2e/current.memory.spec.ts` на desktop/mobile проектах.
      E2E: create → reload → edit → search → highlight → delete → restore, включая фото и guard.

### Task 7: Ручное сохранение из дневника

**Files:** новый `src/application/memory/MemoryDiaryImport.ts`;
`src/presentation/planner-v2/diary/PlannerDiary.tsx`, DiaryDayView.tsx, DiaryWeekView.tsx,
DiaryMonthView.tsx; memory editor и route handoff.
**Tests:** новый `src/infrastructure/persistence/MemoryDiaryImport.integration.test.ts`, DiaryPeriodViews.test.tsx,
PlannerDiary.test.tsx и `tests/e2e/current.diary.spec.ts`.

**Interfaces:** `MemoryDiaryImport.prepare(kind: DiaryPeriodKind, anchor: DayDate,
field: DiaryMemoryField, expectedVersion: number): Promise<MemoryDraft>` читает сохранённый DiaryEntry,
копирует ровно один непустой ответ, сохраняет source metadata, генерирует draft id.
`DiaryMemoryField` — объединение текстовых полей существующих DiaryDay/Week/MonthPayload,
валидируемое по kind; оценки не превращаются в воспоминания. Заголовок предлагается из подписи
вопроса, категория moment; дату периода предлагает application по spec.

- [x] Написать тесты day/week/month, пустого поля, несоответствия field/kind, несовпадения версии,
      повторного submit, текста >10000 и нескольких разных воспоминаний из одной записи.
- [x] Реализовать импорт через repository/application; дождаться успешного autosave до подготовки.
      При ошибке или конфликте редактор дневника сохраняет текст и предлагает повторить сохранение.
- [x] Подключить «Сохранить в память» к непустым ответам, открыть предзаполненный редактор;
      cancel не создаёт событие. Submit использует обычный MemoryService.save.
- [x] Проверить последующее редактирование/недоступность дневника: память сохраняет свой текст,
      переход ведёт в точный diary period или сообщает о недоступном источнике.
- [x] Выполнить targeted и scoped E2E для добавленных diary-сценариев через `--grep`, не повторять
      весь дневник без нового риска. Клавиатурный ввод и возврат фокуса проверены.
- [ ] Проверить настоящий микрофон Windows/Android на установленных клиентах при подготовке выпуска;
      shared Voice Input переиспользован, native-проверка текущим этапом не выполнена.

### Task 8: Обзор «Мой год»

**Files:** `src/application/memory/MemoryQueries.ts`,
`src/presentation/planner-v2/memory/MemoryYearView.tsx` и memory.css.
**Tests:** новый `src/application/memory/MemoryQueries.test.ts`,
`src/presentation/planner-v2/memory/MemoryYearView.test.tsx`, current.memory.spec.ts.

**Interfaces:** `buildMemoryYearOverview(events: readonly MemoryEventSummary[], year: number): MemoryYearOverview`;
overview = year, uniqueEventCount, highlights, achievements, months (month, event summaries).
`MemoryQueries.getYear(year: number): Promise<MemoryYearOverview>` читает репозиторий;
overview содержит ссылки/резюме, не вторые persisted events или копии photo bytes.

- [x] Написать тесты границы 31 декабря/1 января, високосного дня, пустого/текущего года,
      deleted events, события в двух тематических блоках при одном uniqueEventCount.
- [x] Реализовать чистую проекцию и утверждённый экран; открытия событий возвращаются в выбранный
      год и фильтры. Без оценивания ценности жизни и генерации отсутствующих фактов.
- [x] Выполнить targeted и новый `--grep` сценария «Мой год» в current.memory.spec.ts.
      Убедиться, что edit/delete/restore корректно обновляют вид; большие фото загружаются по запросу.

### Task 9: Приёмка и две поставки

**Files:** создать `docs/design/features/2026-09-29-life-memory-verification.md` во время
реализации; release notes/manifests менять только в отдельном разрешённом этапе выпуска.

**Interfaces:** результат — фактические verification evidence, список устройств/версий,
раздельная готовность совместимости A и пользовательской поставки B.

- [x] Просмотреть scope/diff; независимый read-only review особенно для soft-delete фото,
      sync/restore, поля diarySource и default-off доступности всех команд.
- [x] Выполнить один актуальный `npm run verify` после стабилизации. Существующий успешный
      результат не повторять ради отчёта или документационной правки.
- [x] Выполнить scoped memory/diary E2E и затронутые account-sync сценарии; desktop/mobile QA
      1440×1000, 390×844, 360×800, keyboard, reduced-motion, console и Правило №38.
- [ ] Проверить на реальных Windows + телефоне (после разрешения на установку/выпуск): фото в обе
      стороны, offline/restart/reconnect, текст при pending-photo, мягкое delete/restore. Browser
      emulation не подменяет эту native-проверку; непроведённую проверку явно отметить.
- [ ] Поставка A: новый тип читается/сохраняется/восстанавливается, creation flag выключен.
      Проверить, что устройства реально обновлены, прежде чем готовить B с включённым флагом.
      Старые клиенты не подключать после B; при неподтверждённом обновлении B не выпускать.
- [ ] Для каждой реально подготавливаемой поставки выполнить полный E2E после verify по R12;
      если один и тот же финальный код/конфигурация уже проверены, не повторять зелёный gate.
      Выключенный флаг A и включённый B проверяются как разные конфигурации.
- [ ] Сохранить snapshot по существующему поддерживаемому механизму и проверенные установщики;
      rollback — сохранение данных/forward fix, не downgrade БД с очисткой.
- [ ] Перед публикацией подготовить конкретные release artifacts и результаты проверки.
      Публиковать только в рамках отдельного разрешения пользователя; текущий запрос разрешает
      реализацию, но не выпуск.

## Краткая последовательность

Макет → независимые события → sync/совместимость → фото → recovery → лента/редактор →
ручная связь с дневником → «Мой год» → проверка устройств и разрешённый выпуск.
Первый видимый этап для пользователя — утверждение макета. Завершённая первая версия содержит
все функции spec; промежуточная текстовая лента не выдаётся за готовую поставку с фотографиями.
