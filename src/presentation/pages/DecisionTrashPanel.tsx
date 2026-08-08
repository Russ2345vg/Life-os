import type { Decision } from '../../domain';
import { decisionKindLabel, decisionStatusLabel, statusTone } from '../entityPresentation';

interface DecisionTrashPanelProps {
  readonly decisions: readonly Decision[];
  readonly restoringDecisionId: string | null;
  readonly error: string | null;
  readonly onOpenDecision: (decision: Decision) => void;
  readonly onRestoreDecision: (decision: Decision) => void;
  readonly onRetry: () => void;
}

export function DecisionTrashPanel({
  decisions,
  restoringDecisionId,
  error,
  onOpenDecision,
  onRestoreDecision,
  onRetry,
}: DecisionTrashPanelProps) {
  return (
    <section className="decision-trash" aria-labelledby="decision-trash-title">
      <div className="section-list-heading">
        <div>
          <p className="section-page-eyebrow">Мягкое удаление</p>
          <h2 id="decision-trash-title">Корзина решений</h2>
        </div>
        <span>{decisions.length}</span>
      </div>

      <p className="decision-trash-note">
        Решения хранятся вместе со связанными действиями, рабочими сессиями и результатами.
      </p>

      {error === null ? null : (
        <div className="section-page-message section-page-error" role="alert">
          <p>{error}</p>
          <button className="secondary-button" type="button" onClick={onRetry}>
            Обновить корзину
          </button>
        </div>
      )}

      {decisions.length === 0 ? (
        <p className="section-page-message" role="status">
          Корзина пуста
        </p>
      ) : (
        <div className="section-card-grid decision-trash-grid">
          {decisions.map((decision) => {
            const id = decision.id.toString();
            const restoring = restoringDecisionId === id;

            return (
              <article className="section-entity-card decision-trash-card" key={id}>
                <button
                  className="decision-trash-open"
                  type="button"
                  onClick={() => onOpenDecision(decision)}
                >
                  <div className="section-card-meta">
                    <span>{decisionKindLabel(decision.kind)}</span>
                    <span>{formatPlannedDate(decision)}</span>
                  </div>
                  <h3>{decision.title.toString()}</h3>
                  <p>{decision.expectedResult?.toString() ?? 'Ожидаемый результат не указан'}</p>
                  <div className="section-card-footer">
                    <span
                      className={`section-status section-status-${statusTone(decision.status)}`}
                    >
                      {decisionStatusLabel(decision.status)}
                    </span>
                    <span>{formatDeletedAt(decision)}</span>
                  </div>
                </button>
                <div className="decision-trash-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={restoring}
                    onClick={() => onRestoreDecision(decision)}
                  >
                    {restoring ? 'Восстанавливаем…' : 'Восстановить'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface DecisionDeleteConfirmationProps {
  readonly decision: Decision;
  readonly deleting: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DecisionDeleteConfirmation({
  decision,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DecisionDeleteConfirmationProps) {
  return (
    <div className="decision-delete-backdrop" role="presentation">
      <section
        className="decision-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-delete-title"
      >
        <p className="section-page-eyebrow">Мягкое удаление</p>
        <h2 id="decision-delete-title">Переместить решение в корзину?</h2>
        <p>
          «{decision.title.toString()}» исчезнет из рабочих экранов. Связанные завершённые действия,
          сессии и результаты останутся без изменений.
        </p>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary-button" type="button" disabled={deleting} onClick={onCancel}>
            Отмена
          </button>
          <button className="danger-button" type="button" disabled={deleting} onClick={onConfirm}>
            {deleting ? 'Перемещаем…' : 'Переместить в корзину'}
          </button>
        </div>
      </section>
    </div>
  );
}

function formatDeletedAt(decision: Decision): string {
  if (decision.deletedAt === null) {
    return 'Дата удаления не указана';
  }

  return `Удалено ${new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(decision.deletedAt)}`;
}

function formatPlannedDate(decision: Decision): string {
  return decision.plannedDate?.toString() ?? 'Без даты';
}
