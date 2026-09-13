import type { ButtonHTMLAttributes } from 'react';
import type { VoiceInputState } from '../../application/voice-input/VoiceInputCoordinator';
import { AppIcon } from '../components/AppIcon';

interface VoiceInputButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly status: VoiceInputState['status'];
}

export function VoiceInputButton({ status, disabled, onClick, ...props }: VoiceInputButtonProps) {
  const unavailable = status === 'unsupported';
  const listening = status === 'listening';
  const blocked = disabled || unavailable || status === 'processing';
  const label = unavailable
    ? 'Голосовой ввод недоступен'
    : listening
      ? 'Остановить голосовой ввод'
      : 'Начать голосовой ввод';
  const tooltip = unavailable ? label : listening ? 'Остановить запись' : 'Голосовой ввод';
  return (
    <button
      {...props}
      type="button"
      className="voice-input-button"
      data-voice-state={status}
      title={tooltip}
      data-tooltip={tooltip}
      aria-label={label}
      aria-pressed={listening}
      aria-disabled={Boolean(blocked)}
      disabled={disabled || status === 'processing'}
      onClick={(event) => {
        if (!blocked) onClick?.(event);
      }}
    >
      <AppIcon name={status === 'success' ? 'completed' : 'microphone'} />
    </button>
  );
}
