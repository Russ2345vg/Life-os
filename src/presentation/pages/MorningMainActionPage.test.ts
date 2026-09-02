import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityId } from '../../domain';
import { MorningMainActionPage } from './MorningMainActionPage';

describe('MorningMainActionPage', () => {
  it('shows the four approved facts for a ready main action', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningMainActionPage, {
        overview: {
          decisionId: EntityId.create('decision'),
          decisionTitle: 'Запустить MOR-05',
          expectedResult: 'Сокращённое утро работает',
          firstStepId: EntityId.create('action'),
          firstStepTitle: 'Открыть первый тест',
          scheduledTime: '09:00–10:00',
          completed: false,
          ready: true,
          candidates: [],
        },
        mutable: true,
        busy: false,
        error: null,
        onBack: () => undefined,
        onCandidateChange: () => undefined,
        onSelectCandidate: () => undefined,
        onSchedule: () => undefined,
        onSkip: () => undefined,
      }),
    );

    expect(markup).toContain('Главное действие');
    expect(markup).toContain('class="morning-main-action-title"');
    expect(markup).toContain('class="morning-main-action-fact-label">Что делаю');
    expect(markup).toContain('class="morning-main-action-fact-value">Запустить MOR-05');
    expect(markup.match(/class="morning-main-action-fact(?: is-ready)?"/g)).toHaveLength(4);
    expect(markup).toContain('Запустить MOR-05');
    expect(markup).toContain('Сокращённое утро работает');
    expect(markup).toContain('09:00–10:00');
    expect(markup).toContain('Открыть первый тест');
    expect(markup).toContain('Готово к переходу в рабочий блок');
  });

  it('renders accessible candidate choice when first step is absent', () => {
    const markup = renderToStaticMarkup(
      createElement(MorningMainActionPage, {
        overview: {
          decisionId: EntityId.create('decision'),
          decisionTitle: 'Главное решение',
          expectedResult: 'Ожидаемый результат',
          firstStepId: null,
          firstStepTitle: null,
          scheduledTime: null,
          completed: false,
          ready: false,
          candidates: [
            {
              id: EntityId.create('candidate'),
              title: 'Выбрать первый шаг',
              expectedResult: 'Ясный результат',
            },
          ],
        },
        mutable: true,
        busy: false,
        error: null,
        selectedCandidateId: 'candidate',
        onBack: () => undefined,
        onCandidateChange: () => undefined,
        onSelectCandidate: () => undefined,
        onSchedule: () => undefined,
        onSkip: () => undefined,
      }),
    );

    expect(markup).toContain('<fieldset');
    expect(markup).toContain('type="radio"');
    expect(markup).toContain('Выбрать первый шаг');
    expect(markup).toContain('Назначить первым шагом');
    expect(markup).toContain('Сегодня без главного действия');
  });
});
