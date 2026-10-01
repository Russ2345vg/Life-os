# «Состояние данных» — проверка реализации и UX

Дата: 01.10.2026. Область: [UX-спецификация](../design/features/2026-10-01-clear-feedback.md) и [план](../superpowers/plans/2026-10-01-clear-feedback.md). Визуальный результат ещё не утверждён пользователем.

## Результат

В desktop ссылка «Состояние данных» находится под быстрым поиском и открывает текущую страницу аккаунта одним кликом. На mobile она стала первым пунктом «Ещё», путь занимает два нажатия. Кнопка возврата ведёт в исходный route, включая день и вид. Прямое открытие, перезагрузка и browser Forward без нового входа дают fallback в «Сегодня». Новые подписи объясняют, что очередь считает изменения, а время показывает последний обмен **в этом сеансе**. Вход сам не запускает синхронизацию.

При тестировании обнаружено, что обычный возврат из заполненной формы аккаунта ранее обходил защиту черновика из «Быстрого доступа». Для входа и ухода теперь используется guard-aware навигация; отказ сохраняет текст и исходный route. Подтверждение использует модальный native dialog: фон недоступен, Tab остаётся внутри, Escape отменяет уход и возвращает фокус. Browser Back закрывает ожидающее подтверждение. Контракт самого транспорта и вычисления статусов не менялся.

## Экспертный проход

Проверка проведена в локальном Chrome с пустым пользовательским хранилищем и синтетическими account fixtures. Снимки: [desktop-вход](../design/references/2026-10-01-feedback-ux-audit/implementation-entry-1440.png), [mobile-меню](../design/references/2026-10-01-feedback-ux-audit/implementation-entry-390.png), [ready на 320 px](../design/references/2026-10-01-feedback-ux-audit/implementation-ready-320.png), [offline](../design/references/2026-10-01-feedback-ux-audit/implementation-offline-390.png), [error](../design/references/2026-10-01-feedback-ux-audit/implementation-error-390.png), [sign-in](../design/references/2026-10-01-feedback-ux-audit/implementation-sign-in-required-390.png), [unavailable](../design/references/2026-10-01-feedback-ux-audit/implementation-unavailable-390.png), [подтверждение ухода desktop](../design/references/2026-10-01-feedback-ux-audit/implementation-back-confirm-desktop-chrome.png) и [mobile](../design/references/2026-10-01-feedback-ux-audit/implementation-back-confirm-mobile-chrome.png). Остальные `implementation-*.png` лежат рядом.

| Задание                  | Наблюдение                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Найти состояние из Today | 1 клик на 1440×900 и 1280×720; 2 нажатия на 390×844 и 320×700. Ссылка видна без прокрутки; область desktop ≥44 px, mobile ≥44 px.                                                                                                                                                         |
| Вернуться в работу       | Today/Завтра, Diary с датой и Actions с видом восстановили тот же URL. Direct URL/reload/Forward показали fallback в Today.                                                                                                                                                               |
| Не потерять черновик     | Ошибка записи Diary остановила вход; заполненная форма аккаунта предложила остаться или уйти. При выборе «Остаться» текст и route остались.                                                                                                                                               |
| Прочитать счётчики       | Ready, offline, pending и error показывают «Ожидают отправки», «Количество изменений, а не задач» и «Сохранённые конфликтные версии». Sign-in и unavailable не получили неработающую кнопку синхронизации. Это экспертная оценка текста, а не проверка понимания участниками.             |
| Клавиатура и узкий экран | Desktop-ссылка активируется Enter; mobile-меню закрывается Escape с возвратом фокуса на «Ещё», первый пункт активируется Enter. Возврат из черновика фокусирует «Остаться». Horizontal overflow не обнаружен ни в одном из проверенных состояний. Reduced motion отключает анимацию меню. |

Сравнение снимков Today до и после показывает неизменное положение основного контента и первой формы: новый вход использует только вертикальное место sidebar. На 1280×720 последняя основная ссылка остаётся в viewport. Новые подписи переносятся на 320 px, карточки не обрезаны. Browser console/page errors в проверенных состояниях не обнаружены.

Вычисленные цвета и контраст зафиксированы в [desktop-метриках](../design/references/2026-10-01-feedback-ux-audit/implementation-metrics-desktop-chrome.json) и [mobile-метриках](../design/references/2026-10-01-feedback-ux-audit/implementation-metrics-mobile-chrome.json): ссылка — 9,82:1 desktop и 6,72:1 mobile; подписи метрик — 9,82:1. Проверенные пары превышают 4,5:1. Смысл входа и состояний передаётся текстом и иконкой, без одной лишь окраски.

Проверка по Правилу №38: сохранены иерархия Today, единая палитра graphite/jade и существующие элементы; новые loading/empty/error/success экраны не создавались, используются состояния Account. Mobile перестраивает вход в меню и метрики в одну колонку. Focus и reduced motion проверены scoped browser-сценариями. Снятие цвета/рамок и работа с реальным screen reader не проводились; полного соответствия WCAG этот проход не устанавливает.

## Проверки и границы

- `npm run test:target -- src/presentation/planner-v2/AccountSyncPage.test.tsx` — 19 тестов прошли.
- `npm run test:e2e -- tests/e2e/current.data-status-navigation.spec.ts` — 14 сценариев прошли на desktop/mobile, включая visual evidence, guards и клавиатуру.
- `npm run test:e2e -- tests/e2e/account-sync.spec.ts` — 12 сценариев прошли на desktop/mobile.
- `npm run verify`: typecheck и lint прошли; полный unit-этап остановился на `CompleteLifeAction.integration.test.ts:140` (`idle` вместо ожидаемого `offline`). Из 1915 тестов 1913 прошли, 1 упал, 1 пропущен. Этот тест и его completion/sync-контракт относятся к предсуществующим незакоммиченным изменениям и текущим UX-патчем не менялись. Отдельный `npm run test:target -- src/infrastructure/persistence/CompleteLifeAction.integration.test.ts` воспроизвёл ту же ошибку (1 из 4 упал).
- После остановки общего gate отдельные `npm run test:infra` (60/60), `npm run test:alpha` (1/1), `npm run build` и `npm run format:check` прошли. `git diff --check` не обнаружил ошибок пробелов.

Ручной UX-проход с пользователем **не проводился**: время обнаружения ≤10 секунд, понимание очереди и времени обмена человеком не измерены. Реальная доставка между устройствами, native-клиент, экранная клавиатура телефона, screen reader и browser zoom отдельно не проверялись. Старые вычисления sync/Diary/completion намеренно вне этой задачи; текущий визуальный проход не подтверждает их корректность.
