import type { WalkCaptureReadModel } from '../../application';
import { WALK_INTENT_PRESENTATION } from './WalkSessionPresentation';
import { WALK_TYPE_PRESENTATION } from './walkPresentation';
import { formatStopwatch } from './WalkTimer';

export function WalkCaptureMetadata({ item }: { readonly item: WalkCaptureReadModel }) {
  const { walk, capture } = item;
  const label =
    walk === null
      ? 'Прогулка недоступна'
      : walk.intent === null
        ? WALK_TYPE_PRESENTATION[walk.type].label
        : WALK_INTENT_PRESENTATION[walk.intent].shortLabel;
  const source = walk?.linkedEntity ?? walk?.returnContext?.entity;
  const context =
    source?.type === 'decision'
      ? `Решение: ${item.contextLabel ?? 'контекст недоступен'}`
      : source?.type === 'routine'
        ? `Распорядок: ${item.contextLabel ?? 'контекст недоступен'}`
        : null;
  return (
    <div className="walk-capture-metadata">
      <time dateTime={capture.capturedAt.toISOString()}>
        {new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(capture.capturedAt)}
      </time>
      <span>
        {label} · +{formatStopwatch(Math.floor(capture.walkElapsedMs / 1000))}
      </span>
      {context === null ? null : <span>{context}</span>}
    </div>
  );
}
