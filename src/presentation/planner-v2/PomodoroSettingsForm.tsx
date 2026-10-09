import { useState } from 'react';
import type { PomodoroSettings } from '../../domain/pomodoro/ActionPomodoroCycle';

export function PomodoroSettingsForm({
  settings,
  onSave,
}: {
  readonly settings: PomodoroSettings;
  readonly onSave: (settings: PomodoroSettings) => boolean;
}) {
  const [focus, setFocus] = useState(String(settings.focusMinutes));
  const [shortBreak, setShortBreak] = useState(String(settings.shortBreakMinutes));
  const [longBreak, setLongBreak] = useState(String(settings.longBreakMinutes));
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="action-pomodoro__settings"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(
          onSave({
            focusMinutes: Number(focus),
            shortBreakMinutes: Number(shortBreak),
            longBreakMinutes: Number(longBreak),
          }),
        );
      }}
    >
      <fieldset>
        <legend>Длительность помодоро</legend>
        <label>
          Фокус, минут
          <input
            type="number"
            min="1"
            max="180"
            step="1"
            required
            value={focus}
            onChange={(event) => {
              setFocus(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          Короткий перерыв, минут
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            required
            value={shortBreak}
            onChange={(event) => {
              setShortBreak(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          Длинный перерыв, минут
          <input
            type="number"
            min="1"
            max="60"
            step="1"
            required
            value={longBreak}
            onChange={(event) => {
              setLongBreak(event.target.value);
              setSaved(false);
            }}
          />
        </label>
      </fieldset>
      <button type="submit">Сохранить настройки</button>
      <small role="status">
        {saved
          ? 'Сохранено. Текущий отсчёт не меняется.'
          : 'Настройки для следующих запусков. Длинный перерыв — после четырёх фокусов.'}
      </small>
    </form>
  );
}
