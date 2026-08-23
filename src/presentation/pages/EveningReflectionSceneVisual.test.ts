import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ReflectionSession } from '../../application';
import {
  DayDate,
  EntityId,
  EveningCycle,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  REFLECTION_QUESTION_TYPE,
  ReflectionQuestion,
  type ReflectionQuestionType,
} from '../../domain';
import { EveningReflectionScene } from './EveningReflectionScene';

describe('EveningReflectionScene visual composition', () => {
  it('собирает один вопрос и контекст в рабочее пространство 65/35-ready', () => {
    const question = createQuestion(REFLECTION_QUESTION_TYPE.singleChoice, true);
    const markup = renderScene(createSession(question, 1, 3), {
      text: 'UNCLEAR_STEP',
    });

    const mainPanel = markup.indexOf('evening-reflection-card');
    const contextPanel = markup.indexOf('evening-reflection-guidance');

    expect(markup).toContain('class="evening-reflection-workspace"');
    expect(mainPanel).toBeGreaterThan(-1);
    expect(contextPanel).toBeGreaterThan(mainPanel);
    expect(markup).toContain('class="evening-reflection-card-heading"');
    expect(markup).toContain('aria-label="Вопрос 2 из 3"');
    expect(markup).toContain('Что стало основной причиной?');
    expect(markup.match(/evening-reflection-guidance-panel/g)).toHaveLength(2);
    expect(markup).toContain('data-evening-icon="lightbulb"');
    expect(markup).toContain('data-evening-icon="recommendation"');
    expect(markup).toContain('class="evening-reflection-guidance-divider"');
  });

  it('показывает option rows с локальным выбором и основной CTA первой', () => {
    const question = createQuestion(REFLECTION_QUESTION_TYPE.singleChoice, false);
    const markup = renderScene(createSession(question, 0, 2), {
      text: 'UNCLEAR_STEP',
    });

    const primaryAction = markup.indexOf('class="primary-button"');
    const skipAction = markup.indexOf('class="evening-reflection-skip"');

    expect(markup.match(/data-evening-icon="choice"/g)).toHaveLength(2);
    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('data-selected="false"');
    expect(markup).toContain('class="evening-reflection-option-indicator"');
    expect(markup).toContain('data-evening-icon="check"');
    expect(primaryAction).toBeGreaterThan(-1);
    expect(skipAction).toBeGreaterThan(primaryAction);
    expect(markup).toContain('data-evening-icon="arrow-right"');
    expect(markup).toContain('Учтите завтра: неясный следующий шаг.');
  });

  it('оставляет текстовый ответ и follow-up компактными внутри Recommendation', () => {
    const question = createQuestion(REFLECTION_QUESTION_TYPE.optionalText, false);
    const markup = renderScene(createSession(question, 0, 1), {
      text: 'Сохранить короткий вывод',
      correctionAction: 'Открыть проект до начала работы',
      lastAnsweredQuestionId: 'previous-question',
    });

    const recommendation = markup.indexOf(
      'evening-reflection-guidance-panel evening-reflection-recommendation',
    );
    const followUp = markup.indexOf('evening-reflection-follow-up');

    expect(markup).toContain('<textarea rows="3"');
    expect(markup).toContain('Сохранить и продолжить');
    expect(markup).toContain('Пропустить');
    expect(recommendation).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(recommendation);
    expect(markup.match(/evening-reflection-guidance-panel/g)).toHaveLength(2);
    expect(markup).toContain('Вывод сохранён');
    expect(markup).toContain('Превратите этот вывод в один наблюдаемый шаг на завтра.');
  });

  it('показывает завершённое осмысление в том же каркасе без рабочих CTA', () => {
    const session: ReflectionSession = {
      cycle: createCycle(),
      questions: [],
      currentQuestion: null,
      processed: 2,
      total: 2,
      complete: true,
    };
    const markup = renderScene(session);

    expect(markup).toContain('evening-reflection-workspace is-complete');
    expect(markup).toContain('evening-reflection-complete-card');
    expect(markup).toContain('Осмысление завершено');
    expect(markup).toContain('aria-label="Вопрос 2 из 2"');
    expect(markup).toContain('День осмыслен.');
    expect(markup).not.toContain('evening-reflection-guidance');
    expect(markup).not.toContain('<button');
  });
});

function renderScene(
  session: ReflectionSession,
  overrides: Readonly<{
    text?: string;
    choices?: readonly string[];
    correctionAction?: string;
    lastAnsweredQuestionId?: string | null;
  }> = {},
): string {
  return renderToStaticMarkup(
    createElement(EveningReflectionScene, {
      session,
      text: overrides.text ?? '',
      choices: overrides.choices ?? [],
      correctionAction: overrides.correctionAction ?? '',
      lastAnsweredQuestionId: overrides.lastAnsweredQuestionId ?? null,
      disabled: false,
      error: null,
      onTextChange: vi.fn(),
      onChoicesChange: vi.fn(),
      onAnswer: vi.fn(),
      onSkip: vi.fn(),
      onCorrectionActionChange: vi.fn(),
      onCreateCorrection: vi.fn(),
    }),
  );
}

function createSession(
  question: ReflectionQuestion,
  processed: number,
  total: number,
): ReflectionSession {
  return {
    cycle: createCycle(),
    questions: [question],
    currentQuestion: question,
    processed,
    total,
    complete: false,
  };
}

function createQuestion(type: ReflectionQuestionType, required: boolean): ReflectionQuestion {
  const isChoice =
    type === REFLECTION_QUESTION_TYPE.singleChoice || type === REFLECTION_QUESTION_TYPE.multiChoice;

  return ReflectionQuestion.create({
    id: `reflection-visual-${type.toLowerCase()}`,
    kind: REFLECTION_QUESTION_KIND.repeatedFriction,
    signal: REFLECTION_DAY_SIGNAL.friction,
    type,
    prompt: 'Что стало основной причиной?',
    context: 'Главное Решение переносится третий день подряд.',
    required,
    sourceEntityIds: [],
    ...(isChoice
      ? {
          options: [
            { value: 'UNCLEAR_STEP', label: 'Неясный следующий шаг' },
            { value: 'NOT_ENOUGH_TIME', label: 'Не хватило времени' },
          ],
        }
      : {}),
  });
}

function createCycle(): EveningCycle {
  return EveningCycle.create({
    id: EntityId.create('reflection-visual-cycle'),
    dayId: EntityId.create('reflection-visual-day'),
    dateKey: DayDate.create('2026-08-21'),
    occurredAt: new Date('2026-08-21T20:30:00.000+09:00'),
  });
}
