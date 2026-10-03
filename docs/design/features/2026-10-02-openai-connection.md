# Подключение OpenAI

## Scope

Первое подключение: один явно отправленный вопрос и текстовый ответ в существующем
разделе аккаунта. Предположение до уточнения сценария: задачи, дневник, историю вопросов
не читать, не отправлять и не сохранять. Предметные команды не выполняются.

## Дизайн-контракт

- FEATURE: новая функция существующей страницы аккаунта.
- USER GOAL: задать вопрос OpenAI внутри LifeOS.
- EXISTING LOGIC: единственный Supabase client и native auth storage.
- PAGE/COMPONENT ARCHETYPE: стандартная форма настроек, без новой навигации.
- SECTION COLOR: текущий jade акцент; графитовая поверхность; success/error по смыслу.
- MAIN VISUAL CENTER: поле вопроса и полученный ответ внутри блока.
- COMPONENTS TO REUSE: account-panel, account-form, account-feedback, VoiceTextArea.
- MOBILE BEHAVIOR: одна колонка, перенос длинного текста, touch controls >= 44px.
- APPROVED REFERENCE: отдельный не требуется; текущая страница /#/v2/account.
- TEST SCOPE: server/auth/transport/application tests, render tests, scoped browser flow.

Baseline: browser /#/v2/account, desktop 1280×850 и узкая мобильная область.
В browser аккаунт недоступен по существующему native-only контракту.
Каскад: global → planner-v2 → planner-master → account-sync → planner-premium.
Вычисленная account-panel: rgb(17,24,27), текст rgb(238,243,242), padding 24px,
Inter/Segoe UI/system-ui. Новых декоративных мотивов нет.

## Архитектура и безопасность

Presentation → application AI service → Supabase adapter с существующим client →
Supabase Edge Function → OpenAI Responses API. OpenAI key/model и allowlist user IDs
настраиваются только серверными secrets. По умолчанию интеграция выключена.
Сервер проверяет пользователя через Supabase Auth, отклоняет anonymous/unverified
и аккаунты вне allowlist. Вход ограничен 4000 символами, ответ — 12000 символами,
max_output_tokens — 1200. Тайм-аут сети, отсутствие автоматических повторов.
Провайдер получает только текущий вопрос и фиксированные инструкции, store:false,
без tools. Raw ошибки/headers/секреты не возвращаются и не логируются.

Local-only и browser сборки сохраняют существующее поведение: AI недоступен.
Новые stores и миграции пользовательских данных не нужны. Серверная функция не
имеет доступа к расшифровке sync. Ответ выводится обычным текстом без HTML.

## Приёмка и граница активации

Пустой/слишком длинный вопрос, недоступный сервис и запрещённый пользователь не
вызывают OpenAI. При ошибке вопрос остаётся в форме. Повторный submit блокируется;
отмена/unmount прекращают ожидание. Недоверенный ответ валидируется.

Реальное подключение требует серверного API-ключа, выбранной доступной модели,
allowlist и deployment Edge Function. Это отдельная внешняя операция после локальной
проверки; ключ не передаётся через чат и не входит в VITE_* или Git.

Источники: [OpenAI Responses](https://developers.openai.com/api/docs/guides/text),
[Supabase Auth](https://supabase.com/docs/guides/functions/auth).

## Visual review

Проверены текущая account-страница и OpenAiPanel в fixture с тем же CSS: desktop и
mobile 390×844. Один главный CTA, обычные поля account-form, текстовые состояния,
отсутствие горизонтального overflow, клавиатурная отправка, безопасный вывод текста.
Новых анимаций, фонов, цветов или controls нет. Иерархия зависит от расположения и
подписей; reduced-motion не требует новых правил. Console/page errors отсутствуют.
Проверка по №38 выполнена для этой стандартной формы; это технический review,
а не пользовательский статус APPROVED/LOCKED.
