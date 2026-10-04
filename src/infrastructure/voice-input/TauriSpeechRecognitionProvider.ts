import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  SpeechRecognitionFailure,
  SpeechRecognitionProvider,
  SpeechRecognitionSession,
  SpeechRecognitionStartRequest,
} from '../../application/ports/SpeechRecognitionProvider';

interface NativeVoiceEnvironment {
  readonly tauri: boolean;
  readonly userAgent: string;
}

type NativePlatform = 'android' | 'windows';
type InvokeFunction = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function environment(): NativeVoiceEnvironment {
  return {
    tauri: isTauri() || (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  };
}

export class TauriSpeechRecognitionProvider implements SpeechRecognitionProvider {
  constructor(
    private readonly getEnvironment: () => NativeVoiceEnvironment = environment,
    private readonly invokeFunction: InvokeFunction = invoke,
  ) {}

  isSupported(): boolean {
    try {
      return this.platform() !== null;
    } catch {
      return false;
    }
  }

  start(request: SpeechRecognitionStartRequest): SpeechRecognitionSession {
    let closed = false;
    const close = (): void => {
      closed = true;
    };
    const session: SpeechRecognitionSession = {
      stop: close,
      cancel: close,
      dispose: close,
    };

    queueMicrotask(() => {
      if (closed) return;
      const platform = this.platform();
      const operation =
        platform === 'android'
          ? this.invokeFunction('android_speech_recognize', { language: request.language })
          : platform === 'windows'
            ? this.invokeFunction('windows_voice_typing_start')
            : Promise.reject(new Error('Native speech recognition is unavailable.'));
      void operation
        .then((result) => {
          if (closed) return;
          if (platform === 'windows') {
            request.onEvent({ type: 'external-dictation-started' });
            return;
          }
          const transcript = nativeTranscript(result);
          if (!transcript) {
            request.onEvent({ type: 'error', error: 'no-speech' });
            return;
          }
          request.onEvent({ type: 'transcript', transcript, isFinal: true });
          if (!closed) request.onEvent({ type: 'ended' });
        })
        .catch((error: unknown) => {
          if (!closed) request.onEvent({ type: 'error', error: mapNativeFailure(error) });
        });
    });

    return session;
  }

  private platform(): NativePlatform | null {
    const source = this.getEnvironment();
    if (!source.tauri) return null;
    if (/Android/iu.test(source.userAgent)) return 'android';
    if (/Windows/iu.test(source.userAgent)) return 'windows';
    return null;
  }
}

function nativeTranscript(result: unknown): string {
  if (!result || typeof result !== 'object' || !('transcript' in result)) return '';
  return typeof result.transcript === 'string' ? result.transcript.trim() : '';
}

function mapNativeFailure(error: unknown): SpeechRecognitionFailure {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);
  if (/cancel|abort/iu.test(message)) return 'aborted';
  if (/permission|denied/iu.test(message)) return 'permission-denied';
  if (/microphone|audio capture/iu.test(message)) return 'microphone-unavailable';
  if (/network/iu.test(message)) return 'network';
  if (/no speech|empty/iu.test(message)) return 'no-speech';
  if (/unavailable|not supported|not found/iu.test(message)) return 'service-unavailable';
  return 'unknown';
}
