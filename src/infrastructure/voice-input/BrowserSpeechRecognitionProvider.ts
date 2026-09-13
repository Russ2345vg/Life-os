import type {
  SpeechRecognitionFailure,
  SpeechRecognitionProvider,
  SpeechRecognitionProviderEvent,
  SpeechRecognitionSession,
  SpeechRecognitionStartRequest,
} from '../../application/ports/SpeechRecognitionProvider';

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}
interface RecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}

/** Browser-only structural types: never exported through the application port. */
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionEnvironment {
  readonly SpeechRecognition?: new () => BrowserRecognition;
  readonly webkitSpeechRecognition?: new () => BrowserRecognition;
}

function environment(): RecognitionEnvironment {
  return typeof window === 'undefined' ? {} : (window as unknown as RecognitionEnvironment);
}

export class BrowserSpeechRecognitionProvider implements SpeechRecognitionProvider {
  constructor(private readonly getEnvironment: () => RecognitionEnvironment = environment) {}

  isSupported(): boolean {
    try {
      return this.constructorForEnvironment() !== undefined;
    } catch {
      return false;
    }
  }

  start(request: SpeechRecognitionStartRequest): SpeechRecognitionSession {
    let engine: BrowserRecognition | undefined;
    let closed = false;
    let starting = true;
    const finalIndices = new Set<number>();
    const emit = (event: SpeechRecognitionProviderEvent): void => {
      if (starting)
        queueMicrotask(() => {
          if (!closed) request.onEvent(event);
        });
      else if (!closed) request.onEvent(event);
    };
    const close = (abort: boolean): void => {
      if (closed) return;
      closed = true;
      if (engine) {
        engine.onresult = null;
        engine.onerror = null;
        engine.onend = null;
        if (abort) {
          try {
            engine.abort();
          } catch {
            /* Already stopped. */
          }
        }
      }
      finalIndices.clear();
    };
    const fail = (error: SpeechRecognitionFailure): void => {
      if (closed) return;
      if (starting) {
        queueMicrotask(() => fail(error));
        return;
      }
      // Detach before consumer cleanup can call back into this session.
      close(true);
      request.onEvent({ type: 'error', error });
    };
    const session: SpeechRecognitionSession = {
      stop: () => {
        if (closed) return;
        try {
          engine?.stop();
        } catch (error) {
          fail(mapFailure(error));
        }
      },
      cancel: () => close(true),
      dispose: () => close(true),
    };
    try {
      const Constructor = this.constructorForEnvironment();
      if (!Constructor) {
        fail('service-unavailable');
        return session;
      }
      engine = new Constructor();
      engine.lang = request.language;
      engine.continuous = true;
      engine.interimResults = true;
      engine.onresult = (event) => {
        if (closed) return;
        const interim: string[] = [];
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result) continue;
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) {
            if (index >= event.resultIndex && !finalIndices.has(index)) {
              finalIndices.add(index);
              emit({ type: 'transcript', transcript, isFinal: true });
            }
          } else {
            interim.push(transcript);
          }
        }
        emit({ type: 'transcript', transcript: interim.join(' '), isFinal: false });
      };
      engine.onerror = (event) => fail(mapFailure(event.error));
      engine.onend = () => {
        if (closed) return;
        if (starting) {
          queueMicrotask(() => engine?.onend?.());
          return;
        }
        close(false);
        request.onEvent({ type: 'ended' });
      };
      engine.start();
    } catch (error) {
      fail(mapFailure(error));
    } finally {
      starting = false;
    }
    return session;
  }

  private constructorForEnvironment(): (new () => BrowserRecognition) | undefined {
    const source = this.getEnvironment();
    return source.SpeechRecognition ?? source.webkitSpeechRecognition;
  }
}

function mapFailure(error: unknown): SpeechRecognitionFailure {
  const code = typeof error === 'string' ? error : error instanceof Error ? error.name : '';
  switch (code) {
    case 'not-allowed':
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'audio-capture':
    case 'NotFoundError':
    case 'NotReadableError':
      return 'microphone-unavailable';
    case 'no-speech':
      return 'no-speech';
    case 'network':
    case 'NetworkError':
      return 'network';
    case 'service-not-allowed':
    case 'language-not-supported':
    case 'NotSupportedError':
      return 'service-unavailable';
    case 'aborted':
    case 'AbortError':
      return 'aborted';
    default:
      return 'unknown';
  }
}
