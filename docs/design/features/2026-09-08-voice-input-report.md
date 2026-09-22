# Voice Input — отчёт реализации

Дата: 2026-09-08. Рабочий проект: `D:/LifeOS-App`.

## 1. Что обнаружено

До реализации общих Input/Textarea не было. Формы использовали native controlled inputs и
textarea, иногда через локальные оболочки. Источником состояния остаются существующие draft и
application-команды. Аудит обновлён относительно утверждённой спецификации: **88 полей-шаблонов
в 25 файлах**, 85 мест JSX. Четыре использования GoalForm.TextAreaField считаются раздельно;
динамические списки считаются шаблонами, а не количеством полей на экране.

Изменения синхронизации, persistence, платформы и настроек агента присутствовали до этой задачи.
Их сохраняли; commit/push не выполнялись. Проверка AST подтвердила сохранение тела каждого
callback текстовых значений во всех 25 мигрированных файлах относительно снимка начала задачи.

## 2. Архитектура

```text
VoiceField + VoiceTextInput / VoiceTextArea + VoiceInputButton
                         ↓
                  useVoiceInput
                         ↓
         Application VoiceInputCoordinator
       one owner / state / buffer / stale guard
                         ↓
       Application SpeechRecognitionProvider port
                         ↑
   Infrastructure BrowserSpeechRecognitionProvider
                         ↑
        App createVoiceInputRuntime / Provider

final transcript → insertVoiceTranscript → existing onValueChange → existing draft
```

Язык по умолчанию `ru-RU`; доступен `voiceLanguage`. Финальные фрагменты буферизуются до end;
interim не попадает в форму. Вставка учитывает актуальные value/курсор/выделение/maxLength.
Обработка ошибок, single-owner и cleanup централизованы. Таймер processing ограничен 15 секундами
после stop; повторное обращение к микрофону происходит только по действию пользователя.

## 3. Новые файлы

Все пути ниже относительно корня проекта.

| Файл                                                                      | Назначение                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/application/ports/SpeechRecognitionProvider.ts`                      | Независимые от платформы события, ошибки и контракт сессии            |
| `src/application/voice-input/VoiceInputCoordinator.ts`                    | Один владелец, конечные состояния, буфер, timeout и cleanup           |
| `src/application/voice-input/VoiceInputCoordinator.test.ts`               | Проверки состояний, владельцев, ошибок и поздних событий              |
| `src/infrastructure/voice-input/BrowserSpeechRecognitionProvider.ts`      | Browser/WebKit detection, адаптация событий и освобождение ресурсов   |
| `src/infrastructure/voice-input/BrowserSpeechRecognitionProvider.test.ts` | Контракты адаптера с fake constructor                                 |
| `src/app/composition/createVoiceInputRuntime.ts`                          | Выбор браузерного адаптера в App                                      |
| `src/app/providers/VoiceInputProvider.tsx`                                | Общий transient runtime, StrictMode-safe disposal                     |
| `src/presentation/voice-input/VoiceInputContext.ts`                       | Контексты координатора и доступной подписи                            |
| `src/presentation/voice-input/useVoiceInput.ts`                           | Подписка владельца, одноразовая доставка transcript и feedback timer  |
| `src/presentation/voice-input/insertVoiceTranscript.ts`                   | Чистая вставка, пробелы, лимит длины и каретка                        |
| `src/presentation/voice-input/insertVoiceTranscript.test.ts`              | Позиции, выделение, Unicode и ограничения вставки                     |
| `src/presentation/voice-input/VoiceInputButton.tsx`                       | Общая кнопка, состояния, labels и tooltip                             |
| `src/presentation/voice-input/VoiceTextControl.tsx`                       | Controlled update, native refs/handlers, курсор, actions и сообщения  |
| `src/presentation/voice-input/VoiceTextControl.test.tsx`                  | Разметка, native атрибуты и opt-out                                   |
| `src/presentation/voice-input/VoiceTextInput.tsx`                         | Переиспользуемый text/search input                                    |
| `src/presentation/voice-input/VoiceTextArea.tsx`                          | Переиспользуемый textarea                                             |
| `src/presentation/voice-input/VoiceField.tsx`                             | Связь caption с полем без включения названий кнопок в accessible name |
| `src/presentation/voice-input/voice-input.css`                            | Общая панель действий, токены, focus, feedback и reduced motion       |
| `tests/e2e/voice-input.acceptance.spec.ts`                                | Детерминированные сценарии в Chrome desktop/mobile                    |
| `tests/fixtures/voice-input.html`                                         | Test-only страница контрактов общих полей                             |
| `tests/fixtures/voice-input.tsx`                                          | Реальные shared components под StrictMode для пограничных сценариев   |
| `docs/superpowers/plans/2026-09-08-voice-input-system.md`                 | План этапов и проверок                                                |
| `docs/design/features/2026-09-08-voice-input-report.md`                   | Этот отчёт                                                            |

## 4. Основные изменения

- `src/app/App.tsx`: подключён общий VoiceInputProvider.
- `src/presentation/components/AppIcon.tsx`: одна контурная иконка микрофона.
- 25 файлов из таблицы ниже: замена только подходящих native controls на shared primitives,
  сохранение callbacks, native refs, валидации, submit и прочих обработчиков.
- Оборачивающие подписи и два локальных form wrapper используют VoiceField; существующая DOM
  структура label сохранена. Две простые текстовые подписи получили span для association.
- `src/presentation/styles/planning-tomorrow.css`: счётчик текста размещён обычной строкой;
  браузерный regression test подтверждает отсутствие перекрытия voice feedback.
- `src/presentation/walk/WalkCompletionFlow.test.ts`: снято устаревшее требование отсутствия voice
  во всей разметке, сохранены ограничения других функций и проверено наличие общей кнопки.
- `tests/e2e/walk09.decision.spec.ts`: helper ищет поле по caption и отдельно проверяет доступное
  описание. Подсказка больше не дублируется в имени поля после исправления label association.
- `LifeOS_DESIGN_RULES_v1.md`: правило №33.1. Правило №33 о доступности и №38 не перенумерованы.
- `docs/design/features/2026-09-04-voice-input-system.md`: актуальный аудит и refinements реализации.

## 5. Покрытие приложения

Пути относительно `src/presentation/`.

| Файл / форма                                                             | Полей |
| ------------------------------------------------------------------------ | ----: |
| `goals/GoalForm.tsx` — создание/редактирование цели                      |     5 |
| `management/ProjectsSection.tsx` — проекты                               |     3 |
| `management/DirectionsSection.tsx` — направления и стратегический review |    12 |
| `pages/DecisionCreationForm.tsx` — создание решения                      |     6 |
| `components/DecisionDetailsPanel.tsx` — решение и связанные действия     |    11 |
| `components/LifeActionDetailsPanel.tsx` — действие, описание и результат |     5 |
| `pages/TodayPage.tsx` — быстрое решение                                  |     2 |
| `pages/HistoryPage.tsx` — поиск и исправление записей                    |     3 |
| `pages/EveningAnalyticsPage.tsx` — результат и первый шаг                |     3 |
| `pages/EveningReflectionScene.tsx` — осмысление                          |     3 |
| `pages/EveningResolvingScene.tsx` — итоговая заметка                     |     1 |
| `pages/EveningReviewPanel.tsx` — вечерние заметки и план                 |    10 |
| `pages/EveningSleepCheckScene.tsx` — мысль на завтра                     |     1 |
| `pages/MorningCenterPage.tsx` — настрой                                  |     1 |
| `pages/MorningPhysicalActivationPage.tsx` — название упражнения          |     1 |
| `pages/TomorrowComposer.tsx` — планирование завтра                       |     6 |
| `pages/TomorrowPlanningCenter.tsx` — подробная форма завтра              |     6 |
| `pages/WalksPage.tsx` — итог прогулки                                    |     1 |
| `walk/WalkCaptureComposer.tsx` — новая мысль                             |     1 |
| `walk/WalkCaptureDetails.tsx` — редактирование мысли                     |     1 |
| `walk/WalkCompletionFlow.tsx` — осмысление прогулки                      |     1 |
| `walk/WalkSessionFlow.tsx` — вопрос для размышления                      |     1 |
| `routine/RoutineBlockForm.tsx` — название блока                          |     1 |
| `pages/SpheresPage.tsx` — название и описание сферы                      |     2 |
| `sync/SyncPage.tsx` — обычное имя устройства                             |     1 |

## 6. Исключения

Без микрофона остались password/PIN, numeric/date/time, checkbox/radio/select/range/switch, file,
color, emoji/icon, единицы измерения и числовые ShortField цели, recovery/pairing payloads.
Это 72 native JSX-места либо 76 с разворачиванием ShortField; select и кнопки в эти числа не входят.
Для новых полей доступно явное `voiceInput={false}`.

## 7. Проверки

| Проверка                                | Фактический результат                                                    |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Targeted core/provider/insertion/render | 45 новых тестов прошли; сначала зафиксированы падающие прогоны           |
| Targeted затронутых форм                | Прошли, последний набор 30 тестов в 5 файлах                             |
| `npm run test:fast`                     | PASS: 1498 тестов, 147 файлов                                            |
| `npm run typecheck`                     | PASS, также повторно внутри окончательного verify                        |
| `npm run lint`                          | PASS: 0 errors; 14 Fast Refresh warnings, из них 1 в test fixture        |
| `npm run test`                          | PASS внутри verify: 3108 тестов, 372 файла                               |
| `npm run test:infra`                    | PASS внутри verify: 55 тестов                                            |
| `npm run test:alpha`                    | PASS внутри verify: 1 тест                                               |
| `npm run build`                         | PASS внутри verify                                                       |
| `npm run format:check`                  | PASS внутри verify                                                       |
| `npm run verify`                        | PASS, exit 0                                                             |
| Полный `npm run test:e2e`               | PASS, exit 0: 147 passed, 31 штатный skipped, 0 failed/flaky (178 всего) |
| `git diff --check`                      | PASS                                                                     |

Первый verify выявил только старый запрет voice в тесте прогулки. Причина исследована, тест обновлён
в соответствии с новым поведением; окончательный verify полностью прошёл.

Первый полный E2E: 138 passed, 9 failed, 31 skipped. Все девять ошибок относились к одному
устаревшему locator в WALK-09. После исправления helper отдельный WALK-09 прошёл: 9 passed,
3 штатных skipped, exit 0. Дополнительно прошли scoped ESLint и Prettier этого теста;
независимый review подтвердил сохранение строгих проверок доступности. Повторный полный E2E
прошёл за 960.41 секунды; все 12 voice-сценариев прошли без пропусков. Сервер остановлен,
порт 4173 освобождён. Код приложения после успешного verify не менялся.

## 8. Browser QA

Проверены в реальном Chrome с fake SpeechRecognition: пустое поле, вставка после «я», выделение,
контролируемый draft/preview, stop/processing, ошибка разрешения, unsupported, переключение полей,
Escape, unmount, ручной ввод во время записи, maxLength, одинаковый результат выделения, native ref,
StrictMode повторное открытие и отсутствие submit. Counter regression также воспроизведён и исправлен.

Проверены 1600×900, 1280×720, 390×844, 360×800: нет горизонтального overflow, текст не пересекается
с действиями, touch-zone ≥44×44, reduced motion отключает пульсацию. Выполнен просмотр снимков
осмысления и завершения прогулки; главный визуальный центр и графитовый язык сохранены.
Повторно просмотрены итоговые снимки формы цели на ширинах 1280 и 390 px. Для новых элементов
проверен контраст токенов на `surface-2`: обычный текст 7.98:1, текст ошибки 5.66:1,
семантические иконки 4.18:1 и выше; disabled рассматривается отдельно.

Проверка применимых пунктов правила №38: микрофон остаётся вторичным действием; основной CTA,
архетипы и композиция страниц сохранены. Используются общие AppIcon, tokens, spacing и focus;
новые карточки, tabs и постоянные акценты не добавлены. Listening/processing/error/success,
disabled и отсутствие результата имеют текстовое объяснение; retry запускается пользователем.
Смысл состояний передаётся подписью, иконкой и live region, а не одним цветом. Grid actions
резервирует место и сохраняет читабельность на узкой ширине. Автопроверки подтверждают touch-zone,
отсутствие overflow, клавиатурное управление и reduced motion. Подтверждение владельцем визуального
результата остаётся отдельным от этой технической проверки.

Прямой инструмент встроенного браузера не запустился (missing kernel assets). Дополнительный
dev server 4174 остановлен, порт освобождён. Снимки и поведение Chrome получены через Playwright.
Визуальный результат не помечен APPROVED/LOCKED от имени владельца.

## 9. Ограничения

Физический микрофон, ОС-разрешение, качество русской диктовки и сервис распознавания производителя
браузера **не проверены реальным звуком**. Требуется проверка на устройстве пользователя: диктовка
«Это проверка голосового ввода», вставка «после работы», отказ разрешения и переключение полей.
Fake provider подтверждает реакцию приложения, но не качество распознавания.

Наличие Web Speech зависит от браузера/WebView. Native/Tauri/Android engines здесь не реализованы;
при отсутствии API показано unsupported, клавиатура работает. Browser provider может использовать
службу производителя браузера; заявлений о полной локальности нет.
[Web Speech specification](https://webaudio.github.io/web-speech-api/) допускает разные движки
обработки и требует согласия пользователя перед speech input.

Никаких новых зависимостей, платных API, сохранения аудио или отправки в backend LifeOS нет.

## 10. Следующий этап

Voice Commands / AI Assistant потребует отдельного контракта намерений, подтверждения действий,
подключения существующих application-команд и самостоятельного review приватности/провайдера.
В этой задаче команды, NLP, LLM и API не реализованы.
