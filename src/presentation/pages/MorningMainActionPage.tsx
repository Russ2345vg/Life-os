import type { MorningMainActionOverview } from '../../application';

export interface MorningMainActionPageProps {
  readonly overview: MorningMainActionOverview;
  readonly mutable: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly selectedCandidateId?: string | null;
  readonly onBack: () => void;
  readonly onCandidateChange: (candidateId: string) => void;
  readonly onSelectCandidate: () => void;
  readonly onSchedule: () => void;
  readonly onSkip: () => void;
}

export function MorningMainActionPage(props: MorningMainActionPageProps) {
  const hasFirstStep = props.overview.firstStepId !== null;
  return (
    <section className="morning-main-action" aria-busy={props.busy}>
      <button className="morning-back-button" type="button" onClick={props.onBack}>
        ← Утренний центр
      </button>

      <header className="morning-main-action-header">
        <p className="morning-center-eyebrow">Распорядок · Утро</p>
        <h1 className="morning-main-action-title" id="morning-main-action-heading" tabIndex={-1}>
          Главное действие
        </h1>
        <p>Проверь четыре опоры перед переходом к работе.</p>
      </header>

      {props.error === null ? null : (
        <p className="morning-center-message error" role="alert">
          {props.error}
        </p>
      )}

      <div className="morning-main-action-grid" aria-label="Проверка главного действия">
        <MainActionFact
          label="Что делаю"
          value={props.overview.decisionTitle ?? 'Главное действие пока не определено'}
          ready={props.overview.decisionTitle !== null}
        />
        <MainActionFact
          label="Ожидаемый результат"
          value={props.overview.expectedResult ?? 'Ожидаемый результат пока не определён'}
          ready={props.overview.expectedResult !== null}
        />
        <MainActionFact
          label="Время"
          value={
            props.overview.completed
              ? 'Действие уже завершено'
              : (props.overview.scheduledTime ?? 'Время ещё не запланировано')
          }
          ready={props.overview.completed || props.overview.scheduledTime !== null}
        />
        <MainActionFact
          label="Первый шаг"
          value={props.overview.firstStepTitle ?? 'Выберите первый шаг'}
          ready={hasFirstStep}
        />
      </div>

      {hasFirstStep || props.overview.candidates.length === 0 ? null : (
        <fieldset
          className="morning-main-action-candidates"
          disabled={!props.mutable || props.busy}
        >
          <legend>Кандидаты первого шага</legend>
          {props.overview.candidates.map((candidate) => {
            const id = candidate.id.toString();
            return (
              <label key={id}>
                <input
                  type="radio"
                  name="morning-main-action-candidate"
                  value={id}
                  checked={props.selectedCandidateId === id}
                  onChange={() => props.onCandidateChange(id)}
                />
                <span>
                  <strong>{candidate.title}</strong>
                  {candidate.expectedResult === null ? null : (
                    <small>{candidate.expectedResult}</small>
                  )}
                </span>
              </label>
            );
          })}
          <button
            className="primary-button"
            type="button"
            disabled={props.selectedCandidateId == null || props.busy}
            onClick={props.onSelectCandidate}
          >
            {props.busy ? 'Сохраняем…' : 'Назначить первым шагом'}
          </button>
        </fieldset>
      )}

      {hasFirstStep && !props.overview.completed && props.overview.scheduledTime === null ? (
        <div className="morning-main-action-schedule">
          <p>Для первого шага нужен конкретный рабочий интервал.</p>
          <button
            className="primary-button"
            type="button"
            disabled={!props.mutable || props.busy}
            onClick={props.onSchedule}
          >
            Запланировать время
          </button>
        </div>
      ) : null}

      {props.overview.ready ? (
        <p className="morning-main-action-ready" role="status">
          Готово к переходу в рабочий блок
        </p>
      ) : null}

      {!props.overview.ready && props.mutable ? (
        <div className="morning-main-action-skip">
          <p>Если сегодня главное действие не нужно, зафиксируйте это явно.</p>
          <button
            className="secondary-button"
            type="button"
            disabled={props.busy}
            onClick={props.onSkip}
          >
            Сегодня без главного действия
          </button>
        </div>
      ) : null}
    </section>
  );
}

function MainActionFact(props: {
  readonly label: string;
  readonly value: string;
  readonly ready: boolean;
}) {
  return (
    <article
      className={props.ready ? 'morning-main-action-fact is-ready' : 'morning-main-action-fact'}
    >
      <span className="morning-main-action-fact-label">{props.label}</span>
      <strong className="morning-main-action-fact-value">{props.value}</strong>
    </article>
  );
}
