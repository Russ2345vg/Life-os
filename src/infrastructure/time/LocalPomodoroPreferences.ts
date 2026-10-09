import type { PomodoroPreferences } from '../../application/ports/PomodoroPreferences';
import {
  DEFAULT_POMODORO_SETTINGS,
  validatePomodoroSettings,
  type PomodoroSettings,
} from '../../domain/pomodoro/ActionPomodoroCycle';

const KEY = 'lifeos-pomodoro-settings-v1';
export class LocalPomodoroPreferences implements PomodoroPreferences {
  public constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {}
  public read(): PomodoroSettings {
    try {
      const raw = this.storage?.getItem(KEY);
      return raw
        ? validatePomodoroSettings(JSON.parse(raw) as PomodoroSettings)
        : DEFAULT_POMODORO_SETTINGS;
    } catch {
      return DEFAULT_POMODORO_SETTINGS;
    }
  }
  public save(settings: PomodoroSettings): void {
    if (!this.storage) throw new Error('Не удалось сохранить настройки на этом устройстве.');
    this.storage.setItem(KEY, JSON.stringify(validatePomodoroSettings(settings)));
  }
}
