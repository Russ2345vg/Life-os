# Shared Glass Direction Implementation Plan

> Исполнение в текущей задаче: главный агент изменяет файлы, субагенты только готовят
> ограниченные исследования/asset/review. Используется уже согласованный scope А–В.

**Goal:** общая оболочка LifeOS и работающий эталон «Направления / Новое направление».
**Architecture:** UI и CSS используют существующие application-контракты. Палитра и материалы
сосредоточены в tokens.css, page styles отвечают за композицию.
**Tech Stack:** существующие React / TypeScript / Vite / CSS без новых зависимостей.
**Spec:** [дизайн-контракт](../../design/features/2026-09-09-shared-glass-direction.md).

## Ограничения

Только активный D:/LifeOS-App. Сохранить dirty baseline, данные, маршруты, настройки sidebar,
голосовой ввод, sync indicator и команды. Не устанавливать/обновлять desktop-приложение.
Не выполнять commit/push. Этап Г не входит в реализацию.

## А. Правила и материалы

- [x] Сохранить reference и чистый фон с provenance.
- [x] Согласовать LifeOS_DESIGN_RULES_v1.md, UI_RULES.md, AGENTS.md и scope старых specs.
- [x] Проверить конфликтующие формулировки glass/section accent/local shell.

## Б. Общая основа

- [x] Объединить aliases в src/presentation/styles/tokens.css.
- [x] Обновить shell/navigation/control styles в global.css, сохранить layout contracts.
- [x] Добавить desktop wordmark в ApplicationShellView без изменения navigation handlers.
- [x] Удалить условную тему оболочки из goal-detail.css и фон Overview, оставив их композицию.
- [x] Проверить ApplicationShellView.test.ts, ApplicationShellLayout.test.ts и navigation tests.

## В. Направления

- [x] Сначала изменить render-тест: существующее описание видно, операционные метрики скрыты;
      подтвердить падение на старом markup.
- [x] Обновить DirectionCard/DirectionForm и directions-compact.css: общие материалы,
      заголовок, inline-форма, описание строки, метка сферы, меню и mobile.
- [x] Обновить E2E ожидания описания и проверить вычисленные материалы формы/оболочки.
- [x] Выполнить targeted tests, browser comparison и refinement.
- [x] Выполнить npm.cmd run verify; затем npm.cmd run test:e2e (R10).
      Результаты: общий verify FAIL вне scope; full E2E TIMEOUT, затронутые и оставшиеся
      сценарии завершены scoped-прогонами. Это не зелёный полный gate.
- [x] Independent read-only review, git diff --check, просмотр diff относительно baseline.
- [x] Оставить предпросмотр открытым, предоставить фактические результаты и ограничения.
      Итог: docs/design/references/2026-09-09-shared-glass/QA.md.
