# LifeOS

Самостоятельное локальное веб-приложение для управления днями, решениями, действиями и рабочими
сессиями.

Реализованы основной цикл экрана «Сегодня», создание и ведение решений и связанных действий,
рабочие сессии с паузой и завершением, распорядок со связями на реальные действия, история результатов, локальные настройки интерфейса и
восстановление состояния после перезапуска. Предметные данные сохраняются в браузерном IndexedDB;
облачная синхронизация не используется.

## Требования

- Node.js 22.12 или новее (используемые версии Vite и Vitest также поддерживают Node.js 24)
- npm 11 или новее
- Для Windows Desktop: Rust stable MSVC, Microsoft C++ Build Tools и WebView2 Runtime

## Запуск

```bash
npm install
npm run dev
```

## Windows Desktop

Development mode запускает тот же LifeOS в отдельном нативном окне Tauri:

```bash
npm run tauri dev
```

Production-сборка и NSIS installer:

```bash
npm run tauri build
```

Готовый установщик создаётся в `src-tauri/target/release/bundle/nsis/`.

## Проверки

```bash
npm run typecheck
npm run lint
npm run test:target -- src/path/ChangedContract.test.ts
npm run test:fast
npm run verify
```

`npm run verify` — канонический конечный быстрый quality gate: unit/integration,
test-infrastructure, alpha, build, format и Git whitespace check выполняются последовательно с
deadlines. Полный browser E2E запускается отдельно через `npm run test:e2e` или вместе с быстрым
gate через `npm run verify:full` по правилам testing strategy.
Подробное разделение быстрых и тяжёлых проверок описано в
[docs/codex/TEST_MATRIX.md](docs/codex/TEST_MATRIX.md).

Архитектурные правила описаны в [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md),
а актуальный этап — в [PROJECT_STATUS.md](PROJECT_STATUS.md).
