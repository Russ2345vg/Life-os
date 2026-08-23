import { PROJECT_STATUS, type ProjectStatus } from '../../domain';

export function projectStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case PROJECT_STATUS.active:
      return 'Активный';
    case PROJECT_STATUS.paused:
      return 'Приостановлен';
    case PROJECT_STATUS.completed:
      return 'Завершён';
    case PROJECT_STATUS.archived:
      return 'Архив';
  }
}
