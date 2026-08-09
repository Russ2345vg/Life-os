import { WALK_TYPE, type WalkType } from '../../domain';

export interface WalkTypePresentation {
  readonly label: string;
  readonly statisticsLabel: string;
  readonly description: string;
}

export const WALK_TYPE_PRESENTATION: Readonly<Record<WalkType, WalkTypePresentation>> = {
  [WALK_TYPE.restorative]: {
    label: 'Восстановительная',
    statisticsLabel: 'Восстановительные',
    description: 'снизить нагрузку и переключиться.',
  },
  [WALK_TYPE.mindful]: {
    label: 'Осознанная',
    statisticsLabel: 'Осознанные',
    description: 'обратить внимание на окружающее и текущее состояние.',
  },
  [WALK_TYPE.reflection]: {
    label: 'Размышление',
    statisticsLabel: 'Размышление',
    description: 'спокойно обдумать один вопрос.',
  },
  [WALK_TYPE.physical]: {
    label: 'Физическая',
    statisticsLabel: 'Физические',
    description: 'прогулка с акцентом на движение.',
  },
  [WALK_TYPE.phoneFree]: {
    label: 'Без телефона',
    statisticsLabel: 'Без телефона',
    description: 'прогулка без использования телефона.',
  },
};

export const WALK_TYPE_OPTIONS: readonly WalkType[] = Object.values(WALK_TYPE);

export function formatStatisticsDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes.toString().padStart(2, '0')} мин`;
}
