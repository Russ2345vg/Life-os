// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';
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
import { EMPTY_REFLECTION_ANSWER_DRAFT } from './ReflectionAnswerDraft';

const reflectionCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const reflectionV2Css = readFileSync(
  new URL('../styles/evening-reflection-v2.css', import.meta.url),
  'utf8',
);

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

  it('показывает основной вопрос шага без пустой secondary-зоны', () => {
    const question = createGeneralLearningQuestion();
    const markup = renderScene(createSession(question, 0, 1));

    expect(markup).toContain('Один вопрос о сегодняшнем дне');
    expect(markup).toContain('Кратко зафиксируйте один вывод, если он есть.');
    expect(markup).toContain('Есть ли один полезный вывод из сегодняшнего дня?');
    expect(markup).toContain('aria-label="Да"');
    expect(markup).toContain('aria-label="Нет"');
    expect(markup).toContain('class="evening-reflection-yes-no"');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('evening-reflection-guidance');
    expect(markup).toContain('evening-reflection-workspace is-primary-only');
    expect(markup).toContain('data-evening-icon="moon"');
    expect(primaryActionTag(markup)).toContain('disabled');
  });

  it('показывает компактное поле только для Да и требует заполненный вывод', () => {
    const question = createGeneralLearningQuestion();
    const emptyYesMarkup = renderScene(createSession(question, 0, 1), { yesNo: true });
    const filledYesMarkup = renderScene(createSession(question, 0, 1), {
      yesNo: true,
      text: 'Сначала определить один следующий шаг',
    });
    const noMarkup = renderScene(createSession(question, 0, 1), { yesNo: false });

    expect(emptyYesMarkup).toContain('placeholder="Коротко сформулируйте вывод дня"');
    expect(emptyYesMarkup).toMatch(/<textarea[^>]*rows="2"/);
    expect(primaryActionTag(emptyYesMarkup)).toContain('disabled');
    expect(filledYesMarkup).toContain('Сначала определить один следующий шаг');
    expect(primaryActionTag(filledYesMarkup)).not.toContain('disabled');
    expect(noMarkup).not.toContain('<textarea');
    expect(primaryActionTag(noMarkup)).not.toContain('disabled');
  });

  it('показывает SHORT_CAPTURE как ограниченный короткий ответ', () => {
    const question = createQuestion(REFLECTION_QUESTION_TYPE.shortCapture, true);
    const markup = renderScene(createSession(question, 0, 1), { text: 'Один следующий шаг' });

    expect(markup).toContain('<textarea rows="3" maxLength="2000"');
    expect(markup).toContain('Короткий вывод');
    expect(markup).toContain('Сохранить и продолжить');
  });

  it('закрепляет доступные YES_NO controls и mobile full-width CTA', () => {
    expect(reflectionCss).toMatch(
      /\.evening-command-center-page \.evening-reflection-yes-no button\s*{[^}]*min-height:\s*2\.8rem/,
    );
    expect(reflectionCss).toMatch(
      /\.evening-command-center-page \.evening-reflection-yes-no button:focus-visible\s*{[^}]*outline:/,
    );
    expect(reflectionCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-reflection-actions \.primary-button\s*{[^}]*width:\s*100%/,
    );
    expect(reflectionV2Css).toMatch(
      /\.evening-reflection-workspace\.is-primary-only\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(reflectionV2Css).toMatch(
      /\.evening-reflection-yes-no[\s\S]*?button\.is-selected\s*{[^}]*border-color:\s*var\(--evening-v2-gold-soft\)/,
    );
    expect(reflectionV2Css).toMatch(
      /\.evening-reflection-insight-textarea\s*{[^}]*min-height:\s*4\.5rem/,
    );
  });

  it('даёт программную focus-точку текущему вопросу и inline error', () => {
    const question = createQuestion(REFLECTION_QUESTION_TYPE.yesNo, true);
    const markup = renderToStaticMarkup(
      createElement(EveningReflectionScene, {
        session: createSession(question, 0, 1),
        draft: EMPTY_REFLECTION_ANSWER_DRAFT,
        correctionAction: '',
        lastAnsweredQuestionId: null,
        disabled: false,
        error: 'Не удалось сохранить ответ.',
        onDraftChange: vi.fn(),
        onAnswer: vi.fn(),
        onSkip: vi.fn(),
        onCorrectionActionChange: vi.fn(),
        onCreateCorrection: vi.fn(),
      }),
    );

    expect(markup).toContain('data-reflection-question-heading="true" tabindex="-1"');
    expect(markup).toContain('role="alert" tabindex="-1"');
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
    yesNo?: boolean | null;
    correctionAction?: string;
    lastAnsweredQuestionId?: string | null;
  }> = {},
): string {
  return renderToStaticMarkup(
    createElement(EveningReflectionScene, {
      session,
      draft: {
        ...EMPTY_REFLECTION_ANSWER_DRAFT,
        text: overrides.text ?? '',
        choices: overrides.choices ?? [],
        yesNo: overrides.yesNo ?? null,
      },
      correctionAction: overrides.correctionAction ?? '',
      lastAnsweredQuestionId: overrides.lastAnsweredQuestionId ?? null,
      disabled: false,
      error: null,
      onDraftChange: vi.fn(),
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
    sourceEntityIds: [EntityId.create(`reflection-source-${type.toLowerCase()}`)],
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

function createGeneralLearningQuestion(): ReflectionQuestion {
  return ReflectionQuestion.create({
    id: 'reflection-general-learning',
    kind: REFLECTION_QUESTION_KIND.generalLearning,
    signal: REFLECTION_DAY_SIGNAL.learning,
    type: REFLECTION_QUESTION_TYPE.yesNo,
    prompt: 'Есть ли один полезный вывод из сегодняшнего дня?',
    context: 'Значимых отклонений или результатов сегодня не зафиксировано.',
    required: true,
    sourceEntityIds: [],
  });
}

function primaryActionTag(markup: string): string {
  return markup.match(/<button class="primary-button"[^>]*>/)?.[0] ?? '';
}

function createCycle(): EveningCycle {
  return EveningCycle.create({
    id: EntityId.create('reflection-visual-cycle'),
    dayId: EntityId.create('reflection-visual-day'),
    dateKey: DayDate.create('2026-08-21'),
    occurredAt: new Date('2026-08-21T20:30:00.000+09:00'),
  });
}
