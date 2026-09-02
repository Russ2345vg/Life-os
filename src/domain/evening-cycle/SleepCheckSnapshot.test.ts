import { describe, expect, it } from 'vitest';
import * as SleepCheckDomain from './SleepCheckSnapshot';
import { SleepCheckSnapshot } from './SleepCheckSnapshot';

type Rating = 1 | 2 | 3 | 4 | 5;
type QuestionId = 'CALM_MIND' | 'HOLDING_THOUGHT' | 'READY_FOR_SLEEP';
type AnswerValue = 'YES' | 'NO';
type CorrectiveAction = 'BREATHING_2_MIN' | 'CAPTURE_THOUGHT' | 'RELAX_5_MORE_MIN';

interface AnswerRecord {
  readonly questionId: QuestionId;
  readonly value: AnswerValue;
  readonly answeredAt: Date;
}

interface CorrectiveActionRecord {
  readonly questionId: QuestionId;
  readonly action: CorrectiveAction;
  readonly selectedAt: Date;
  readonly completedAt: Date | null;
  readonly capturedThought: string | null;
}

interface R6Snapshot {
  readonly calmBefore: Rating;
  readonly sleepReadinessBefore: Rating;
  readonly beforeRatedAt: Date;
  readonly calmAfter: Rating | null;
  readonly sleepReadinessAfter: Rating | null;
  readonly afterRatedAt: Date | null;
  readonly initialAnswers: readonly AnswerRecord[];
  readonly retriedAnswers: readonly AnswerRecord[];
  readonly correctiveAction: CorrectiveActionRecord | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly readyToComplete: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  startCheck(occurredAt: Date): boolean;
  setAfterRatings(calm: Rating, sleepReadiness: Rating, occurredAt: Date): boolean;
  answerQuestion(questionId: QuestionId, value: AnswerValue, occurredAt: Date): boolean;
  chooseCorrectiveAction(
    questionId: QuestionId,
    action: CorrectiveAction,
    occurredAt: Date,
  ): boolean;
  completeCorrectiveAction(
    questionId: QuestionId,
    capturedThought: string | null,
    occurredAt: Date,
  ): boolean;
  retryQuestion(questionId: QuestionId, value: AnswerValue, occurredAt: Date): boolean;
  complete(occurredAt: Date): boolean;
}

const BEFORE = at('22:00:00');
const STARTED = at('22:30:00');

describe('SleepCheckSnapshot', () => {
  it('публикует закрытые значения вопросов, ответов, моментов и corrective actions', () => {
    const contract = SleepCheckDomain as unknown as Record<string, unknown>;

    expect(contract.SUBJECTIVE_RATING_MOMENT).toEqual({
      beforeRelaxation: 'BEFORE_RELAXATION',
      afterRelaxation: 'AFTER_RELAXATION',
    });
    expect(contract.SLEEP_CHECK_QUESTION).toEqual({
      calmMind: 'CALM_MIND',
      holdingThought: 'HOLDING_THOUGHT',
      readyForSleep: 'READY_FOR_SLEEP',
    });
    expect(contract.SLEEP_CHECK_ANSWER).toEqual({ yes: 'YES', no: 'NO' });
    expect(contract.CORRECTIVE_ACTION).toEqual({
      breathing2Min: 'BREATHING_2_MIN',
      captureThought: 'CAPTURE_THOUGHT',
      relax5MoreMin: 'RELAX_5_MORE_MIN',
    });
  });

  it('принимает только целые ratings 1–5 и защищает даты от внешней мутации', () => {
    const invalidStart = SleepCheckSnapshot.start as unknown as (data: {
      calmBefore: number;
      sleepReadinessBefore: number;
      occurredAt: Date;
    }) => SleepCheckSnapshot;

    for (const value of [0, 6, 2.5, Number.NaN]) {
      expect(() =>
        invalidStart({ calmBefore: value, sleepReadinessBefore: 3, occurredAt: BEFORE }),
      ).toThrowError(expect.objectContaining({ code: 'sleep_check.invalid_rating' }));
    }

    const mutableDate = at('22:01:00');
    const snapshot = r6(
      SleepCheckSnapshot.start({
        calmBefore: 2,
        sleepReadinessBefore: 3,
        occurredAt: mutableDate,
      }),
    );
    mutableDate.setUTCFullYear(2030);
    const exposed = snapshot.beforeRatedAt;
    exposed.setUTCFullYear(2031);

    expect(snapshot.beforeRatedAt).toEqual(at('22:01:00'));
    expect(() => snapshot.startCheck(new Date('invalid'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.invalid_time' }),
    );
  });

  it('сохраняет AFTER pair только после старта и делает одинаковые команды идемпотентными', () => {
    const snapshot = fresh();
    expect(() => snapshot.setAfterRatings(4, 5, at('22:31:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.not_started' }),
    );
    expect(snapshot.startCheck(STARTED)).toBe(true);
    expect(snapshot.startCheck(at('22:30:30'))).toBe(false);
    expect(snapshot.setAfterRatings(4, 5, at('22:31:00'))).toBe(true);
    const updatedAt = snapshot.updatedAt;

    expect(snapshot.setAfterRatings(4, 5, at('22:32:00'))).toBe(false);
    expect(snapshot.updatedAt).toEqual(updatedAt);
    expect(() => snapshot.setAfterRatings(3, 5, at('22:32:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.after_ratings_already_recorded' }),
    );
  });

  it('принимает три initial answers только один раз и строго по порядку', () => {
    const snapshot = started();
    expect(() => snapshot.answerQuestion('HOLDING_THOUGHT', 'NO', at('22:32:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.unexpected_question' }),
    );
    expect(snapshot.answerQuestion('CALM_MIND', 'YES', at('22:32:00'))).toBe(true);
    expect(snapshot.answerQuestion('CALM_MIND', 'YES', at('22:33:00'))).toBe(false);
    expect(() => snapshot.answerQuestion('CALM_MIND', 'NO', at('22:33:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.answer_already_recorded' }),
    );
    expect(snapshot.answerQuestion('HOLDING_THOUGHT', 'NO', at('22:34:00'))).toBe(true);
    expect(snapshot.answerQuestion('READY_FOR_SLEEP', 'YES', at('22:35:00'))).toBe(true);

    expect(snapshot.initialAnswers.map(({ questionId }) => questionId)).toEqual([
      'CALM_MIND',
      'HOLDING_THOUGHT',
      'READY_FOR_SLEEP',
    ]);
  });

  it.each([
    ['CALM_MIND', 'NO', 'BREATHING_2_MIN'],
    ['HOLDING_THOUGHT', 'YES', 'CAPTURE_THOUGHT'],
    ['READY_FOR_SLEEP', 'NO', 'RELAX_5_MORE_MIN'],
  ] as const)(
    'привязывает первый problematic %s:%s к единственному действию %s',
    (questionId, answer, action) => {
      const snapshot = started();
      answerUntil(snapshot, questionId, answer);

      expect(snapshot.chooseCorrectiveAction(questionId, action, at('22:40:00'))).toBe(true);
      expect(snapshot.chooseCorrectiveAction(questionId, action, at('22:41:00'))).toBe(false);
      expect(snapshot.correctiveAction).toMatchObject({ questionId, action });
      expect(() =>
        snapshot.chooseCorrectiveAction(questionId, otherAction(action), at('22:41:00')),
      ).toThrowError(expect.objectContaining({ code: 'sleep_check.corrective_action_conflict' }));
    },
  );

  it('валидирует capture, завершает action один раз и не создаёт второй экземпляр', () => {
    const snapshot = started();
    snapshot.answerQuestion('CALM_MIND', 'YES', at('22:32:00'));
    snapshot.answerQuestion('HOLDING_THOUGHT', 'YES', at('22:33:00'));
    snapshot.chooseCorrectiveAction('HOLDING_THOUGHT', 'CAPTURE_THOUGHT', at('22:34:00'));

    expect(() =>
      snapshot.completeCorrectiveAction('HOLDING_THOUGHT', '   ', at('22:35:00')),
    ).toThrowError(expect.objectContaining({ code: 'sleep_check.captured_thought_required' }));
    expect(() =>
      snapshot.completeCorrectiveAction('HOLDING_THOUGHT', 'x'.repeat(281), at('22:35:00')),
    ).toThrowError(expect.objectContaining({ code: 'sleep_check.captured_thought_too_long' }));
    expect(
      snapshot.completeCorrectiveAction(
        'HOLDING_THOUGHT',
        '  Вернуться к смете завтра  ',
        at('22:35:00'),
      ),
    ).toBe(true);
    const completedAt = snapshot.correctiveAction?.completedAt;

    expect(
      snapshot.completeCorrectiveAction(
        'HOLDING_THOUGHT',
        'Вернуться к смете завтра',
        at('22:36:00'),
      ),
    ).toBe(false);
    expect(snapshot.correctiveAction).toMatchObject({
      capturedThought: 'Вернуться к смете завтра',
      completedAt,
    });
  });

  it('разрешает только один retry связанного вопроса и не блокирует negative retry', () => {
    const snapshot = started();
    snapshot.answerQuestion('CALM_MIND', 'NO', at('22:32:00'));
    snapshot.chooseCorrectiveAction('CALM_MIND', 'BREATHING_2_MIN', at('22:33:00'));
    expect(() => snapshot.retryQuestion('CALM_MIND', 'NO', at('22:34:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.corrective_action_incomplete' }),
    );
    snapshot.completeCorrectiveAction('CALM_MIND', null, at('22:34:00'));
    expect(snapshot.retryQuestion('CALM_MIND', 'NO', at('22:35:00'))).toBe(true);
    expect(snapshot.retryQuestion('CALM_MIND', 'NO', at('22:36:00'))).toBe(false);
    expect(() => snapshot.retryQuestion('CALM_MIND', 'YES', at('22:36:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.retry_already_recorded' }),
    );

    snapshot.answerQuestion('HOLDING_THOUGHT', 'NO', at('22:37:00'));
    snapshot.answerQuestion('READY_FOR_SLEEP', 'YES', at('22:38:00'));
    expect(snapshot.readyToComplete).toBe(true);
  });

  it('завершает готовую проверку и замораживает обычные history mutations', () => {
    const snapshot = started();
    snapshot.answerQuestion('CALM_MIND', 'YES', at('22:32:00'));
    snapshot.answerQuestion('HOLDING_THOUGHT', 'NO', at('22:33:00'));
    snapshot.answerQuestion('READY_FOR_SLEEP', 'NO', at('22:34:00'));
    snapshot.chooseCorrectiveAction('READY_FOR_SLEEP', 'RELAX_5_MORE_MIN', at('22:35:00'));
    snapshot.completeCorrectiveAction('READY_FOR_SLEEP', null, at('22:36:00'));
    snapshot.retryQuestion('READY_FOR_SLEEP', 'NO', at('22:41:00'));

    expect(snapshot.complete(at('22:42:00'))).toBe(true);
    expect(snapshot.complete(at('22:43:00'))).toBe(false);
    expect(snapshot.completedAt).toEqual(at('22:42:00'));
    expect(() => snapshot.setAfterRatings(4, 4, at('22:43:00'))).toThrowError(
      expect.objectContaining({ code: 'sleep_check.completed' }),
    );
  });

  it('отклоняет невозможные persisted combinations при rehydrate', () => {
    const valid = completedRehydrationData();
    const invalid = [
      { ...valid, calmAfter: null, sleepReadinessAfter: null, afterRatedAt: null },
      {
        ...valid,
        correctiveAction: {
          ...valid.correctiveAction!,
          action: 'BREATHING_2_MIN' as const,
        },
      },
      { ...valid, correctiveAction: null },
      { ...valid, startedAt: null },
    ];

    for (const data of invalid) {
      expect(() => SleepCheckSnapshot.rehydrate(data)).toThrowError(
        expect.objectContaining({ code: 'sleep_check.invalid_rehydration' }),
      );
    }
  });

  it('не принимает captured text для breathing/relax actions', () => {
    const snapshot = started();
    snapshot.answerQuestion('CALM_MIND', 'NO', at('22:32:00'));
    snapshot.chooseCorrectiveAction('CALM_MIND', 'BREATHING_2_MIN', at('22:33:00'));

    expect(() =>
      snapshot.completeCorrectiveAction('CALM_MIND', 'лишний текст', at('22:34:00')),
    ).toThrowError(expect.objectContaining({ code: 'sleep_check.captured_thought_not_allowed' }));
    expect(() =>
      snapshot.completeCorrectiveAction('CALM_MIND', '   ', at('22:34:00')),
    ).toThrowError(expect.objectContaining({ code: 'sleep_check.captured_thought_not_allowed' }));
  });

  it('не нормализует молча untrimmed captured thought при rehydrate', () => {
    const valid = completedRehydrationData();

    expect(() =>
      SleepCheckSnapshot.rehydrate({
        ...valid,
        correctiveAction: {
          ...valid.correctiveAction!,
          capturedThought: '  Оставить до завтра  ',
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'sleep_check.invalid_rehydration' }));
  });
});

function fresh(): R6Snapshot {
  return r6(
    SleepCheckSnapshot.start({
      calmBefore: 2,
      sleepReadinessBefore: 3,
      occurredAt: BEFORE,
    }),
  );
}

function started(): R6Snapshot {
  const snapshot = fresh();
  snapshot.startCheck(STARTED);
  snapshot.setAfterRatings(4, 4, at('22:31:00'));
  return snapshot;
}

function answerUntil(snapshot: R6Snapshot, target: QuestionId, answer: AnswerValue): void {
  if (target === 'CALM_MIND') {
    snapshot.answerQuestion(target, answer, at('22:32:00'));
    return;
  }
  snapshot.answerQuestion('CALM_MIND', 'YES', at('22:32:00'));
  if (target === 'HOLDING_THOUGHT') {
    snapshot.answerQuestion(target, answer, at('22:33:00'));
    return;
  }
  snapshot.answerQuestion('HOLDING_THOUGHT', 'NO', at('22:33:00'));
  snapshot.answerQuestion(target, answer, at('22:34:00'));
}

function otherAction(action: CorrectiveAction): CorrectiveAction {
  return action === 'BREATHING_2_MIN' ? 'CAPTURE_THOUGHT' : 'BREATHING_2_MIN';
}

function r6(snapshot: SleepCheckSnapshot): R6Snapshot {
  return snapshot as unknown as R6Snapshot;
}

function at(time: string): Date {
  return new Date(`2026-08-30T${time}.000+09:00`);
}

function completedRehydrationData() {
  return {
    calmBefore: 2 as const,
    sleepReadinessBefore: 3 as const,
    beforeRatedAt: BEFORE,
    calmAfter: 4 as const,
    sleepReadinessAfter: 4 as const,
    afterRatedAt: at('22:31:00'),
    initialAnswers: [
      { questionId: 'CALM_MIND' as const, value: 'YES' as const, answeredAt: at('22:32:00') },
      {
        questionId: 'HOLDING_THOUGHT' as const,
        value: 'YES' as const,
        answeredAt: at('22:33:00'),
      },
      {
        questionId: 'READY_FOR_SLEEP' as const,
        value: 'YES' as const,
        answeredAt: at('22:34:00'),
      },
    ],
    retriedAnswers: [
      {
        questionId: 'HOLDING_THOUGHT' as const,
        value: 'NO' as const,
        answeredAt: at('22:36:00'),
      },
    ],
    correctiveAction: {
      questionId: 'HOLDING_THOUGHT' as const,
      action: 'CAPTURE_THOUGHT' as const,
      selectedAt: at('22:34:30'),
      completedAt: at('22:35:00'),
      capturedThought: 'Оставить до завтра',
    },
    startedAt: STARTED,
    completedAt: at('22:37:00'),
    createdAt: BEFORE,
    updatedAt: at('22:37:00'),
  };
}
