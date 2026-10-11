import type { SleepMorningFeedback } from '../../../domain/sleep/SleepMorningFeedback';

export const sleepQualityChoices = [
  { value: 'GOOD', label: 'Хорошо' },
  { value: 'OK', label: 'Средне' },
  { value: 'POOR', label: 'Плохо' },
] as const;
export const morningEnergyChoices = [
  { value: 'ENERGETIC', label: 'Бодр' },
  { value: 'OK', label: 'Нормально' },
  { value: 'TIRED', label: 'Устал' },
] as const;

export function morningFeedbackLabels(feedback: SleepMorningFeedback | undefined): {
  sleepQuality: string | null;
  energy: string | null;
} {
  return {
    sleepQuality:
      sleepQualityChoices.find((choice) => choice.value === feedback?.sleepQuality)?.label ?? null,
    energy: morningEnergyChoices.find((choice) => choice.value === feedback?.energy)?.label ?? null,
  };
}
