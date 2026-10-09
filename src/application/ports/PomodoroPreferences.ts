import type { PomodoroSettings } from '../../domain/pomodoro/ActionPomodoroCycle';

export interface PomodoroPreferences {
  read(): PomodoroSettings;
  save(settings: PomodoroSettings): void;
}
