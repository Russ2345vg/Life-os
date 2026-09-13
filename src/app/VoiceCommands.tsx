import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { VoiceCommandController } from '../application/voice-commands/VoiceCommandController';
import type { DayDate } from '../domain';
import type { VoiceDestination } from '../application/voice-commands/CommandSchema';
import type { CommandResult } from '../application/voice-commands/CommandRegistry';
import { AppIcon } from '../presentation/components/AppIcon';
import { VoiceCommandPalette } from '../presentation/voice-commands/VoiceCommandPalette';
import { createVoiceCommandController } from './composition/createVoiceCommandController';
import { useLifeOsApplication } from './providers';

export function VoiceCommands({
  currentDate,
  onNavigate,
  onOpenResult,
  onCreated,
}: {
  readonly currentDate: DayDate;
  readonly onNavigate: (destination: VoiceDestination) => void;
  readonly onCreated: () => void;
  readonly onOpenResult: (created: NonNullable<CommandResult['created']>) => void;
}) {
  const application = useLifeOsApplication();
  const [controller, setController] = useState<VoiceCommandController | null>(null);
  return (
    <>
      <button
        className="voice-command-entry"
        type="button"
        aria-haspopup="dialog"
        aria-label="Голосовые команды"
        title="Голосовые команды"
        onClick={() =>
          setController(createVoiceCommandController(application, onNavigate, onCreated))
        }
      >
        <AppIcon name="microphone" />
        <span>Голосовые команды</span>
      </button>
      {controller
        ? createPortal(
            <VoiceCommandPalette
              controller={controller}
              currentDate={currentDate}
              onClose={() => setController(null)}
              onOpenResult={onOpenResult}
            />,
            document.body,
          )
        : null}
    </>
  );
}
