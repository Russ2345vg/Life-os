import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MORNING_CENTER_STAGE_ID,
  MORNING_CENTER_STAGE_STATUS,
  type MorningCenterOverview,
} from '../../application';
import { MorningMirrorPage, type MorningMirrorViewState } from './MorningMirrorPage';

const NOOP = () => undefined;
const COMPLETED_AT = new Date('2026-08-28T07:24:00.000+09:00');

describe('MorningMirrorPage', () => {
  it('показывает утверждённую практику и единственный primary CTA', () => {
    const markup = renderMirror('current');

    expect(markup).toContain('Настрой перед зеркалом');
    expect(markup).toContain('Этап 3 из 5');
    expect(markup).toContain('Собери внимание');
    expect(markup).toContain(
      'Посмотри на себя и одним предложением назови, на чём сегодня будет твой главный фокус.',
    );
    expect(markup).toContain('Что я начинаю первым — и почему это важно сегодня?');
    expect(markup).toContain('Ответ не нужно записывать.');
    expect(markup).toContain('≈ 5 мин');
    expect(markup).toContain('>Завершить настрой</button>');
    expect(markup.match(/data-mirror-stage=/g)).toHaveLength(5);
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<textarea');
  });

  it('показывает shortened estimate и pending semantics', () => {
    const markup = renderMirror('pending', { estimatedMinutes: 3 });

    expect(markup).toContain('≈ 3 мин');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Завершаем…');
    expect(markup).toContain('aria-live="polite"');
  });

  it('показывает authoritative success без mutating CTA', () => {
    const markup = renderMirror('success', { stages: completedStages() });

    expect(markup).toContain('НАСТРОЙ ЗАВЕРШЁН');
    expect(markup).toContain('Фокус определён');
    expect(markup).toContain('Главное действие стало текущим этапом утра.');
    expect(markup).toContain('data-mirror-stage="main-action"');
    expect(markup).not.toContain('>Завершить настрой</button>');
    expect(markup).not.toContain('>Повторить</button>');
  });

  it('показывает спокойную retry-ошибку', () => {
    const markup = renderMirror('error');

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось сохранить завершение.');
    expect(markup).toContain('Проверь соединение и повтори действие.');
    expect(markup).toContain('>Повторить</button>');
    expect(markup).not.toContain('>Завершить настрой</button>');
  });

  it('показывает завершённый исторический факт без сохранённого ответа', () => {
    const markup = renderMirror('readonly', {
      stages: completedStages(),
      completedAt: COMPLETED_AT,
    });

    expect(markup).toContain('Завершено в 07:24');
    expect(markup).toContain('Содержание ответа не сохранялось');
    expect(markup).toContain('Исторический день доступен только для просмотра');
    expect(markup).not.toContain('>Завершить настрой</button>');
    expect(markup).not.toContain('>Повторить</button>');
  });
});

function renderMirror(
  state: MorningMirrorViewState,
  overrides: Partial<Parameters<typeof MorningMirrorPage>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(MorningMirrorPage, {
      stages: currentStages(),
      estimatedMinutes: 5,
      completedAt: null,
      state,
      onBack: NOOP,
      onComplete: NOOP,
      onRetry: NOOP,
      ...overrides,
    }),
  );
}

function currentStages(): MorningCenterOverview['stages'] {
  return stageStatuses([
    MORNING_CENTER_STAGE_STATUS.completed,
    MORNING_CENTER_STAGE_STATUS.completed,
    MORNING_CENTER_STAGE_STATUS.current,
    MORNING_CENTER_STAGE_STATUS.upcoming,
    MORNING_CENTER_STAGE_STATUS.upcoming,
  ]);
}

function completedStages(): MorningCenterOverview['stages'] {
  return stageStatuses([
    MORNING_CENTER_STAGE_STATUS.completed,
    MORNING_CENTER_STAGE_STATUS.completed,
    MORNING_CENTER_STAGE_STATUS.completed,
    MORNING_CENTER_STAGE_STATUS.current,
    MORNING_CENTER_STAGE_STATUS.upcoming,
  ]);
}

function stageStatuses(
  statuses: readonly (typeof MORNING_CENTER_STAGE_STATUS)[keyof typeof MORNING_CENTER_STAGE_STATUS][],
): MorningCenterOverview['stages'] {
  const ids = [
    MORNING_CENTER_STAGE_ID.quickStart,
    MORNING_CENTER_STAGE_ID.physicalActivation,
    MORNING_CENTER_STAGE_ID.mirror,
    MORNING_CENTER_STAGE_ID.mainAction,
    MORNING_CENTER_STAGE_ID.workBlock,
  ] as const;
  return ids.map((id, index) => ({
    id,
    status: statuses[index]!,
    estimatedMinutes: [5, 10, 5, 5, 25][index]!,
    scenarioStatus: 'normal',
  }));
}
