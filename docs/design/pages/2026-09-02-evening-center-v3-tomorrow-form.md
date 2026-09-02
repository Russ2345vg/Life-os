# LifeOS — Evening Center v3: рабочая форма шага «Завтра»

**Статус:** `IMPLEMENTED — VISUAL REVIEW PENDING`

**Дата:** 2026-09-02

**Раздел:** Распорядок → Вечерний ритуал → Завтра

## Design contract

```text
FEATURE
→ Рабочая форма шага «Завтра» в Evening Center v3
USER GOAL
→ Последовательно выбрать главное решение, определить границу результата,
  задать первый шаг и при необходимости дополнительные решения
EXISTING LOGIC
→ TomorrowComposer + TomorrowPlanService; Decision/LifeAction резолвятся в snapshot,
  application/domain/persistence contracts не меняются
PAGE/COMPONENT ARCHETYPE
→ Deep Focus, компактная последовательная форма 1→4 внутри central scene
SECTION COLOR
→ Матовое золото только для current/selected/CTA; холодная ночная атмосфера
ATMOSPHERIC MOTIF
→ Глубокий вечер, холодное небо, слабый тёплый горизонт, заметный месяц
MAIN VISUAL CENTER
→ Главное решение и действие его выбора/создания
COMPONENTS TO REUSE
→ EveningVisualIcon, существующая button hierarchy, input/select/textarea,
  TomorrowPlanService и текущие application-команды
MOBILE BEHAVIOR
→ Один вертикальный поток, полноширинный CTA, touch targets не меньше 44px,
  без горизонтального overflow
APPROVED REFERENCE
→ YES для locked shell: references/evening-center-v2-master-shell.png
→ Центральная сцена утверждена пользовательским заданием этапа 4
STATES
→ loading / error / disabled / partial / ready / saving / saved
TEST SCOPE
→ selection/create decision, все result boundaries, first step, expected result,
  additional decisions, CTA readiness, saved state и переход к подготовке
```

## Locked boundary

Не изменяются:

- `EveningCommandCenter` header;
- пятишаговый stepper;
- три status cards и их иконки;
- shell spacing и central scene bounds;
- sidebar;
- master CTA baseline.

Изменения ограничены содержимым сцены `data-scene="tomorrow"`, её локальным состоянием и
presentation-тестами. Источник истины locked shell — `EVENING_CENTER_V2_LOCK.md`.

## Form sequence

1. **Главное решение.** Пустое состояние содержит одно действие выбора или создания. Выбранное
   состояние показывает реальный title, доступные project/direction metadata и компактное
   действие «Изменить».
2. **Граница результата.** Общий segmented control переключает `Минимум / Норма / Максимум`.
   Одновременно видимо одно поле; значения остальных уровней остаются в editor state.
3. **Первый шаг.** Отдельные поля для конкретного действия и ожидаемого результата.
4. **Дополнительные решения.** До двух элементов; пустое состояние состоит из одной компактной
   строки добавления и не создаёт тяжёлую колонку.

До готовности главного решения блоки 2–4 приглушены и недоступны. Готовность CTA следует
существующему domain-контракту: главное решение, минимальная граница, первый шаг и явное принятие
overload-состояния, когда оно применимо.

## Visual review

Проверяются `1440×900`, `1280×720`, `390×844` и `360×800`: locked shell geometry, три status
cards, одна semantic icon на card, CTA baseline, отсутствие горизонтального overflow, keyboard
focus, disabled/saved states и browser console.

Экран не получает статус `APPROVED` или `LOCKED` до явного решения пользователя по итоговым
screenshots.
