import type { ConnectionReadRepository, ConnectionPage } from '../ports/ConnectionReadRepository';
import type { GoalRepository } from '../ports/GoalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { DirectionRepository } from '../ports/DirectionRepository';
import type { SphereRepository } from '../ports/SphereRepository';
import type { MemoryDiaryImport } from '../memory/MemoryDiaryImport';
import { EntityId, type Goal, type LifeAction } from '../../domain';
import type {
  ConnectionMemoryRecord,
  ConnectionWalkRecord,
} from '../ports/ConnectionReadRepository';

export type ConnectionSource = {
  readonly kind: 'goal' | 'lifeAction' | 'walk' | 'memory';
  readonly id: string;
};

export type ConnectionDestination =
  | {
      readonly kind: 'sphere' | 'direction' | 'goal' | 'lifeAction' | 'walk' | 'memory';
      readonly id: string;
    }
  | { readonly kind: 'diary'; readonly period: 'day' | 'week' | 'month'; readonly date: string };

export interface ConnectionRow {
  readonly key: string;
  readonly group: 'why' | 'work' | 'experience';
  readonly kind:
    | 'sphere'
    | 'direction'
    | 'goal'
    | 'lifeAction'
    | 'walk'
    | 'memory'
    | 'diary'
    | 'plan'
    | 'routine'
    | 'contribution';
  readonly title: string;
  readonly reason: string;
  readonly availability: 'available' | 'archived' | 'missing' | 'changed';
  readonly target: ConnectionDestination | null;
}

export interface ConnectionOverview {
  readonly title: string;
  readonly rows: readonly ConnectionRow[];
  readonly cursors: Readonly<Partial<Record<'actions' | 'walks' | 'memories', string | null>>>;
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1] ?? ''} ${year}`;
}

function row(
  key: string,
  group: ConnectionRow['group'],
  kind: ConnectionRow['kind'],
  title: string,
  reason: string,
  target: ConnectionDestination | null,
  availability: ConnectionRow['availability'] = 'available',
): ConnectionRow {
  return { key, group, kind, title, reason, target, availability };
}

function actionRows(
  actions: readonly LifeAction[],
  goalId: string,
  cursor?: string,
): ConnectionPage<ConnectionRow> {
  const matches = actions
    .filter(
      (action) =>
        action.deletedAt === null &&
        action.goalId?.toString() === goalId &&
        (cursor === undefined || action.id.toString() > cursor),
    )
    .sort((a, b) => {
      const left = a.id.toString();
      const right = b.id.toString();
      return left < right ? -1 : left > right ? 1 : 0;
    });
  const items = matches
    .slice(0, 30)
    .map((action) =>
      row(
        `action:${action.id}`,
        'work',
        'lifeAction',
        action.title.toString(),
        'Действие относится к цели',
        { kind: 'lifeAction', id: action.id.toString() },
        action.archivedAt ? 'archived' : 'available',
      ),
    );
  return {
    items,
    nextCursor: matches.length > 30 ? matches[29]!.id.toString() : null,
  };
}

function walkRow(walk: ConnectionWalkRecord, sourceKind: 'goal' | 'lifeAction'): ConnectionRow {
  return row(
    `walk:${walk.id}`,
    'experience',
    'walk',
    walk.title,
    sourceKind === 'goal' ? 'Запущена из этой цели' : 'Запущена из этого действия',
    { kind: 'walk', id: walk.id },
  );
}

function memoryRow(memory: ConnectionMemoryRecord): ConnectionRow {
  return row(
    `memory:${memory.id}`,
    'experience',
    'memory',
    memory.title,
    'Цель указана во воспоминании',
    { kind: 'memory', id: memory.id },
  );
}

function actionAvailability(action: LifeAction | null | undefined): ConnectionRow['availability'] {
  if (!action || action.deletedAt) return 'missing';
  return action.archivedAt ? 'archived' : 'available';
}

export class GetConnections {
  public constructor(
    private readonly dependencies: {
      readonly lookup: ConnectionReadRepository;
      readonly goals: Pick<GoalRepository, 'findById'>;
      readonly actions: Pick<LifeActionRepository, 'findById'>;
      readonly directions: Pick<DirectionRepository, 'findById'>;
      readonly spheres: Pick<SphereRepository, 'findById'>;
      readonly diarySource: Pick<MemoryDiaryImport, 'sourceStatus'>;
    },
  ) {}

  public async read(source: ConnectionSource): Promise<ConnectionOverview> {
    const { lookup } = this.dependencies;
    const planning = await lookup.readPlanning();
    if (source.kind === 'goal') {
      const goal = planning.goals.find((item) => item.id.toString() === source.id);
      if (!goal || goal.deletedAt) throw new Error('Цель не найдена.');
      const rows: ConnectionRow[] = [];
      if (goal.directionId)
        rows.push(
          await this.directionRow(
            goal.directionId.toString(),
            null,
            'Цель принадлежит направлению',
          ),
        );
      if (goal.sphereId)
        rows.push(
          await this.sphereRow(
            goal.sphereId.toString(),
            null,
            goal.directionId ? 'Контекст направления' : 'Контекст цели',
          ),
        );
      const actions = actionRows(planning.actions, source.id);
      rows.push(...actions.items);
      for (const link of planning.links.filter(
        (item) => !item.removed && item.goalId === source.id,
      )) {
        const action = planning.actions.find((item) => item.id.toString() === link.sourceId);
        const rule = planning.rules.find((item) => item.id === link.sourceId);
        const title = link.sourceType === 'rule' ? rule?.title : action?.title.toString();
        const availability =
          link.sourceType === 'rule'
            ? rule
              ? 'available'
              : 'missing'
            : actionAvailability(action);
        rows.push(
          row(
            `link:${link.id}`,
            'work',
            'contribution',
            title ?? 'Связанный вклад недоступен',
            'Явная связь с измеряемым прогрессом',
            link.sourceType === 'action' && action && availability !== 'missing'
              ? { kind: 'lifeAction', id: action.id.toString() }
              : null,
            availability,
          ),
        );
      }
      for (const fact of planning.contributions.filter(
        (item) => !item.voided && item.goalId === source.id,
      )) {
        const factAction = fact.actionId
          ? planning.actions.find((item) => item.id.toString() === fact.actionId)
          : null;
        const availability = fact.actionId ? actionAvailability(factAction) : 'available';
        rows.push(
          row(
            `fact:${fact.id}`,
            'work',
            'contribution',
            `Вклад: ${fact.amount ?? 'ожидает уточнения'}`,
            fact.source === 'completion'
              ? 'Подтверждённый вклад в цель'
              : 'Записанный прогресс цели',
            fact.actionId && availability !== 'missing'
              ? { kind: 'lifeAction', id: fact.actionId }
              : null,
            availability,
          ),
        );
      }
      const walks = await lookup.listWalksBySource({ type: 'goal', id: source.id });
      rows.push(...walks.items.map((walk) => walkRow(walk, 'goal')));
      const memories = await lookup.listMemoriesByGoal(source.id);
      rows.push(...memories.items.map(memoryRow));
      return {
        title: goal.title,
        rows,
        cursors: {
          actions: actions.nextCursor,
          walks: walks.nextCursor,
          memories: memories.nextCursor,
        },
      };
    }
    if (source.kind === 'lifeAction') {
      const action = planning.actions.find((item) => item.id.toString() === source.id);
      if (!action || action.deletedAt) throw new Error('Действие не найдено.');
      const rows: ConnectionRow[] = [];
      if (action.goalId)
        rows.push(await this.goalRow(action.goalId.toString(), null, 'Действие относится к цели'));
      else if (action.directionId)
        rows.push(
          await this.directionRow(
            action.directionId.toString(),
            null,
            'Действие относится к направлению',
          ),
        );
      if (action.parentActionId) {
        const parent = planning.actions.find((item) => item.id.equals(action.parentActionId!));
        rows.push(
          row(
            `parent:${action.parentActionId}`,
            'work',
            'lifeAction',
            parent?.title.toString() ?? 'Родительское действие недоступно',
            'Родительское действие',
            parent && !parent.deletedAt ? { kind: 'lifeAction', id: parent.id.toString() } : null,
            actionAvailability(parent),
          ),
        );
      }
      for (const child of planning.actions.filter(
        (item) => !item.deletedAt && item.parentActionId?.toString() === source.id,
      ))
        rows.push(
          row(`child:${child.id}`, 'work', 'lifeAction', child.title.toString(), 'Поддействие', {
            kind: 'lifeAction',
            id: child.id.toString(),
          }),
        );
      if (action.plannedDate)
        rows.push(
          row(
            `plan:${source.id}`,
            'work',
            'plan',
            dateLabel(action.plannedDate.toString()),
            'Запланировано на этот день',
            null,
          ),
        );
      for (const link of planning.links.filter(
        (item) => !item.removed && item.sourceType === 'action' && item.sourceId === source.id,
      ))
        rows.push(
          await this.goalRow(
            link.goalId,
            null,
            'Явная связь с измеряемым прогрессом',
            'contribution',
          ),
        );
      for (const fact of planning.contributions.filter(
        (item) => !item.voided && item.actionId === source.id,
      )) {
        const goalLink = await this.goalRow(
          fact.goalId,
          null,
          'Подтверждённый вклад в цель',
          'contribution',
        );
        rows.push({
          ...goalLink,
          key: `fact:${fact.id}`,
          group: 'work',
          title: `Вклад: ${fact.amount ?? 'ожидает уточнения'}`,
        });
      }
      const routine = await lookup.listRoutineAssignments(source.id, action.occurrence?.ruleId);
      for (const block of routine)
        rows.push(
          row(
            `routine:${block.id}`,
            'work',
            'routine',
            block.title,
            'Действие назначено в распорядок',
            null,
          ),
        );
      const walks = await lookup.listWalksBySource({ type: 'lifeAction', id: source.id });
      rows.push(...walks.items.map((walk) => walkRow(walk, 'lifeAction')));
      return { title: action.title.toString(), rows, cursors: { walks: walks.nextCursor } };
    }
    if (source.kind === 'walk') {
      const walk = await lookup.getWalk(source.id);
      if (!walk || walk.deletedAt) throw new Error('Прогулка не найдена.');
      const rows: ConnectionRow[] = [];
      if (walk.linkedEntity?.type === 'goal')
        rows.push(await this.goalRow(walk.linkedEntity.id, null, 'Источник прогулки'));
      else if (walk.linkedEntity?.type === 'lifeAction')
        rows.push(await this.actionRow(walk.linkedEntity.id, 'Источник прогулки'));
      else if (walk.linkedEntity?.type === 'routine')
        rows.push(
          row(
            `routine:${walk.linkedEntity.id}`,
            'why',
            'routine',
            'Распорядок',
            'Сохранённый источник прогулки',
            null,
          ),
        );
      if (walk.sphereId) rows.push(await this.sphereRow(walk.sphereId, null, 'Сфера прогулки'));
      return { title: walk.title, rows, cursors: {} };
    }
    const memory = await lookup.getMemory(source.id);
    if (!memory || memory.deletedAt) throw new Error('Воспоминание не найдено.');
    const rows: ConnectionRow[] = [];
    if (memory.context?.goalId)
      rows.push(
        await this.goalRow(
          memory.context.goalId,
          memory.context.goalTitle,
          'Цель указана во воспоминании',
        ),
      );
    if (memory.context?.directionId)
      rows.push(
        await this.directionRow(
          memory.context.directionId,
          memory.context.directionTitle,
          'Направление указано во воспоминании',
        ),
      );
    if (memory.context?.sphereId)
      rows.push(
        await this.sphereRow(
          memory.context.sphereId,
          memory.context.sphereTitle,
          'Сфера указана во воспоминании',
        ),
      );
    if (memory.diarySource) {
      const status = await this.dependencies.diarySource.sourceStatus(memory.diarySource);
      rows.push(
        row(
          `diary:${memory.diarySource.entryId}`,
          'experience',
          'diary',
          `Дневник · ${dateLabel(memory.diarySource.periodStart)}`,
          'Источник воспоминания',
          status === 'missing'
            ? null
            : {
                kind: 'diary',
                period: memory.diarySource.kind,
                date: memory.diarySource.periodStart,
              },
          status,
        ),
      );
    }
    return { title: memory.title, rows, cursors: {} };
  }

  public async more(
    source: ConnectionSource,
    collection: 'actions' | 'walks' | 'memories',
    cursor: string,
  ): Promise<ConnectionPage<ConnectionRow>> {
    const { lookup } = this.dependencies;
    if (source.kind === 'goal' && collection === 'actions') {
      const planning = await lookup.readPlanning();
      return actionRows(planning.actions, source.id, cursor);
    }
    if ((source.kind === 'goal' || source.kind === 'lifeAction') && collection === 'walks') {
      const walks = await lookup.listWalksBySource(
        { type: source.kind === 'goal' ? 'goal' : 'lifeAction', id: source.id },
        cursor,
      );
      return {
        items: walks.items.map((walk) =>
          walkRow(walk, source.kind === 'goal' ? 'goal' : 'lifeAction'),
        ),
        nextCursor: walks.nextCursor,
      };
    }
    if (source.kind === 'goal' && collection === 'memories') {
      const memories = await lookup.listMemoriesByGoal(source.id, cursor);
      return { items: memories.items.map(memoryRow), nextCursor: memories.nextCursor };
    }
    return { items: [], nextCursor: null };
  }

  private async goalRow(
    id: string,
    fallback: string | null,
    reason: string,
    kind: 'goal' | 'contribution' = 'goal',
  ): Promise<ConnectionRow> {
    const goal: Goal | null = await this.dependencies.goals.findById(EntityId.create(id));
    const available = goal !== null && goal.deletedAt === null;
    return row(
      `goal:${id}:${kind}`,
      'why',
      kind,
      goal?.title ?? fallback ?? 'Цель недоступна',
      reason,
      available ? { kind: 'goal', id } : null,
      !available ? 'missing' : goal.status === 'archived' ? 'archived' : 'available',
    );
  }

  private async actionRow(id: string, reason: string): Promise<ConnectionRow> {
    const action = await this.dependencies.actions.findById(EntityId.create(id));
    const availability = actionAvailability(action);
    return row(
      `action:${id}`,
      'why',
      'lifeAction',
      action?.title.toString() ?? 'Действие недоступно',
      reason,
      availability === 'missing' ? null : { kind: 'lifeAction', id },
      availability,
    );
  }

  private async directionRow(
    id: string,
    fallback: string | null,
    reason: string,
  ): Promise<ConnectionRow> {
    const direction = await this.dependencies.directions.findById(EntityId.create(id));
    return row(
      `direction:${id}`,
      'why',
      'direction',
      direction?.name ?? fallback ?? 'Направление недоступно',
      reason,
      direction ? { kind: 'direction', id } : null,
      !direction ? 'missing' : direction.status === 'archived' ? 'archived' : 'available',
    );
  }

  private async sphereRow(
    id: string,
    fallback: string | null,
    reason: string,
  ): Promise<ConnectionRow> {
    const sphere = await this.dependencies.spheres.findById(EntityId.create(id));
    return row(
      `sphere:${id}`,
      'why',
      'sphere',
      sphere?.name ?? fallback ?? 'Сфера недоступна',
      reason,
      sphere ? { kind: 'sphere', id } : null,
      !sphere ? 'missing' : sphere.status === 'archived' ? 'archived' : 'available',
    );
  }
}
