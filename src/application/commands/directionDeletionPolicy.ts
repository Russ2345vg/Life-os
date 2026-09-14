import type { PilotEntityType } from '../sync/pilot/PilotSyncProtocol';
import type { DirectionDependency } from '../ports/DirectionDeletionRepository';

export function directionDependency(
  entityType: PilotEntityType,
  record: Readonly<Record<string, unknown>>,
  today: string,
): DirectionDependency {
  const objectId = String(record.id ?? '');
  const label =
    typeof record.title === 'string' && record.title
      ? record.title
      : typeof record.name === 'string' && record.name
        ? record.name
        : objectId;
  let historical = false;
  switch (entityType) {
    case 'goal':
      historical = record.status === 'achieved' || record.status === 'archived';
      break;
    case 'project':
      historical = record.status === 'completed' || record.status === 'archived';
      break;
    case 'direction_indicator':
      historical = record.removed === true;
      break;
    case 'day':
      historical = typeof record.date === 'string' && record.date < today;
      break;
    case 'tomorrow_plan':
      historical = typeof record.targetDateKey === 'string' && record.targetDateKey < today;
      break;
  }
  return { entityType, objectId, label, relation: historical ? 'historical' : 'live' };
}
