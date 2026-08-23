import { useState } from 'react';
import type { EveningReviewSnapshot, ReflectionSession } from '../../application';
import { REFLECTION_QUESTION_TYPE, type ReflectionQuestion } from '../../domain';
import { EveningVisualIcon, type EveningVisualIconName } from '../components/EveningVisualIcon';
import {
  createEveningTodayHistoryModel,
  type EveningHistoryOutcomeIcon,
  type EveningTodayHistoryCardModel,
} from './EveningCompletedHistoryPresentation';

export function EveningTodayHistoryScene({
  snapshot,
}: {
  readonly snapshot: EveningReviewSnapshot;
}) {
  const model = createEveningTodayHistoryModel(snapshot);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeIndex = Math.min(selectedIndex, Math.max(0, model.cards.length - 1));
  const selectedCard = model.cards[safeIndex] ?? null;

  return (
    <section
      className="evening-e9-scene evening-today-scene evening-history-scene"
      aria-labelledby="today-history-title"
      data-history-scene="today"
    >
      <header className="evening-scene-hero evening-today-hero is-complete">
        <span className="evening-scene-hero-icon" aria-hidden="true">
          <EveningVisualIcon name="sun" />
        </span>
        <div>
          <p className="section-kicker green">Сегодня · завершено</p>
          <h3 id="today-history-title">Сегодня</h3>
          <p>Итоги разбора сохранены и открыты только для просмотра.</p>
        </div>
      </header>

      {selectedCard === null ? (
        <div className="evening-e9-card evening-e9-empty-card evening-today-empty-card">
          <span className="evening-empty-icon" aria-hidden="true">
            <EveningVisualIcon name="check" />
          </span>
          <div>
            <p className="section-kicker green">День закрыт</p>
            <h4>Незавершённых элементов не было.</h4>
            <p>День завершён без дополнительных решений.</p>
          </div>
        </div>
      ) : (
        <div className="evening-history-object-stage">
          <HistoryCard card={selectedCard} />
          <HistoryViewerNavigation
            current={safeIndex}
            total={model.cards.length}
            onPrevious={() => setSelectedIndex((index) => Math.max(0, index - 1))}
            onNext={() => setSelectedIndex((index) => Math.min(model.cards.length - 1, index + 1))}
          />
          <HistoryProgress resolved={model.summary.reviewed} total={model.summary.total} />
        </div>
      )}
    </section>
  );
}

function HistoryCard({ card }: { readonly card: EveningTodayHistoryCardModel }) {
  return (
    <article
      className={`evening-today-object-card evening-history-object-card ${card.entityClass}`}
      data-history-item={card.key}
    >
      <span className="evening-object-emblem" aria-hidden="true">
        <EveningVisualIcon name={card.entityClass === 'is-decision' ? 'target' : 'list'} />
      </span>
      <div className="evening-object-copy">
        <p className="evening-object-type">{card.typeLabel}</p>
        <h4>{card.title}</h4>
        <ul className="evening-object-meta" aria-label="Контекст элемента">
          {card.context.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div
        className={`evening-history-outcome is-${card.outcomeTone}`}
        aria-label={`Сохранённый исход: ${card.outcomeLabel}`}
      >
        <EveningVisualIcon name={historyOutcomeIcon(card.outcomeIcon)} />
        <div>
          <span>Сохранённый исход</span>
          <strong>{card.outcomeLabel}</strong>
        </div>
      </div>
    </article>
  );
}

function HistoryViewerNavigation({
  current,
  total,
  onPrevious,
  onNext,
}: {
  readonly current: number;
  readonly total: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  if (total <= 1) return null;
  return (
    <nav className="evening-history-viewer-navigation" aria-label="Просмотр итогов дня">
      <button
        className="is-previous"
        type="button"
        aria-label="Предыдущий итог"
        disabled={current === 0}
        onClick={onPrevious}
      >
        <EveningVisualIcon name="arrow-right" />
      </button>
      <p aria-live="polite">
        <strong>{current + 1}</strong> из {total}
      </p>
      <button
        type="button"
        aria-label="Следующий итог"
        disabled={current === total - 1}
        onClick={onNext}
      >
        <EveningVisualIcon name="arrow-right" />
      </button>
    </nav>
  );
}

function HistoryProgress({
  resolved,
  total,
}: {
  readonly resolved: number;
  readonly total: number;
}) {
  const segmentCount = Math.max(1, total);
  return (
    <div className="evening-segmented-progress evening-history-progress">
      <span>
        Разобрано <strong>{resolved}</strong> из {total}
      </span>
      <div className="evening-progress-segments" aria-hidden="true">
        {Array.from({ length: segmentCount }, (_, index) => (
          <i className={index < resolved ? 'is-complete' : ''} key={index} />
        ))}
      </div>
      <progress value={resolved} max={segmentCount} aria-label="Сохранённый прогресс разбора" />
    </div>
  );
}

function historyOutcomeIcon(icon: EveningHistoryOutcomeIcon): EveningVisualIconName {
  if (icon === 'check') return 'check';
  if (icon === 'arrow') return 'carry';
  if (icon === 'pencil') return 'pencil';
  if (icon === 'drop') return 'ban';
  return 'choice';
}

export function EveningReflectionHistoryScene({
  session,
}: {
  readonly session: ReflectionSession | null;
}) {
  const cycle = session?.cycle;
  const questions = session?.questions ?? cycle?.reflectionQuestions ?? [];

  if (cycle === undefined || questions.length === 0) {
    return (
      <section
        className="evening-e9-scene evening-reflection-scene evening-reflection-history-scene"
        aria-labelledby="reflection-history-title"
        data-history-scene="reflection"
      >
        <div className="evening-reflection-workspace evening-reflection-history-workspace is-empty">
          <article className="evening-e9-card evening-reflection-card evening-reflection-panel evening-reflection-history-main evening-reflection-empty-card">
            <header className="evening-reflection-card-heading evening-reflection-panel-heading">
              <div>
                <p className="section-kicker green">Осмысление · завершено</p>
                <h3 id="reflection-history-title">Осмысление было пропущено.</h3>
              </div>
            </header>
            <section
              className="evening-reflection-history-answer is-empty"
              aria-label="Сохранённый ответ"
            >
              <p className="evening-reflection-answer-label">Сохранённый ответ</p>
              <p className="evening-reflection-answer-text is-empty">
                Для этого завершённого цикла вопросы и ответы не сохранялись.
              </p>
            </section>
          </article>

          <aside
            className="evening-reflection-guidance"
            aria-label="Сохранённый вывод и рекомендация"
          >
            <section className="evening-reflection-guidance-panel evening-reflection-guidance-section is-insight is-empty">
              <span
                className="evening-reflection-guidance-icon evening-guidance-icon"
                aria-hidden="true"
              >
                <EveningVisualIcon name="lightbulb" />
              </span>
              <div>
                <p className="section-kicker">Инсайт</p>
                <p className="evening-reflection-empty-state">Сохранённый инсайт отсутствует.</p>
              </div>
            </section>

            <div className="evening-reflection-guidance-divider" aria-hidden="true" />
            <section className="evening-reflection-guidance-panel evening-reflection-guidance-section is-recommendation is-empty">
              <span
                className="evening-reflection-guidance-icon evening-guidance-icon"
                aria-hidden="true"
              >
                <EveningVisualIcon name="recommendation" />
              </span>
              <div>
                <p className="section-kicker">Рекомендация</p>
                <p className="evening-reflection-empty-state">
                  Связанная рекомендация не зафиксирована.
                </p>
              </div>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section
      className="evening-e9-scene evening-reflection-scene evening-reflection-history-scene"
      aria-labelledby="reflection-history-title"
      data-history-scene="reflection"
    >
      <ReflectionHistoryQuestionViewer cycle={cycle} questions={questions} />
    </section>
  );
}

function ReflectionHistoryQuestionViewer({
  cycle,
  questions,
}: {
  readonly cycle: ReflectionSession['cycle'];
  readonly questions: readonly ReflectionQuestion[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeIndex = Math.min(selectedIndex, questions.length - 1);
  const question = questions[safeIndex]!;
  const result = cycle.reflectionResults.find((candidate) => candidate.questionId === question.id);
  const corrections = cycle.reflectionCorrections.filter(
    (correction) => correction.sourceQuestionId === question.id,
  );

  return (
    <div className="evening-reflection-workspace evening-reflection-history-workspace">
      <article className="evening-e9-card evening-reflection-card evening-reflection-panel evening-reflection-history-main">
        <header className="evening-reflection-card-heading evening-reflection-panel-heading">
          <div>
            <p className="section-kicker gold">Осмысление · сохранено</p>
            <h3 id="reflection-history-title">{question.prompt}</h3>
          </div>
          <ReflectionQuestionNavigation
            current={safeIndex}
            total={questions.length}
            onPrevious={() => setSelectedIndex((index) => Math.max(0, index - 1))}
            onNext={() => setSelectedIndex((index) => Math.min(questions.length - 1, index + 1))}
          />
        </header>

        <ReflectionHistoryAnswer question={question} answer={result?.answer ?? null} />
      </article>

      <aside className="evening-reflection-guidance" aria-label="Сохранённый вывод и рекомендация">
        <section className="evening-reflection-guidance-panel evening-reflection-guidance-section is-insight">
          <span
            className="evening-reflection-guidance-icon evening-guidance-icon"
            aria-hidden="true"
          >
            <EveningVisualIcon name="lightbulb" />
          </span>
          <div>
            <p className="section-kicker gold">Инсайт</p>
            <strong>{question.context}</strong>
            {corrections.length === 0 ? null : (
              <ul>
                {corrections.map((correction) => (
                  <li key={correction.id.toString()}>{correction.observation}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="evening-reflection-guidance-divider" aria-hidden="true" />
        <section
          className={`evening-reflection-guidance-panel evening-reflection-guidance-section is-recommendation ${
            corrections.length > 0 ? 'has-result' : 'is-empty'
          }`}
        >
          <span
            className="evening-reflection-guidance-icon evening-guidance-icon"
            aria-hidden="true"
          >
            <EveningVisualIcon name="recommendation" />
          </span>
          <div>
            <p className={`section-kicker ${corrections.length > 0 ? 'green' : 'gold'}`}>
              Рекомендация
            </p>
            {corrections.length > 0 ? (
              <ul>
                {corrections.map((correction) => (
                  <li key={correction.id.toString()}>{correction.action}</li>
                ))}
              </ul>
            ) : (
              <p className="evening-reflection-empty-state">
                Связанная рекомендация не зафиксирована.
              </p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function ReflectionQuestionNavigation({
  current,
  total,
  onPrevious,
  onNext,
}: {
  readonly current: number;
  readonly total: number;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  return (
    <nav className="evening-reflection-question-selector" aria-label="Выбор вопроса">
      <p aria-live="polite">
        <strong>{current + 1}</strong> из {total}
      </p>
      {total <= 1 ? null : (
        <div>
          <button
            className="is-previous"
            type="button"
            aria-label="Предыдущий вопрос"
            disabled={current === 0}
            onClick={onPrevious}
          >
            <EveningVisualIcon name="arrow-right" />
          </button>
          <button
            type="button"
            aria-label="Следующий вопрос"
            disabled={current === total - 1}
            onClick={onNext}
          >
            <EveningVisualIcon name="arrow-right" />
          </button>
        </div>
      )}
    </nav>
  );
}

function ReflectionHistoryAnswer({
  question,
  answer,
}: {
  readonly question: ReflectionQuestion;
  readonly answer: string | readonly string[] | null;
}) {
  const isChoice =
    question.type === REFLECTION_QUESTION_TYPE.singleChoice ||
    question.type === REFLECTION_QUESTION_TYPE.multiChoice;
  const values = reflectionAnswerValues(question.options, answer);

  return (
    <section className="evening-reflection-history-answer" aria-label="Сохранённый ответ">
      <p className="evening-reflection-answer-label">Ваш ответ</p>
      {answer === null ? (
        <p className="evening-reflection-answer-text is-empty">Вопрос пропущен</p>
      ) : isChoice ? (
        <ul className="evening-reflection-answer-choices">
          {values.map((value) => (
            <li className="is-selected" key={value}>
              <span className="evening-reflection-option-icon" aria-hidden="true">
                <EveningVisualIcon name="choice" />
              </span>
              <span>{value}</span>
              <span className="evening-reflection-option-indicator" aria-hidden="true">
                <EveningVisualIcon name="check" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="evening-reflection-answer-text">{values.join(', ')}</p>
      )}
    </section>
  );
}

function reflectionAnswerValues(
  options: readonly Readonly<{ value: string; label: string }>[],
  answer: string | readonly string[] | null,
): readonly string[] {
  if (answer === null) return [];
  const values = typeof answer === 'string' ? [answer] : answer;
  return values.map((value) => options.find((option) => option.value === value)?.label ?? value);
}
