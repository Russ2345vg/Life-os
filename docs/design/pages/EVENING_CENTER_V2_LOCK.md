# LifeOS — Evening Center v2 Master Shell Lock

**Статус:** `REFERENCE CANDIDATE — HUMAN REVIEW REQUIRED`

**Дата фиксации:** 2026-09-01

**Область:** Распорядок → Вечерний ритуал → Evening Center v2

**Тип изменения:** документационный/контрольный этап; UI, business logic и данные не изменяются.

Этот документ фиксирует уже утверждённую композицию Master Shell для шагов Evening Center v2.
Он не утверждает screenshot как pixel-perfect, не разрешает редизайн «Осмысления» и не меняет
существующие application/domain-контракты.

## Design contract

```text
FEATURE
→ Master Shell Lock для Evening Center v2
USER GOAL
→ проходить единый спокойный вечерний сценарий без изменения общей рамки между этапами
EXISTING LOGIC
→ EveningCommandCenter + EveningCommandCenterPresentation; визуальные 5 шагов сворачивают
  внутренние preparation / relaxation / sleep в общий этап «Подготовка»
PAGE/COMPONENT ARCHETYPE
→ Deep Focus + guided flow, один центральный scene container
SECTION COLOR
→ matte warm gold; семантические error/success-цвета остаются вторичными
ATMOSPHERIC MOTIF
→ непрерывная тёмная вечерняя сцена: графит, ночной ландшафт, луна, мягкое золото
MAIN VISUAL CENTER
→ central scene с единой центральной вертикальной композицией
COMPONENTS TO REUSE
→ EveningCommandCenter header/journey/KPI row/scene host, EveningVisualIcon,
  существующая primary/secondary action hierarchy
MOBILE BEHAVIOR
→ сохраняются те же 5 шагов, 3 status cards, scene и CTA zone; текущий responsive-контракт
  не меняется в рамках реализации шагов 2–5 без отдельного разрешения
APPROVED REFERENCE
→ NO; screenshot ниже является только reference candidate для человеческой проверки
STATES
→ normal loaded shell фиксируется этим LOCK; loading/empty/error/success меняют только
  содержимое/состояние central scene и не разрешают создавать второй shell
TEST SCOPE
→ существующий EveningCenterV2 shell contract + browser reference 1440×900 + Git scope check
```

## 1. Master Shell structure

Master Shell состоит только из следующих постоянных зон:

1. Header:
   - заголовок «Вечерний центр»;
   - secondary subtitle;
   - close action.
2. Stepper ровно из пяти визуальных этапов:
   1. Сегодня;
   2. Осмысление;
   3. Завтра;
   4. Подготовка;
   5. Завершение.
3. Ровно три status cards:
   1. Осталось сегодня;
   2. Завтра;
   3. Режим.
4. Один central scene container.
5. Одна фиксированная нижняя CTA zone внутри central scene.

Отдельного визуального шага «Среда» нет. Отдельного визуального шага «Расслабление» нет.
Relaxation является внутренней фазой шага «Подготовка». Текущий presentation mapping также
сворачивает внутреннюю sleep-фазу в этот визуальный шаг; внутренние domain-фазы не создают новые
элементы stepper.

Между шагами меняется только content central scene. Master Shell не пересобирается и не получает
параллельный источник состояния. Sidebar находится вне Master Shell, не является частью
редизайна Evening Center v2 и остаётся неизменным.

## 2. Shell invariants

При реализации шагов 2–5 без отдельного разрешения запрещено менять:

- положение, порядок и композицию header;
- ширину основного content container;
- геометрию и пятишаговую структуру stepper;
- количество status cards;
- трёхколоночный desktop grid status cards;
- высоту status cards;
- общий vertical rhythm shell;
- границы, радиус и занимаемую область central scene;
- baseline нижней CTA zone;
- sidebar, его ширину, пункты, состояния и оформление.

Контент, form controls и внутренние состояния шага помещаются внутрь существующего central scene.
Они не могут сдвигать header, stepper, status cards или создавать собственную внешнюю рамку shell.
На одинаковом viewport основной CTA каждого шага должен оставаться на baseline, зафиксированном
ниже для reference candidate.

## 3. Icon contract

Каждая status card содержит:

- ровно один icon wrapper: `.evening-kpi-card-icon`;
- ровно одну semantic SVG icon внутри wrapper;
- никаких legacy icon layers;
- никаких glyph-слоёв через `::before` / `::after`;
- никаких старых icon elements поверх v2.

Семантическое соответствие фиксировано:

| Status card      | Единственная semantic icon | Текущий icon id |
| ---------------- | -------------------------- | --------------- |
| Осталось сегодня | status/list/check          | `list`          |
| Завтра           | calendar                   | `calendar`      |
| Режим            | crescent moon              | `moon`          |

Иконка может отражать семантическое состояние, но wrapper и SVG не дублируются.

## 4. Visual system

### Dark Frosted Gold

- dark translucent graphite;
- restrained blur;
- thin warm-gold/neutral border;
- subtle top highlight;
- no neon.

### Soft Gold CTA

- matte warm gold;
- minimal halo;
- no strong bloom.

### Typography and color

- primary text — milk-white;
- secondary text — muted gray;
- gold — только accent/current/action;
- green text не является частью primary visual language и допустим только по подтверждённой
  success/completed-семантике;
- постоянный violet accent и декоративный neon запрещены.

## 5. Spacing contract

Ниже зафиксированы значения текущего desktop shell из
`src/presentation/styles/evening-center-v2.css` и вычисленного browser layout при `1440×900`,
root font size `16px`.

| Lock token                                   |     Точное значение | Текущий источник / смысл                                                  |
| -------------------------------------------- | ------------------: | ------------------------------------------------------------------------- |
| `--evening-shell-header-padding-block`       |     `1rem` = `16px` | `var(--space-4)`                                                          |
| `--evening-shell-header-to-stepper`          | `0.625rem` = `10px` | верхний margin stepper                                                    |
| `--evening-shell-stepper-height`             | `3.9rem` = `62.4px` | min-height шага и button; на reference совпадает с вычисленной высотой    |
| `--evening-shell-stepper-to-status`          | `1.375rem` = `22px` | верхний margin status row                                                 |
| `--evening-shell-status-gap`                 |     `1rem` = `16px` | `var(--space-4)`, gap между тремя cards                                   |
| `--evening-shell-status-height`              | `6.25rem` = `100px` | min-height; на reference вычисленная высота `100px`                       |
| `--evening-shell-status-padding-block`       | `0.875rem` = `14px` | внутренний padding status card                                            |
| `--evening-shell-status-padding-inline`      |     `1rem` = `16px` | `var(--space-4)`                                                          |
| `--evening-shell-status-to-scene`            |               `0px` | на reference нижняя граница status row совпадает с верхней границей scene |
| `--evening-shell-scene-padding`              |               `0px` | вычисленный padding scene host и scene card на reference                  |
| `--evening-shell-scene-content-inset-inline` |   `1.5rem` = `24px` | `var(--space-6)` у hero и CTA zone                                        |
| `--evening-shell-hero-to-cta`                | `1.875rem` = `30px` | grid gap между hero row и CTA row                                         |
| `--evening-shell-cta-stack-gap`              | `0.625rem` = `10px` | gap внутри CTA zone                                                       |
| `--evening-shell-primary-cta-height`         |  `3.25rem` = `52px` | min-height primary CTA                                                    |
| `--evening-shell-secondary-action-offset`    | `0.3125rem` = `5px` | margin-top secondary action                                               |

### Container geometry at 1440×900

- sidebar/right content boundary начинается на `x = 264px`; sidebar остаётся вне lock scope;
- header, stepper и status row: `1152px` шириной (`x = 276px`);
- status cards: `373.325px / 373.337px / 373.325px`, gap `16px`;
- central scene: `1176px` шириной (`x = 264px`), верхняя граница `y = 291.9875px`;
- reference start scene: `528px` высотой;
- primary CTA: `y = 579.125px … 631.125px`;
- вся CTA zone: `y = 579.125px … 697.725px`;
- duration: `y = 641.125px … 658.725px`;
- secondary action: `y = 673.725px … 697.725px`.

Эти координаты являются проверочной baseline текущего reference candidate на указанном viewport,
а не самостоятельным заявлением о pixel-perfect approval.

### Current CSS caveat

В текущей шкале `tokens.css` существуют `--space-4: 1rem` и `--space-6: 1.5rem`, но
`--space-5` отсутствует. Поэтому декларация scene host
`padding: var(--space-5) var(--space-6) var(--space-6)` сейчас целиком не вычисляется; browser
даёт padding `0px` и gap `status cards → central scene` равный `0px`. Этот LOCK фиксирует
фактический render и целевые shell-token names, но не разрешает исправлять или рефакторить CSS на
данном документационном этапе.

## 6. Hero contract

- background — одна непрерывная scene;
- отдельный bottom blurred panel запрещён;
- видимый horizontal seam запрещён;
- читаемость нижней CTA zone обеспечивается плавным dark gradient внутри общей scene;
- moon, title, subtitle, CTA, duration и secondary action образуют одну центральную вертикальную
  композицию;
- CTA zone имеет `border-top: 0`, transparent background и `backdrop-filter: none`;
- смена шага не создаёт новую внешнюю hero-рамку и не меняет границы central scene.

## 7. Reference candidate

Текущий стартовый Evening Center снят в реальном приложении при desktop viewport `1440×900`:

`docs/design/pages/references/evening-center-v2-master-shell.png`

- формат: PNG;
- размер: 1440×900;
- состояние: `NOT_STARTED`, шаг 1 «Сегодня»;
- route: `/#/routine/evening?date=2026-09-01`;
- browser console/page errors: не обнаружены на момент снимка;
- screenshot не утверждён автоматически и требует человеческой визуальной проверки.

## 8. Scope guard

Этот этап не разрешает:

- реализацию или редизайн «Осмысления»;
- изменение start scene;
- изменение spacing/CSS;
- добавление UI-компонентов;
- изменение business logic, application/domain state или persistence;
- изменение sidebar;
- изменение пользовательских данных;
- маркировку reference как `APPROVED`, `LOCKED` или pixel-perfect без решения пользователя.

Следующая реализация должна использовать этот документ как неизменяемую внешнюю рамку и получить
отдельное разрешение на любое отклонение от перечисленных invariants.
