# LifeOS V2 Areas, Directions and Balance — Implementation Plan

**Goal:** верхний уровень управления жизнью на существующих Sphere/Direction/Goal.
**Architecture:** domain aggregates → application commands/read models → V2 presentation;
Infrastructure реализует порты. Два новых типа записей: indicators и monthly snapshots.
**Stack:** существующие TypeScript, React, IndexedDB, Vitest, native encrypted sync; SVG без зависимостей.
**Spec:** [Дизайн и проверка](../../design/features/2026-09-14-v2-areas-directions-balance.md).

Главный агент — единственный автор продукта. Независимые агенты выполняют read-only review.
Макет утверждён пользователем. Late closed-month snapshots используют обычные sync conflicts.
Один итоговый commit, без push. Предсуществующий dirty worktree сохраняется.

## Выполненные этапы

- [x] Аудит фактических models/repositories/mappers/registry/Journal; baseline 11 files / 80 tests.
- [x] Реальный encrypted round-trip до продуктовых изменений, затем с 32 V2 records:
      `node scripts/test-sync-crypto.mjs`, без изменения crypto/protocol.
- [x] Existing Sphere/Direction расширены nullable state settings, importance и lifecycle/mode.
- [x] Domain scoring/recommendations: weighted available values, manual override, missing ≠ 0,
      deterministic largest remainder, стабильные ID ties.
- [x] Indicators: max 5 deterministic slots, version checks, source unavailable, compact editor.
- [x] DB v25, legacy defaults и unknown field preservation; registry/bootstrap/backups/recovery.
- [x] Atomic current-month snapshots с source writes, rollback, no-op, daily/startup/sync refresh,
      запрет локального пересчёта прошлого, защита от clock rollback, remote conflict semantics.
- [x] Read model переиспользует quantitative projection и period membership; historical
      decision results; Goal Sphere определяется существующей связью, progress с равными весами.
- [x] V2 overview/wheel/settings, Sphere/Direction details, Goals/Plans filters, voice fields.
- [x] Targeted domain/application/persistence/sync/render/navigation/legacy-form regressions.
- [x] Desktop сценарий «Здоровье» с тремя направлениями, math/manual/desired/recommendations/reload.
- [x] Mobile 390/360/320, keyboard focus, overflow, console, checklist Design Rules №38.
- [x] Owned dev server остановлен, порт освобождён, временный viewport снят.
- [x] Read-only architecture и final review; замечания исправлены и проверены targeted tests.

## Финальный gate

- [x] Финальный `npm run verify`, exit 0: unit/integration 3491, infra 55, alpha 1;
      typecheck/lint/build/format/Git hygiene прошли. Полный Playwright/E2E не запускался.
- [x] `git diff --check` и review diff. Независимый review не нашёл блокеров.

Завершение: показать diffstat только этого блока, stage явных продуктовых файлов, native test
harness и двух документов; preview/debug/build и предсуществующие изменения исключить.
Создать `feat: add LifeOS V2 areas directions and balance wheel`, проверить hash/status,
дать отчёт по 17 пунктам и остановиться. Push и следующий продуктовый блок запрещены.

Остаточная ручная QA: Android native, микрофон и permissions, sync двух физических устройств.
