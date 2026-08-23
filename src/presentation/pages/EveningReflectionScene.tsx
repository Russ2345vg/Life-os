import { REFLECTION_QUESTION_TYPE, type ReflectionQuestion } from '../../domain';
import type { ReflectionSession } from '../../application';
import { EveningVisualIcon } from '../components/EveningVisualIcon';

interface EveningReflectionSceneProps {
  readonly session: ReflectionSession;
  readonly text: string;
  readonly choices: readonly string[];
  readonly correctionAction: string;
  readonly lastAnsweredQuestionId: string | null;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onTextChange: (value: string) => void;
  readonly onChoicesChange: (values: readonly string[]) => void;
  readonly onAnswer: () => void;
  readonly onSkip: () => void;
  readonly onCorrectionActionChange: (value: string) => void;
  readonly onCreateCorrection: () => void;
}

export function EveningReflectionScene({
  session,
  text,
  choices,
  correctionAction,
  lastAnsweredQuestionId,
  disabled,
  error,
  onTextChange,
  onChoicesChange,
  onAnswer,
  onSkip,
  onCorrectionActionChange,
  onCreateCorrection,
}: EveningReflectionSceneProps) {
  const question = session.currentQuestion;

  return (
    <section
      className="evening-e9-scene evening-reflection-scene"
      aria-labelledby="reflection-title"
    >
      {question === null ? (
        <div className="evening-reflection-workspace is-complete">
          <article className="evening-e9-card evening-reflection-card evening-reflection-complete-card">
            <ReflectionCardHeading
              title="Осмысление завершено"
              processed={session.total}
              total={session.total}
            />
            <div className="evening-reflection-complete-state" role="status">
              <VisualIcon name="check" className="evening-reflection-complete-icon" />
              <div>
                <p className="section-kicker green">Выводы сохранены</p>
                <h4>День осмыслен.</h4>
                <p>Можно переходить к подготовке завтра.</p>
              </div>
            </div>
          </article>
        </div>
      ) : (
        <div className="evening-reflection-workspace">
          <ReflectionQuestionCard
            question={question}
            processed={session.processed}
            total={session.total}
            text={text}
            choices={choices}
            disabled={disabled}
            onTextChange={onTextChange}
            onChoicesChange={onChoicesChange}
            onAnswer={onAnswer}
            onSkip={onSkip}
          />
          <aside className="evening-reflection-guidance" aria-label="Контекст осмысления">
            <section className="evening-reflection-guidance-panel evening-reflection-insight">
              <VisualIcon name="lightbulb" className="evening-reflection-guidance-icon" />
              <div>
                <p className="section-kicker gold">Инсайт</p>
                <strong>{question.context}</strong>
              </div>
            </section>
            <div className="evening-reflection-guidance-divider" aria-hidden="true" />
            <section className="evening-reflection-guidance-panel evening-reflection-recommendation">
              <VisualIcon name="recommendation" className="evening-reflection-guidance-icon" />
              <div>
                <p className="section-kicker gold">Рекомендация</p>
                <p>{reflectionRecommendation(question, text, choices)}</p>
                {lastAnsweredQuestionId === null ? null : (
                  <ReflectionFollowUp
                    correctionAction={correctionAction}
                    disabled={disabled}
                    onCorrectionActionChange={onCorrectionActionChange}
                    onCreateCorrection={onCreateCorrection}
                  />
                )}
              </div>
            </section>
          </aside>
        </div>
      )}

      {error === null ? null : (
        <p className="form-error evening-e9-scene-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function ReflectionCardHeading({
  title,
  processed,
  total,
}: {
  readonly title: string;
  readonly processed: number;
  readonly total: number;
}) {
  const questionNumber = total === 0 ? 0 : Math.min(processed + 1, total);

  return (
    <header className="evening-reflection-card-heading">
      <VisualIcon name="reflection" className="evening-reflection-heading-icon" />
      <div className="evening-reflection-heading-copy">
        <p className="section-kicker gold">Осмысление</p>
        <h3 id="reflection-title">{title}</h3>
      </div>
      <small
        className="evening-reflection-counter"
        aria-label={`Вопрос ${questionNumber} из ${total}`}
      >
        <strong>{questionNumber}</strong> из {total}
      </small>
    </header>
  );
}

function ReflectionFollowUp({
  correctionAction,
  disabled,
  onCorrectionActionChange,
  onCreateCorrection,
}: {
  readonly correctionAction: string;
  readonly disabled: boolean;
  readonly onCorrectionActionChange: (value: string) => void;
  readonly onCreateCorrection: () => void;
}) {
  return (
    <div className="evening-reflection-follow-up" aria-label="Дополнительная корректировка">
      <p className="evening-reflection-saved">
        <VisualIcon name="check" className="evening-reflection-saved-icon" />
        <span>Вывод сохранён</span>
      </p>
      <details>
        <summary>Использовать этот вывод завтра?</summary>
        <div className="evening-reflection-correction">
          <label>
            <span>Корректировка</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={correctionAction}
              disabled={disabled}
              placeholder="Перед рабочей сессией убирать телефон со стола"
              onChange={(event) => onCorrectionActionChange(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || correctionAction.trim().length === 0}
            onClick={onCreateCorrection}
          >
            Сохранить
          </button>
        </div>
      </details>
    </div>
  );
}

function reflectionRecommendation(
  question: ReflectionQuestion,
  text: string,
  choices: readonly string[],
): string {
  const selectedValues = question.type === REFLECTION_QUESTION_TYPE.multiChoice ? choices : [text];
  const selectedLabels = question.options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label.toLocaleLowerCase('ru-RU'));

  if (selectedLabels.length > 0) return `Учтите завтра: ${selectedLabels.join(', ')}.`;
  if (text.trim().length > 0) return 'Превратите этот вывод в один наблюдаемый шаг на завтра.';
  if (question.options.length > 0)
    return 'Выберите наиболее точную причину — без лишней детализации.';
  return 'Сохраните один короткий вывод, который поможет скорректировать завтра.';
}

function ReflectionQuestionCard({
  question,
  processed,
  total,
  text,
  choices,
  disabled,
  onTextChange,
  onChoicesChange,
  onAnswer,
  onSkip,
}: {
  readonly question: ReflectionQuestion;
  readonly processed: number;
  readonly total: number;
  readonly text: string;
  readonly choices: readonly string[];
  readonly disabled: boolean;
  readonly onTextChange: (value: string) => void;
  readonly onChoicesChange: (values: readonly string[]) => void;
  readonly onAnswer: () => void;
  readonly onSkip: () => void;
}) {
  const isSingleChoice = question.type === REFLECTION_QUESTION_TYPE.singleChoice;
  const isMultiChoice = question.type === REFLECTION_QUESTION_TYPE.multiChoice;
  const isChoice = isSingleChoice || isMultiChoice;
  const canAnswer = isMultiChoice ? choices.length > 0 : text.trim().length > 0;
  const isText =
    question.type === REFLECTION_QUESTION_TYPE.shortText ||
    question.type === REFLECTION_QUESTION_TYPE.optionalText;

  return (
    <article
      className="evening-e9-card evening-reflection-card"
      key={question.id}
      data-question={question.id}
    >
      <ReflectionCardHeading
        title="Один вопрос о сегодняшнем дне"
        processed={processed}
        total={total}
      />
      <div className="evening-reflection-question-block">
        <p className="evening-reflection-question-label">Вопрос</p>
        <h4>{question.prompt}</h4>
      </div>

      {isChoice ? (
        <div className="evening-reflection-options">
          {question.options.map((option) => {
            const selected = isSingleChoice
              ? text === option.value
              : choices.includes(option.value);
            return (
              <label
                className={selected ? 'is-selected' : ''}
                data-selected={selected ? 'true' : 'false'}
                key={option.value}
              >
                <input
                  className="visually-hidden evening-reflection-option-input"
                  type={isSingleChoice ? 'radio' : 'checkbox'}
                  name={question.id}
                  value={option.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => {
                    if (isSingleChoice) {
                      onTextChange(option.value);
                    } else {
                      onChoicesChange(
                        selected
                          ? choices.filter((value) => value !== option.value)
                          : [...choices, option.value],
                      );
                    }
                  }}
                />
                <VisualIcon name="choice" className="evening-reflection-option-icon" />
                <span className="evening-reflection-option-label">{option.label}</span>
                <span className="evening-reflection-option-indicator" aria-hidden="true">
                  {selected ? <EveningVisualIcon name="check" /> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {isText ? (
        <label className="evening-reflection-text">
          <span>{question.required ? 'Короткий вывод' : 'Ответ — по желанию'}</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={text}
            disabled={disabled}
            placeholder="Записать короткий вывод…"
            onChange={(event) => onTextChange(event.target.value)}
          />
        </label>
      ) : null}

      <footer className="evening-reflection-actions">
        <button
          className="primary-button"
          type="button"
          disabled={disabled || !canAnswer}
          onClick={onAnswer}
        >
          <span>{isText ? 'Сохранить и продолжить' : 'Продолжить'}</span>
          <EveningVisualIcon name="arrow-right" />
        </button>
        {question.required ? null : (
          <button
            className="evening-reflection-skip"
            type="button"
            disabled={disabled}
            onClick={onSkip}
          >
            Пропустить
          </button>
        )}
      </footer>
    </article>
  );
}

type ReflectionVisualIconName = 'reflection' | 'choice' | 'check' | 'lightbulb' | 'recommendation';

function VisualIcon({
  name,
  className,
}: {
  readonly name: ReflectionVisualIconName;
  readonly className: string;
}) {
  return (
    <span className={className} data-icon={name} aria-hidden="true">
      <EveningVisualIcon name={name} />
    </span>
  );
}
