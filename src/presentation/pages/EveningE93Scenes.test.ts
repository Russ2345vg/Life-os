import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { readFileSync } from 'node:fs';

const tomorrowSource = readFileSync(new URL('./TomorrowComposer.tsx', import.meta.url), 'utf8');
const preparationSource = readFileSync(new URL('./PreparationPanel.tsx', import.meta.url), 'utf8');
const eveningSource = readFileSync(new URL('./EveningReviewPanel.tsx', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

describe('E9.3 tomorrow scene contract', () => {
  it('показывает архитектуру дня вместо последовательности технических полей', () => {
    const primary = tomorrowSource.indexOf('Главное Решение');
    const outcomes = tomorrowSource.indexOf('Границы результата');
    const firstAction = tomorrowSource.indexOf('Первый шаг');
    const supporting = tomorrowSource.indexOf('Дополнительно');

    expect(primary).toBeGreaterThan(-1);
    expect(outcomes).toBeGreaterThan(primary);
    expect(firstAction).toBeGreaterThan(outcomes);
    expect(supporting).toBeGreaterThan(firstAction);
    expect(tomorrowSource).not.toContain('Direction:');
    expect(tomorrowSource).not.toContain('PrimaryDecision:');
    expect(tomorrowSource).not.toContain('MinimumOutcome:');
  });

  it('использует команды E5 и не создаёт временную копию TomorrowDecision', () => {
    expect(tomorrowSource).toContain('service.assignPrimaryDecision');
    expect(tomorrowSource).toContain('service.createPrimaryDecision');
    expect(tomorrowSource).toContain('service.assignFirstAction');
    expect(tomorrowSource).toContain('service.createFirstAction');
    expect(tomorrowSource).toContain('service.setSupportingDecisions');
    expect(tomorrowSource).not.toContain('new TomorrowDecision');
  });

  it('имеет отдельные состояния quick, emergency, перегруза и завершённого плана', () => {
    expect(tomorrowSource).toContain("isQuick ? 'Быстро подготовить завтра' : 'Завтра'");
    expect(tomorrowSource).toContain('Завтра уже насыщенно');
    expect(tomorrowSource).toContain('Завтра определено');
    expect(tomorrowSource).toContain("onEdit('all')");
    expect(tomorrowSource).toContain('historyView={historyView}');
    expect(eveningSource).toContain('Сохраним только необходимое.');
    expect(eveningSource).toContain('Сохранить и продолжить');
  });

  it('показывает итог до перехода к подготовке и использует дату восстанавливаемого цикла', () => {
    expect(tomorrowSource).not.toContain('if (!isCompleted) onPrepared()');
    expect(tomorrowSource).toContain('onContinue={onPrepared}');
    expect(eveningSource).toContain('cycleDate={loadState.snapshot.cycle.dateKey}');
  });
});

describe('E9.3 preparation scene contract', () => {
  it('начинается с первого старта и скрывает пустые области среды', () => {
    expect(preparationSource.indexOf('Первый старт завтра')).toBeLessThan(
      preparationSource.indexOf('preparation-sections'),
    );
    expect(preparationSource).toContain('areaItems.length === 0 ? []');
    expect(preparationSource).toContain("[PREPARATION_AREA.sleepEnvironment]: 'Среда для сна'");
    expect(preparationSource).toContain("[PREPARATION_AREA.tomorrowStart]: 'Среда для завтра'");
    expect(preparationSource).toContain('Нужно для первого старта');
    expect(preparationSource).toContain('Можно подготовить дополнительно');
    expect(preparationSource).not.toContain("'REQUIRED'");
    expect(preparationSource).not.toContain("'OPTIONAL'");
  });

  it('сохраняет выполненные пункты на месте и имеет компактное empty-состояние', () => {
    expect(preparationSource).toContain('item.status === PREPARATION_ITEM_STATUS.pending');
    expect(preparationSource).toContain(
      'Для завтрашнего старта дополнительная подготовка не нужна.',
    );
    expect(preparationSource).not.toContain('Среда готова');
    expect(preparationSource).toContain("{completedReview ? 'Было подготовлено' : 'Подготовлено'}");
  });
});

describe('E9.3 responsive and motion contract', () => {
  it('делает Норму центральной на desktop и первой на mobile', () => {
    expect(globalCss).toMatch(
      /\.tomorrow-outcome-boundaries\s*{[^}]*grid-template-areas:\s*'minimum target stretch'/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.tomorrow-outcome-boundaries\s*{[^}]*grid-template-areas:\s*'target'\s*'minimum'\s*'stretch'/,
    );
  });

  it('не требует горизонтальной прокрутки пути и отключает анимации', () => {
    expect(globalCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-command-center-journey\s*{[^}]*overflow:\s*hidden/,
    );
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.evening-tomorrow-scene,[\s\S]*?\.evening-preparation-scene\s*{[^}]*animation:\s*none/,
    );
  });
});
