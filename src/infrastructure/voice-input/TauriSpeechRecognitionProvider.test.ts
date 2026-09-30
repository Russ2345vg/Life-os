import { describe, expect, it, vi } from 'vitest';
import type { SpeechRecognitionProviderEvent } from '../../application/ports/SpeechRecognitionProvider';
import { TauriSpeechRecognitionProvider } from './TauriSpeechRecognitionProvider';

describe('TauriSpeechRecognitionProvider', () => {
  it('returns Android system recognition as a final transcript', async () => {
    const invoke = vi.fn(async () => ({ transcript: 'Голосовая заметка' }));
    const provider = new TauriSpeechRecognitionProvider(
      () => ({ tauri: true, userAgent: 'Android' }),
      invoke,
    );
    const events: SpeechRecognitionProviderEvent[] = [];

    provider.start({ language: 'ru-RU', onEvent: (event) => events.push(event) });
    await vi.waitFor(() => expect(events).toHaveLength(2));

    expect(invoke).toHaveBeenCalledWith('android_speech_recognize', { language: 'ru-RU' });
    expect(events).toEqual([
      { type: 'transcript', transcript: 'Голосовая заметка', isFinal: true },
      { type: 'ended' },
    ]);
  });

  it('opens Windows voice typing and reports external dictation without a false error', async () => {
    const invoke = vi.fn(async () => undefined);
    const provider = new TauriSpeechRecognitionProvider(
      () => ({ tauri: true, userAgent: 'Windows NT 10.0' }),
      invoke,
    );
    const events: SpeechRecognitionProviderEvent[] = [];

    provider.start({ language: 'ru-RU', onEvent: (event) => events.push(event) });
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(invoke).toHaveBeenCalledWith('windows_voice_typing_start');
    expect(events).toEqual([{ type: 'external-dictation-started' }]);
  });

  it('is unavailable outside native Android and Windows and suppresses cancelled results', async () => {
    const invoke = vi.fn(async () => ({ transcript: 'Поздний результат' }));
    const web = new TauriSpeechRecognitionProvider(
      () => ({ tauri: false, userAgent: 'Windows NT 10.0' }),
      invoke,
    );
    const linux = new TauriSpeechRecognitionProvider(
      () => ({ tauri: true, userAgent: 'Linux x86_64' }),
      invoke,
    );
    expect(web.isSupported()).toBe(false);
    expect(linux.isSupported()).toBe(false);

    const android = new TauriSpeechRecognitionProvider(
      () => ({ tauri: true, userAgent: 'Android' }),
      invoke,
    );
    const onEvent = vi.fn();
    const session = android.start({ language: 'ru-RU', onEvent });
    session.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
