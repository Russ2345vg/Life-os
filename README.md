# LifeOS

Самостоятельное веб-приложение для будущего управления решениями, действиями и результатами.
Сейчас реализовано только техническое основание: слои, базовые типы, инфраструктурные порты,
проверки и стартовый экран без бизнес-функций.

## Требования

- Node.js 22.12 или новее (используемые версии Vite и Vitest также поддерживают Node.js 24)
- npm 11 или новее

## Запуск

```bash
npm install
npm run dev
```

## Проверки

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
```

Архитектурные правила описаны в [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md),
а актуальный этап — в [PROJECT_STATUS.md](PROJECT_STATUS.md).
