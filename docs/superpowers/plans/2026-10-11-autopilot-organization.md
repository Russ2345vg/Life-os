# Autopilot Organization Implementation Plan

> Use superpowers:executing-plans. The user explicitly requested implementation of the five selected features; execute inline and preserve the existing dirty batch checkout.

**Goal:** Реализовать баланс, шаблоны, группировку, зависимости и закрепления в существующем автопилоте.

**Architecture:** Опциональные поля versioned preferences/draft, чистые domain rules, текущий application planner и guarded atomic apply. UI переиспользует форму и timeline.

**Tech Stack:** TypeScript, React, IndexedDB, Vitest, Playwright; без новых зависимостей.

**Spec:** [Организация автопилота](../../design/features/2026-10-11-autopilot-organization.md).

## Global Constraints

Сохранить накопленные файлы побайтно. Шаблон не применяет план. Доли относятся к работе. Зависимости и закрепления выше группировки. Ритуалы и отдых защищены. Старые поля совместимы. Не выпускать версию.

## Review Focus

- Несколько направлений у одного действия: считать время один раз.
- Недоступный/исключённый предшественник: зависимое не применяется.
- Закреплённое ещё неприменённое окно: атомарно становится LifeAction window после apply.
- Изменившиеся settings/action между preview и apply: guard отклоняет всю запись.
- Ошибка сохранения шаблона/настроек: пользователь сохраняет введённый текст.

## File map

Domain: AutopilotOrganization, AutopilotPreferences, AutopilotSelection, AutopilotSchedule, DayAutopilot. Application: PreferenceDayAutopilot. Presentation: AutopilotOrganizationForm, AutopilotPreferencesForm, PreferenceAutopilotCard, AutopilotPlanPreview. Tests рядом с контрактами плюс IndexedDB и current.autopilot-organization.spec.ts.

### Task 1: Validation and templates

- [x] RED: optional settings survive validation/store round-trip; invalid balance/cycle/pin rejected; template applies settings without copying date/pins/dependencies.
- [x] GREEN: define balance/action rules/template/pin types and validators; template capture/apply pure functions.
- [x] Run targeted validators and persistence suite.

### Task 2: Scheduling and atomic application

- [x] RED: 60/40 work, shared contexts adjacent, predecessor before dependent, unavailable dependency deferred, pin preserved in rebuild and conflict rejected.
- [x] GREEN: eligible direction groups, advanced scheduling inputs, pinned constraints/proposals, dependency ordering and balance summary.
- [x] Integration: apply/reopen pin, preference race, excluded/future prerequisite, incompatible pin; existing autopilot suites.

### Task 3: Production controls

- [x] RED: real form interactions change balance/rules/templates and pin controls.
- [x] GREEN: organization form and template CRUD using current saves; preview and saved timeline pin/unpin, balance and reasons visible.
- [x] Scoped E2E baseline → save/template/select → build/dependency/grouping → pin → apply/reload/rebuild; desktop/mobile screenshots and console/overflow checks.

### Task 4: Verification and review

- [x] Format changed files; test:fast; one canonical verify.
- [x] One read-only final independent review; fix important findings with regression tests and affected checks.
- [x] Baseline preservation, diff check, report with evidence. Changes remain accumulated.

## Plan self-review

Все пять функций покрываются tasks 1–3; совместимость и guard используют существующие контракты. Final review проверяет скрытые совместные случаи. User explicit implementation instruction supersedes additional artifact-approval handoffs; no repeated approval request.
