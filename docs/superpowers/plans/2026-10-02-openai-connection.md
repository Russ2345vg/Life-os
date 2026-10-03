# План подключения OpenAI

**Goal:** вопрос и ответ OpenAI в существующем разделе аккаунта.
**Spec:** [Контракт](../../design/features/2026-10-02-openai-connection.md).
**Architecture:** application port, Supabase adapter, серверная Edge Function.
**Tech Stack:** существующие TypeScript/React/Supabase; fetch без нового SDK.

Главный агент выполняет изменения inline; read-only архитектурный review выполнен.
Работа в чистом активном worktree D:/LifeOS-App. Commit/push/deploy не выполняются.

1. [x] Добавить тесты серверного handler: авторизация, allowlist, вход, ответ, ошибки.
       Реализовать supabase/functions/lifeos-openai/handler.ts и index.ts.
2. [x] Добавить application AI service/port и Supabase adapter с bounded запросом.
       Тесты сервиса/адаптера; composition с единственным существующим client.
3. [x] Добавить стандартную форму рядом с AccountSyncPage через application API.
       Проверить состояния, обычный текст, отмену и scoped browser flow.
4. [x] Подготовить инструкцию активации и серверный .env.example без секретов.
       Targeted tests → npm run verify → scoped E2E. Полный E2E не требуется:
       routing, startup, схема хранения и sync protocol не меняются.
5. [x] Read-only final review, git diff --check, diff/status; сообщить ограничения
       реального API smoke без server secrets/deployment.

Review focus: anonymous JWT, provider errors with secrets, late responses after
cancel, double submit, browser without native auth, feature disabled by default.

## Результат локальной проверки

- Targeted: 7 файлов, 51 тест — passed.
- `npm run verify`: exit 0; 2050 unit/integration passed, 1 skipped; 60 infra и
  1 alpha passed; typecheck, lint (11 существующих предупреждений), build, формат
  и Git hygiene passed.
- `npm run test:e2e -- tests/e2e/current.openai.spec.ts`: 8/8 passed на desktop/mobile;
  runner подтвердил освобождение порта 4173 после fallback cleanup owned process.
- Дополнительный bounded TypeScript check Edge entrypoint с
  `--ignoreConfig --allowImportingTsExtensions --noEmit --strict`: exit 0.
- Read-only review: actionable defects не найдены.
- Browser QA текущего account route и production-компонента в fixture: baseline,
  desktop/mobile, plain-text response, keyboard submit, console без ошибок.
- Полный E2E не нужен: изменение ограничено AI-панелью и отдельным API endpoint.

Реальный OpenAI запрос, Deno/Supabase deployment и native authenticated smoke пока
не выполнены: нужны server secrets, доступная модель, allowlist и разрешение на
развёртывание. Перед deployment проверяется совместимость JWT gateway проекта.
Интеграция остаётся выключенной по умолчанию; API-ключ в окружении сессии отсутствует.
