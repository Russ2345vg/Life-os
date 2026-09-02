import { MORNING_CENTER_STAGE_STATUS, type MorningCenterOverview } from '../../application';
import { AppIcon } from '../components/AppIcon';
import { MORNING_STAGE_PRESENTATION } from './MorningStagePresentation';

const MORNING_MIRROR_COPY = {
  eyebrow: 'РАСПОРЯДОК · УТРО',
  pageTitle: 'Настрой перед зеркалом',
  subtitle: 'Короткая настройка внимания перед главным действием дня.',
  step: 'Этап 3 из 5',
  focusTitle: 'Собери внимание',
  instruction:
    'Посмотри на себя и одним предложением назови, на чём сегодня будет твой главный фокус.',
  question: 'Что я начинаю первым — и почему это важно сегодня?',
  privacy:
    'Ответ не нужно записывать. Достаточно произнести его вслух или сформулировать про себя.',
  complete: 'Завершить настрой',
  pending: 'Завершаем…',
  transition: 'После завершения текущим станет этап «Главное действие».',
  successEyebrow: 'НАСТРОЙ ЗАВЕРШЁН',
  successTitle: 'Фокус определён',
  successBody: 'Главное действие стало текущим этапом утра.',
  errorTitle: 'Не удалось сохранить завершение.',
  errorBody: 'Проверь соединение и повтори действие.',
  retry: 'Повторить',
  historical: 'Исторический день доступен только для просмотра',
} as const;

export type MorningMirrorViewState = 'current' | 'pending' | 'success' | 'error' | 'readonly';

export interface MorningMirrorPageProps {
  readonly stages: MorningCenterOverview['stages'];
  readonly estimatedMinutes: number;
  readonly completedAt: Date | null;
  readonly state: MorningMirrorViewState;
  readonly onBack: () => void;
  readonly onComplete: () => void;
  readonly onRetry: () => void;
}

export function MorningMirrorPage(props: MorningMirrorPageProps) {
  const pending = props.state === 'pending';
  return (
    <section
      className={`morning-mirror morning-mirror-${props.state}`}
      aria-busy={pending}
      data-mirror-state={props.state}
    >
      <div className="morning-mirror-atmosphere" aria-hidden="true" />
      <button
        className="morning-back-button morning-mirror-back"
        type="button"
        disabled={pending}
        onClick={props.onBack}
      >
        ← Утренний центр
      </button>

      <header className="morning-mirror-header">
        <div>
          <p className="morning-mirror-eyebrow">{MORNING_MIRROR_COPY.eyebrow}</p>
          <h1 id="morning-mirror-heading" tabIndex={-1}>
            {MORNING_MIRROR_COPY.pageTitle}
          </h1>
          <p>{MORNING_MIRROR_COPY.subtitle}</p>
        </div>
        <span className="morning-mirror-estimate">≈ {props.estimatedMinutes} мин</span>
      </header>

      <ol className="morning-mirror-path" aria-label="Этапы утреннего распорядка">
        {props.stages.map((stage, index) => {
          const copy = MORNING_STAGE_PRESENTATION[stage.id];
          const status = stageStatusText(stage.status, index);
          return (
            <li
              key={stage.id}
              className={`morning-mirror-path-step is-${stage.status}`}
              data-mirror-stage={stage.id}
            >
              <span className="morning-mirror-path-marker" aria-hidden="true">
                {stage.status === MORNING_CENTER_STAGE_STATUS.completed
                  ? '✓'
                  : String(index + 1).padStart(2, '0')}
              </span>
              <span className="morning-mirror-path-copy">
                <strong>{copy.title}</strong>
                <span>{status}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <article className="morning-mirror-focus-surface">
        {props.state === 'success' ? (
          <SuccessState />
        ) : props.state === 'readonly' ? (
          <ReadOnlyState completedAt={props.completedAt} />
        ) : (
          <PracticeState
            state={props.state}
            onComplete={props.onComplete}
            onRetry={props.onRetry}
          />
        )}
      </article>
    </section>
  );
}

function PracticeState(props: {
  readonly state: 'current' | 'pending' | 'error';
  readonly onComplete: () => void;
  readonly onRetry: () => void;
}) {
  const pending = props.state === 'pending';
  return (
    <div className="morning-mirror-practice">
      <span className="morning-mirror-focus-icon" aria-hidden="true">
        <AppIcon name="focus" />
      </span>
      <p className="morning-mirror-step">{MORNING_MIRROR_COPY.step}</p>
      <h2>{MORNING_MIRROR_COPY.focusTitle}</h2>
      <p className="morning-mirror-instruction">{MORNING_MIRROR_COPY.instruction}</p>
      <div className="morning-mirror-question">
        <span>ВОПРОС ДЛЯ НАСТРОЙКИ</span>
        <strong>{MORNING_MIRROR_COPY.question}</strong>
      </div>
      <p className="morning-mirror-privacy">{MORNING_MIRROR_COPY.privacy}</p>

      {props.state === 'error' ? (
        <div className="morning-mirror-error" role="alert">
          <strong>{MORNING_MIRROR_COPY.errorTitle}</strong>
          <span>{MORNING_MIRROR_COPY.errorBody}</span>
          <button className="primary-button" type="button" onClick={props.onRetry}>
            {MORNING_MIRROR_COPY.retry}
          </button>
        </div>
      ) : (
        <div className="morning-mirror-action" aria-live="polite">
          <button
            className="primary-button"
            type="button"
            disabled={pending}
            onClick={props.onComplete}
          >
            {pending ? MORNING_MIRROR_COPY.pending : MORNING_MIRROR_COPY.complete}
          </button>
        </div>
      )}
      <p className="morning-mirror-transition">{MORNING_MIRROR_COPY.transition}</p>
    </div>
  );
}

function SuccessState() {
  return (
    <div className="morning-mirror-result" aria-live="polite">
      <span className="morning-mirror-result-icon" aria-hidden="true">
        <AppIcon name="completed" />
      </span>
      <p className="morning-mirror-step">{MORNING_MIRROR_COPY.successEyebrow}</p>
      <h2>{MORNING_MIRROR_COPY.successTitle}</h2>
      <p>{MORNING_MIRROR_COPY.successBody}</p>
    </div>
  );
}

function ReadOnlyState(props: { readonly completedAt: Date | null }) {
  return (
    <div className="morning-mirror-result morning-mirror-readonly-result">
      <span className="morning-mirror-result-icon" aria-hidden="true">
        <AppIcon name="completed" />
      </span>
      <p className="morning-mirror-step">НАСТРОЙ ЗАВЕРШЁН</p>
      <h2>Фокус был определён</h2>
      {props.completedAt === null ? null : (
        <p className="morning-mirror-completed-at">
          Завершено в {formatMorningMirrorTime(props.completedAt)}
        </p>
      )}
      <p>Содержание ответа не сохранялось — LifeOS хранит только факт завершения настройки.</p>
      <div className="morning-mirror-readonly-note" role="status">
        <AppIcon name="lock" />
        <span>{MORNING_MIRROR_COPY.historical}</span>
      </div>
    </div>
  );
}

function stageStatusText(
  status: MorningCenterOverview['stages'][number]['status'],
  index: number,
): string {
  if (status === MORNING_CENTER_STAGE_STATUS.completed) return 'Завершён';
  if (status === MORNING_CENTER_STAGE_STATUS.current) return 'Текущий этап';
  return index === 3 ? 'Следующий этап' : 'Позже';
}

export function formatMorningMirrorTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
