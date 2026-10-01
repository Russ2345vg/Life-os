import {
  DayDate,
  Direction,
  EntityId,
  Goal,
  LifeAction,
  LifeActionTitle,
  Sphere,
} from '../../domain';
import { sphereNameKey } from '../../domain/sphere/Sphere';

export const MAX_PLAN_FILE_BYTES = 1_000_000;
export interface PlanSphere {
  readonly key: string;
  readonly name: string;
}
export interface PlanDirection extends PlanSphere {
  readonly sphereKey: string;
  readonly description: string;
}
export interface PlanGoal {
  readonly key: string;
  readonly directionKey: string;
  readonly title: string;
  readonly dueDate: string;
  readonly outcome: string;
  readonly description: string;
  readonly status: 'active' | 'future';
}
export interface PlanAction {
  readonly key: string;
  readonly goalKey: string;
  readonly title: string;
  readonly date: string | null;
  readonly description: string;
}
export interface PlanFile {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly spheres: readonly PlanSphere[];
  readonly directions: readonly PlanDirection[];
  readonly goals: readonly PlanGoal[];
  readonly actions: readonly PlanAction[];
}
export type PlanKind = 'spheres' | 'directions' | 'goals' | 'actions';
export const planEntityId = (planId: string, kind: PlanKind, key: string): EntityId =>
  EntityId.create(`plan-import:${planId}:${kind}:${key}`);

function record(value: unknown, fields: readonly string[], where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${where}: ожидается объект.`);
  const result = value as Record<string, unknown>;
  const extra = Object.keys(result).find((key) => !fields.includes(key));
  if (extra) throw new Error(`${where}: неизвестное поле «${extra}».`);
  return result;
}
function text(value: unknown, where: string, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()))
    throw new Error(`${where}: заполните текст.`);
  if (value.length > 10_000) throw new Error(`${where}: текст слишком длинный.`);
  return value.trim();
}
function key(value: unknown, where: string): string {
  const result = text(value, where);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(result))
    throw new Error(
      `${where}: нужен стабильный ключ из латинских букв, цифр и дефисов (до 64 символов).`,
    );
  return result;
}
function date(value: unknown, where: string): string {
  try {
    return DayDate.create(text(value, where)).toString();
  } catch {
    throw new Error(`${where}: укажите существующую дату YYYY-MM-DD.`);
  }
}
function rows<T extends { readonly key: string }>(
  value: unknown,
  where: string,
  parse: (value: unknown, where: string) => T,
): T[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error(`${where}: ожидается список до 1000 записей.`);
  const result = value.map((row: unknown, index) => parse(row, `${where}, строка ${index + 1}`));
  if (new Set(result.map((row) => row.key)).size !== result.length)
    throw new Error(`${where}: ключи записей повторяются.`);
  return result;
}

/** Pure preview: validates every entity with the same domain constructors as creation commands. */
export function parsePlanFile(source: string): PlanFile {
  if (new TextEncoder().encode(source).length > MAX_PLAN_FILE_BYTES)
    throw new Error('Файл слишком большой. Максимум — 1 МБ.');
  let json: unknown;
  try {
    json = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Не удалось прочитать JSON. Выберите файл плана LifeOS.');
  }
  const root = record(
    json,
    [
      'format',
      'version',
      'id',
      'title',
      'startDate',
      'endDate',
      'spheres',
      'directions',
      'goals',
      'actions',
    ],
    'План',
  );
  if (root.format !== 'lifeos-plan' || root.version !== 1)
    throw new Error('Нужен файл плана LifeOS версии 1.');
  const plan: PlanFile = {
    id: key(root.id, 'Ключ плана'),
    title: text(root.title, 'Название плана'),
    startDate: date(root.startDate, 'Начало плана'),
    endDate: date(root.endDate, 'Конец плана'),
    spheres: rows(root.spheres, 'Сферы', (value, where) => {
      const row = record(value, ['key', 'name'], where);
      return { key: key(row.key, where), name: text(row.name, where) };
    }),
    directions: rows(root.directions, 'Направления', (value, where) => {
      const row = record(value, ['key', 'sphereKey', 'name', 'description'], where);
      return {
        key: key(row.key, where),
        sphereKey: key(row.sphereKey, where),
        name: text(row.name, where),
        description: text(row.description, where, true),
      };
    }),
    goals: rows(root.goals, 'Цели', (value, where) => {
      const row = record(
        value,
        ['key', 'directionKey', 'title', 'dueDate', 'outcome', 'description', 'status'],
        where,
      );
      if (row.status !== undefined && row.status !== 'active' && row.status !== 'future')
        throw new Error(`${where}: состояние должно быть active или future.`);
      return {
        key: key(row.key, where),
        directionKey: key(row.directionKey, where),
        title: text(row.title, where),
        dueDate: date(row.dueDate, where),
        outcome: text(row.outcome, where, true),
        description: text(row.description, where, true),
        status: row.status ?? 'future',
      };
    }),
    actions: rows(root.actions, 'Действия', (value, where) => {
      const row = record(value, ['key', 'goalKey', 'title', 'date', 'description'], where);
      return {
        key: key(row.key, where),
        goalKey: key(row.goalKey, where),
        title: text(row.title, where),
        date: row.date == null ? null : date(row.date, where),
        description: text(row.description, where, true),
      };
    }),
  };
  if (plan.startDate > plan.endDate) throw new Error('Начало плана должно быть раньше окончания.');
  const all = [...plan.spheres, ...plan.directions, ...plan.goals, ...plan.actions];
  if (all.length > 1000 || !plan.goals.length)
    throw new Error('В плане нужна хотя бы одна цель и не больше 1000 записей всего.');
  if (new Set(plan.spheres.map((row) => sphereNameKey(row.name))).size !== plan.spheres.length)
    throw new Error('Названия сфер повторяются.');
  const now = new Date('2026-01-01T00:00:00Z');
  const id = (kind: PlanKind, value: string) => planEntityId(plan.id, kind, value);
  const inPeriod = (value: string) => {
    if (value < plan.startDate || value > plan.endDate)
      throw new Error(`Дата ${value} выходит за период плана.`);
  };
  for (const sphere of plan.spheres)
    Sphere.create({ id: id('spheres', sphere.key), name: sphere.name, now });
  for (const direction of plan.directions) {
    if (!plan.spheres.some((row) => row.key === direction.sphereKey))
      throw new Error(`Направление «${direction.name}»: сфера не найдена в файле.`);
    Direction.create({
      id: id('directions', direction.key),
      name: direction.name,
      description: direction.description,
      sphereId: id('spheres', direction.sphereKey),
      now,
    });
  }
  for (const goal of plan.goals) {
    if (!plan.directions.some((row) => row.key === goal.directionKey))
      throw new Error(`Цель «${goal.title}»: направление не найдено в файле.`);
    inPeriod(goal.dueDate);
    Goal.create({
      id: id('goals', goal.key),
      directionId: id('directions', goal.directionKey),
      title: goal.title,
      achievementCriteria: goal.outcome,
      description: goal.description,
      dueDate: goal.dueDate,
      status: goal.status,
      now,
    });
  }
  for (const action of plan.actions) {
    const goal = plan.goals.find((row) => row.key === action.goalKey);
    if (!goal) throw new Error(`Действие «${action.title}»: цель не найдена в файле.`);
    if (action.date) {
      inPeriod(action.date);
      if (action.date > goal.dueDate)
        throw new Error(`Действие «${action.title}» запланировано после срока цели.`);
    }
    LifeAction.createDraft({
      id: id('actions', action.key),
      title: LifeActionTitle.create(action.title),
      description: action.description,
      goalId: id('goals', action.goalKey),
      plannedDate: action.date ? DayDate.create(action.date) : null,
      createdAt: now,
      eventId: EntityId.create('preview-event'),
    });
  }
  return plan;
}
