import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ManagementOverviewSnapshot } from '../../application';
import { ManagementOverviewView } from './ManagementOverview';

function render(snapshot: ManagementOverviewSnapshot) {
  return renderToStaticMarkup(
    createElement(ManagementOverviewView, {
      snapshot,
      onOpenSection: vi.fn(),
      onOpenProject: vi.fn(),
      onOpenDirection: vi.fn(),
      onOpenDecision: vi.fn(),
    }),
  );
}

const empty: ManagementOverviewSnapshot = {
  focus: { kind: 'empty' },
  today: { mainDecision: null, decisionCount: 0, actionCount: 0, currentSession: null },
  course: { activeDirectionCount: 0, activeProjectCount: 0 },
  signals: [],
};

describe('Management overview presentation', () => {
  it('shows honest empty signals and a concrete focus action without fake severity', () => {
    const html = render(empty);
    expect(html).toContain('Нет сигналов, требующих внимания');
    expect(html).toContain('Определить фокус');
    expect(html).toContain('Выберите главную цель или направление, чтобы видеть их здесь');
    expect(html).not.toMatch(/Критич|Важно|progressbar|Рекомендуемое/);
  });

  it('keeps real names, counts and order with precise signal actions', () => {
    const html = render({
      ...empty,
      signals: [
        {
          kind: 'active_project_without_decisions',
          title: 'Активный цель без решений',
          detail: 'SYNC03_РЕАЛЬНОЕ_ИМЯ',
          projectId: 'goal-1',
          directionId: null,
          decisionId: null,
        },
        {
          kind: 'focus_undefined',
          title: 'Фокус не определён',
          detail: 'Нет главной цели.',
          projectId: null,
          directionId: null,
          decisionId: null,
        },
      ],
    });
    expect(html).toContain('Всего сигналов');
    expect(html).toContain('Активная цель без решений');
    expect(html).toContain('SYNC03_РЕАЛЬНОЕ_ИМЯ');
    expect(html).toContain('Для цели пока не выбраны решения');
    expect(html).toContain('Открыть цель');
    expect(html).toContain('Все сигналы: 2');
    expect(html.indexOf('SYNC03_РЕАЛЬНОЕ_ИМЯ')).toBeLessThan(html.lastIndexOf('Нет главной цели.'));
  });

  it.each(['project', 'direction'] as const)(
    'names the %s focus action and uses a neutral day shortcut',
    (kind) => {
      const html = render({
        ...empty,
        focus:
          kind === 'project'
            ? {
                kind,
                id: 'goal-1',
                title: 'Настоящая цель',
                desiredResult: 'Результат',
                directionName: 'Развитие',
              }
            : { kind, id: 'direction-1', title: 'Развитие' },
      });
      expect(html).toContain(kind === 'project' ? 'Открыть цель' : 'Открыть направление');
      expect(html).toContain('Изменить фокус');
      expect(html).toContain('Открыть день');
      expect(html).not.toContain('Рекомендуемое');
    },
  );

  it('preserves real day counts and paused session without inventing progress', () => {
    const html = render({
      ...empty,
      today: {
        mainDecision: { id: 'decision-1', title: 'Закончить главу' },
        decisionCount: 7,
        actionCount: 12,
        currentSession: { actionId: 'action-1', actionTitle: 'Прочитать', status: 'paused' },
      },
    });
    expect(html).toContain('Закончить главу');
    expect(html).toContain('<strong>7</strong>');
    expect(html).toContain('<strong>12</strong>');
    expect(html).toContain('На паузе');
    expect(html).toContain('Прочитать');
    expect(html).not.toContain('%');
  });
});
