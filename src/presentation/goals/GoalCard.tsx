import type { MouseEvent, ReactElement } from 'react';
import { AppIcon } from '../components/AppIcon';
import { buildGoalAlbumRoute } from './GoalAlbumNavigation';
import type { GoalCardViewModel } from './goalAlbumPresentation';
import { AttachmentSyncStatus } from '../sync/AttachmentSyncStatus';

export interface GoalCardProps {
  readonly goal: GoalCardViewModel;
  readonly onOpen: (goalId: string) => void;
  readonly variant?: GoalCardVariant;
}

export type GoalCardVariant = 'default' | 'compact';

export function GoalCard({ goal, onOpen, variant = 'default' }: GoalCardProps): ReactElement {
  const route = buildGoalAlbumRoute({ view: 'detail', goalId: goal.id });

  const openGoal = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isUnmodifiedPrimaryClick(event)) return;
    event.preventDefault();
    onOpen(goal.id);
  };

  return (
    <article
      className={
        variant === 'compact' ? 'goal-album-card goal-album-card--compact' : 'goal-album-card'
      }
    >
      <a className="goal-album-card-link" href={route} onClick={openGoal}>
        <GoalCardContent goal={goal} />
      </a>
      <AttachmentSyncStatus
        entityType="goal"
        objectId={goal.id}
        localAvailable={goal.coverImageUrl !== null}
      />
    </article>
  );
}

export function GoalCardPreview({ goal }: { readonly goal: GoalCardViewModel }): ReactElement {
  return (
    <article
      className={
        goal.coverImageUrl === null
          ? 'goal-album-card goal-form-preview-card goal-form-preview-card--without-cover'
          : 'goal-album-card goal-form-preview-card'
      }
      aria-label="Предпросмотр цели"
    >
      <div className="goal-album-card-link">
        <GoalCardContent goal={goal} />
      </div>
    </article>
  );
}

function GoalCardContent({ goal }: { readonly goal: GoalCardViewModel }): ReactElement {
  const directionLabel =
    goal.direction.kind === 'assigned' ? goal.direction.name : goal.direction.label;
  return (
    <>
      {goal.coverImageUrl === null ? (
        <span className="goal-album-card-cover-placeholder" aria-hidden="true">
          <AppIcon name="goals" />
        </span>
      ) : (
        <img
          className="goal-album-card-cover"
          src={goal.coverImageUrl}
          alt={`Обложка цели ${goal.title}`}
        />
      )}

      <span className="goal-album-card-copy">
        <span className="goal-album-card-direction">{directionLabel}</span>
        <strong className="goal-album-card-title">{goal.title}</strong>

        <span className="goal-album-card-metadata">
          <span>{goal.stageLabel}</span>
          <span>{goal.statusLabel}</span>
          <span>{goal.horizonLabel}</span>
        </span>

        <span className="goal-album-card-progress">
          <span>{goal.progress.label}</span>
          {goal.progress.kind === 'metric' || goal.progress.kind === 'milestones' ? (
            <progress
              max={100}
              value={goal.progress.percent}
              aria-label={`Прогресс цели ${goal.title}`}
            />
          ) : null}
        </span>

        <span className="goal-album-card-next-progress">
          <span>Следующий шаг</span>
          <span>{goal.nextProgress}</span>
        </span>
      </span>
    </>
  );
}

function isUnmodifiedPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
