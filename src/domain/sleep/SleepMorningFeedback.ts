export interface SleepMorningFeedback {
  readonly sleepQuality: 'GOOD' | 'OK' | 'POOR' | null;
  readonly energy: 'ENERGETIC' | 'OK' | 'TIRED' | null;
  readonly recordedAt: Date;
}

export interface SleepMorningFeedbackPatch {
  readonly sleepQuality?: Exclude<SleepMorningFeedback['sleepQuality'], null>;
  readonly energy?: Exclude<SleepMorningFeedback['energy'], null>;
}

export function validateSleepMorningFeedback(feedback: SleepMorningFeedback): void {
  if (feedback.sleepQuality !== null && !['GOOD', 'OK', 'POOR'].includes(feedback.sleepQuality))
    throw new TypeError('Выберите качество сна из предложенных вариантов.');
  if (feedback.energy !== null && !['ENERGETIC', 'OK', 'TIRED'].includes(feedback.energy))
    throw new TypeError('Выберите самочувствие из предложенных вариантов.');
  if (feedback.sleepQuality === null && feedback.energy === null)
    throw new TypeError('Выберите хотя бы одну оценку.');
  if (!(feedback.recordedAt instanceof Date) || Number.isNaN(feedback.recordedAt.getTime()))
    throw new TypeError('Время оценки некорректно.');
}
