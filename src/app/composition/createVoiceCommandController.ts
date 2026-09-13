import { DayDate, DecisionTitle, DECISION_KIND, EntityId, GOAL_STATUS } from '../../domain';
import { normalizeGoalTitle } from '../../domain/goal/Goal';
import { CommandRegistry } from '../../application/voice-commands/CommandRegistry';
import { RussianCommandInterpreter } from '../../application/voice-commands/RussianCommandInterpreter';
import { VoiceCommandController } from '../../application/voice-commands/VoiceCommandController';
import type { VoiceDestination } from '../../application/voice-commands/CommandSchema';
import { DomainError } from '../../shared/errors/DomainError';
import type { LifeOsApplication } from './LifeOsApplication';
import { CommandClarification } from '../../application/voice-commands/CommandClarification';
import {
  VoiceTaskResolver,
  matchesVoiceQuery,
} from '../../application/voice-commands/VoiceTaskResolver';
import type { CommandTarget } from '../../application/voice-commands/CommandRegistry';

const destinationLabels: Record<VoiceDestination, string> = {
  management: 'Управление',
  spheres: 'Сферы',
  analytics: 'Аналитика',
  settings: 'Настройки',
  tasks: 'Решения',
  today: 'Сегодня',
  goals: 'Цели',
  journal: 'Дневник',
  projects: 'Цели',
  routine: 'Распорядок',
  walks: 'Прогулки',
};

/** All writes keep their existing application owners and journal/sync behavior. */
export function createVoiceCommandController(
  application: Pick<
    LifeOsApplication,
    | 'createDecisionForDate'
    | 'createGoal'
    | 'currentDateProvider'
    | 'decisionRepository'
    | 'getDecisionsForDate'
    | 'getGoals'
    | 'getDecisionById'
    | 'rescheduleDecisionSafely'
    | 'confirmDecisionFromActions'
  >,
  navigate: (destination: VoiceDestination) => void,
  onCreated: () => void = () => {},
): VoiceCommandController {
  const tasks = new VoiceTaskResolver(application.decisionRepository);
  async function checkedTarget(target: CommandTarget | undefined) {
    if (!target) throw new DomainError('voice_command.target_required', 'Сначала выберите задачу.');
    const current = await application.getDecisionById.execute(EntityId.create(target.id));
    if (
      !current.ok ||
      current.value.version !== target.version ||
      current.value.title.toString() !== target.title ||
      current.value.plannedDate?.toString() !== target.date
    )
      throw new DomainError(
        'voice_command.target_changed',
        'Задача изменилась. Разберите команду заново и проверьте новый предпросмотр.',
      );
    return current.value;
  }
  const registry = new CommandRegistry(
    {
      create_task: async (command) => {
        if (command.type !== 'create_task') throw new Error('Invalid task binding');
        const result = await application.createDecisionForDate.execute({
          title: command.payload.title,
          kind: DECISION_KIND.additional,
          plannedDate: DayDate.create(command.payload.date),
          requireExactDate: true,
        });
        if (!result.ok) throw result.error;
        onCreated();
        return {
          message: 'Задача создана',
          created: { type: 'task', id: result.value.id.toString(), date: command.payload.date },
        };
      },
      create_goal: async (command) => {
        if (command.type !== 'create_goal') throw new Error('Invalid goal binding');
        const result = await application.createGoal.execute({ title: command.payload.title });
        if (!result.ok) throw result.error;
        onCreated();
        return {
          message: 'Цель создана',
          created: { type: 'goal', id: result.value.id.toString() },
        };
      },
      navigate: async (command) => {
        if (command.type !== 'navigate') throw new Error('Invalid navigation binding');
        navigate(command.payload.destination);
        return { message: `Открыт раздел «${destinationLabels[command.payload.destination]}»` };
      },
      list_tasks: async (command) => {
        if (command.type !== 'list_tasks') throw new Error('Invalid list binding');
        const rows = (
          await application.getDecisionsForDate.execute(DayDate.create(command.payload.date))
        ).filter((item) => !item.isArchived() && !item.isDeleted());
        return {
          message: `Задачи на ${command.payload.date}: ${rows.length}`,
          items: rows.map((item) => ({
            title: item.title.toString(),
            detail: command.payload.date,
          })),
        };
      },
      list_goals: async (command) => {
        if (command.type !== 'list_goals') throw new Error('Invalid goals binding');
        const rows = await application.getGoals.execute({ status: GOAL_STATUS.active });
        return {
          message: `Активные цели: ${rows.length}`,
          items: rows.map((item) => ({ title: item.title, detail: 'Активная цель' })),
        };
      },
      search: async (command) => {
        if (command.type !== 'search') throw new Error('Invalid search binding');
        const items =
          command.payload.scope === 'tasks'
            ? (await tasks.search(command.payload.query)).map((item) => ({
                title: item.title.toString(),
                detail: item.plannedDate?.toString() ?? 'Без даты',
              }))
            : (await application.getGoals.execute())
                .filter((item) => matchesVoiceQuery(item.title, command.payload.query))
                .map((item) => ({ title: item.title, detail: 'Цель' }));
        return { message: `По запросу «${command.payload.query}» найдено: ${items.length}`, items };
      },
      reschedule_task: async (command, target) => {
        if (command.type !== 'reschedule_task') throw new Error('Invalid reschedule binding');
        const task = await checkedTarget(target);
        const result = await application.rescheduleDecisionSafely.execute({
          decisionId: task.id,
          expectedVersion: target!.version,
          newPlannedDate: command.payload.date,
          reason: command.payload.reason,
        });
        if (!result.ok) throw result.error;
        onCreated();
        return {
          message: 'Задача перенесена',
          created: { type: 'task', id: task.id.toString(), date: command.payload.date },
        };
      },
      complete_task: async (command, target) => {
        if (command.type !== 'complete_task') throw new Error('Invalid completion binding');
        const task = await checkedTarget(target);
        const result = await application.confirmDecisionFromActions.execute({
          decisionId: task.id,
          actualResult: command.payload.actualResult,
        });
        if (!result.ok) throw result.error;
        onCreated();
        return {
          message: 'Задача выполнена',
          created: { type: 'task', id: task.id.toString(), date: target!.date },
        };
      },
    },
    (command) => {
      if (command.type === 'create_goal') {
        if (command.payload.deadline)
          throw new CommandClarification(
            { type: 'create_goal', title: command.payload.title, date: command.payload.deadline },
            'omit_deadline',
            `Точный срок цели ${command.payload.deadline} распознан, но пока не поддерживается. Продолжить без срока?`,
          );
        normalizeGoalTitle(command.payload.title);
      }
      if (command.type === 'create_task' || command.type === 'reschedule_task') {
        const title =
          command.type === 'create_task' ? command.payload.title : command.payload.query;
        DecisionTitle.create(title);
        if (command.payload.time)
          throw new CommandClarification(
            {
              type: command.type,
              title,
              date: command.payload.date,
              time: command.payload.time,
              ...(command.type === 'reschedule_task' ? { reason: command.payload.reason } : {}),
            },
            'omit_time',
            `Время ${command.payload.time} распознано, но задачи пока хранят только дату. Продолжить без времени?`,
          );
        if (
          DayDate.create(command.payload.date).isBefore(
            application.currentDateProvider.getCurrentDate(),
          )
        )
          throw new DomainError(
            'decision.planned_date_in_past',
            'Нельзя создать задачу на прошедшую дату. Укажите сегодня или будущую дату.',
          );
      }
      if (command.type === 'create_note' || command.type === 'create_journal_entry')
        throw new DomainError(
          'voice_command.unavailable',
          'Создание заметок и свободных записей дневника пока не подключено. Можно создать задачу, цель или открыть раздел.',
        );
    },
    async (command) =>
      command.type === 'reschedule_task' || command.type === 'complete_task'
        ? tasks.resolve(command.payload.query)
        : null,
  );
  return new VoiceCommandController(
    new RussianCommandInterpreter(),
    registry,
    application.currentDateProvider,
  );
}
