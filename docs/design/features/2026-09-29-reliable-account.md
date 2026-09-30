# Надёжный аккаунт

Дата: 29.09.2026. Пользователь подтвердил реализацию после аудита входа.
Основа: [аудит](../../sync/2026-09-29-account-login-audit.md).

## Цель и границы

Вход завершается понятным состоянием. Ошибка объясняет следующий шаг. Смена auth session
не передаёт очередь старого владельца другому аккаунту и не запускает обмен до восстановления
доверия устройства. Сетевой отказ не удаляет локальные данные или рабочие encryption keys.
Пароль восстанавливается внутри приложения. Новых зависимостей, sync engine, stores, серверных
RPC и ослабления trust binding нет. Публикация и реальный аккаунт пользователя не входят в этот патч.

## Дизайн-контракт

- FEATURE: исправления и новые состояния существующей страницы.
- USER GOAL: войти/повторно подключиться или восстановить пароль, понимать готовность обмена.
- EXISTING LOGIC: Supabase auth + native store; AccountSyncService + SyncInstallation; существующий recovery и outbox.
- PAGE/COMPONENT ARCHETYPE: существующая форма настройки аккаунта, один текущий шаг.
- SECTION COLOR: общий accent темы, сейчас jade; success/error/pending по текущим tokens.
- ATMOSPHERE: действующая graphite shell, без нового фона.
- MAIN VISUAL CENTER: текущая форма входа, восстановления устройства или пароля.
- COMPONENTS TO REUSE: AccountForm, EmailField, PasswordField, AccountHeader, account-feedback и account-live.
- MOBILE BEHAVIOR: одна колонка, controls ≥44 px, ошибки рядом с формой, без новых overlays.
- APPROVED REFERENCE: отдельный reference не требуется для стандартных форм на текущих компонентах.
- TEST SCOPE: regression unit/integration, scoped account E2E desktop/mobile, один verify, native Rust slot tests.

Исходный route `#/v2/account` открыт в активном worktree. Каскад: account-sync.css перед
planner-premium.css, затем Diary/memory CSS; button background computed rgb(129,207,171).
Desktop screenshot сохранён в browser evidence. Mobile baseline проверяется дополнительно
в managed E2E: browser viewport screenshot при первом resize не является надёжным доказательством.
Loading/empty-local/unavailable/error/retry/busy/success предусмотрены; клавиатура/reduced motion
переиспользуют текущие компоненты. Обновление не обозначается как визуально APPROVED отдельно.

## Auth и транспорт

- Existing password sign-in проверяет заполненность, без registration minimum; строка не trim.
- Creation/update остаются 12–128 символов. Политика проверяется до использования recovery proof.
- Safe domain errors: invalid credentials, email not verified, rate limited, timeout/network,
  invalid session, unavailable provider. Сырые provider messages и секреты не отображаются.
- Реальные fetch ограничены через AbortController до завершения чтения body: auth 20 s,
  structured REST 30 s, Storage 60 s. Сохраняется внешний abort и cleanup.
- Auth/RPC/Storage responses ограничены соответственно 2/16/96 MiB. Late response после abort
  не передаётся SDK и не создаёт сохранённую сессию.
- SDK auth-token-user получает отдельный allowlisted native slot. Старый auth session slot не меняется.

## Повторный вход

Добавляется состояние `device_recovery_required` и optional metadata
`accountRecoveryDeviceId`: отсутствующее поле старых записей трактуется как null и не добавляется
при их чтении. `sign_in_required` означает отсутствие
действующей сессии для существующей installation. Store/version не меняются; unknown state старого
клиента не следует считать совместимым downgrade.

Единый application gate закрывает новые transfers и ждёт текущие операции до auth sign-in.
Он охватывает structured cycle, hints, photos и maintenance. Mutation recorder продолжает
работать на прежних configured/active/space/key полях; очередь не очищается.

Для привязанного пространства вход допускается только в прежний аккаунт. До смены credentials
проверяется email; после — verified user id. При отказе сохраняются owner, ключи, данные и outbox.
После неопределённого результата сеть не разрешается без проверки сохранённой сессии.
`load` не делает implicit recovery старого device после новой session.
Подтверждённый email и неанонимная сессия обязательны для account recovery и смены пароля;
если подтверждение email отсутствует, `load` сохраняет владельца и требует повторного входа.

Явный recovery проверяет тот же space, создаёт verified snapshot и один persisted candidate id.
Candidate используется только в trust protocol; до server activation старый recording context
сохраняется. Ошибка/restart оставляют candidate для идемпотентного retry, не удаляют общий key ring.
После activation installation переключается на candidate и existing recovery convergence.
Concurrent local edits не перезаписываются stale installation snapshot.
Encrypted outbox events не переписываются eagerly: прежний ciphertext мог уже быть принят сервером.
Переиспользуются existing replay/rematerialization правила.

## Сброс пароля

`AccountAuth.completePasswordReset({email, codeOrLink, newPassword, expectedUserId})` использует
отдельный ephemeral client: persistSession/autoRefresh/detectSessionInUrl false, отдельный storageKey,
тот же bounded fetch. Главный native auth storage не передаётся.

Цифровой OTP → verifyOtp(email,token,type=recovery). Стандартная ссылка → POST verifyOtp(token_hash,
type=recovery); URL не открывается и GET не выполняется. Допускаются только configured origin,
точный /auth/v1/verify, один type=recovery и ровно один token или token_hash. Hash сохраняется
буквально, включая pkce_; bounded opaque value, без предположения о длине 64 hex.
Callbacks/access-token/tracking wrappers не принимаются. Поле: «Код или ссылка из письма».

До updateUser проверяются permanent verified session, ожидаемый email и existing bound user id.
После проверяется returned identity. Installation/adoption/recovery/sync/local purge не вызываются.
Секреты очищаются; подтверждённая смена даёт «Пароль изменён. Войдите с новым паролем».
Best-effort local sign-out/close временного клиента не превращает успешную смену в ложный отказ.
После timeout на update не утверждается, что сервер не сменил пароль: предлагается вход новым
паролем или новое письмо. Сброс пароля не заменяет E2EE recovery material.

Стандартная Supabase-ссылка позволяет работать без hosted template change. OTP доступен только
если письмо содержит code; пользователь копирует исходную ссылку без открытия. Уже использованная
или истёкшая ссылка требует нового письма. Основание: [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp),
[official auth server](https://github.com/supabase/auth/blob/master/internal/api/verify.go).

## Приёмка

Доказательства нужны для короткого existing password, safe error mapping, request/body deadlines,
native SDK cleanup, pause/drain, owner isolation, restart/candidate retry, локальных правок во время
recovery, отсутствия key deletion, isolated reset, UI double-submit/error/retry/focus/mobile.
Настоящие установленный Windows/Android и hosted credentials round-trip отмечаются отдельно;
mocked browser QA не выдаётся за такую проверку.
