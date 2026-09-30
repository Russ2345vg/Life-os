import type {
  SpeechRecognitionFailure,
  SpeechRecognitionProvider,
  SpeechRecognitionProviderEvent,
  SpeechRecognitionSession,
} from '../ports/SpeechRecognitionProvider';

type OwnedState = { readonly ownerId: string; readonly sessionId: number };
export type VoiceInputState =
  | { readonly status: 'idle' | 'unsupported' }
  | (OwnedState & { readonly status: 'listening'; readonly interimTranscript: string })
  | (OwnedState & { readonly status: 'processing' })
  | (OwnedState & { readonly status: 'success'; readonly transcript: string })
  | (OwnedState & { readonly status: 'error'; readonly failure: SpeechRecognitionFailure });

const IDLE: VoiceInputState = { status: 'idle' };
const UNSUPPORTED: VoiceInputState = { status: 'unsupported' };

export class VoiceInputCoordinator {
  private readonly base: VoiceInputState;
  private state: VoiceInputState;
  private session: SpeechRecognitionSession | null = null;
  private nextSessionId = 0;
  private chunks: string[] = [];
  private disposed = false;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(private readonly provider: SpeechRecognitionProvider) {
    let supported = false;
    try {
      supported = provider.isSupported();
    } catch {
      /* Capability failure is unsupported. */
    }
    this.base = supported ? IDLE : UNSUPPORTED;
    this.state = this.base;
  }

  getSnapshot = (ownerId: string): VoiceInputState =>
    'ownerId' in this.state && this.state.ownerId === ownerId ? this.state : this.base;

  subscribe = (ownerId: string, listener: () => void): (() => void) => {
    const listeners = this.listeners.get(ownerId) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(ownerId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(ownerId);
    };
  };

  start(ownerId: string, language = 'ru-RU'): void {
    if (this.disposed || this.base.status === 'unsupported') return;
    this.finish(this.base, true);
    const sessionId = ++this.nextSessionId;
    this.chunks = [];
    this.publish({ status: 'listening', ownerId, sessionId, interimTranscript: '' });
    try {
      const session = this.provider.start({
        language,
        onEvent: (event) => this.onEvent(sessionId, event),
      });
      if (this.isActive(sessionId)) {
        this.session = session;
      } else {
        this.cleanup(session, true);
      }
    } catch {
      this.onEvent(sessionId, { type: 'error', error: 'unknown' });
    }
  }

  stop(ownerId: string): void {
    const state = this.state;
    if (state.status !== 'listening' || state.ownerId !== ownerId) return;
    this.publish({ status: 'processing', ownerId, sessionId: state.sessionId });
    // A broken platform must not leave an unclickable processing button indefinitely.
    this.deadline = setTimeout(
      () =>
        this.onEvent(state.sessionId, {
          type: 'error',
          error: 'service-unavailable',
        }),
      15_000,
    );
    try {
      this.session?.stop();
    } catch {
      this.onEvent(state.sessionId, { type: 'error', error: 'unknown' });
    }
  }

  cancel(ownerId: string): void {
    if ('ownerId' in this.state && this.state.ownerId === ownerId) this.finish(this.base, true);
  }

  release(ownerId: string): void {
    this.cancel(ownerId);
  }

  reset(ownerId: string, sessionId: number): void {
    if (
      (this.state.status === 'success' || this.state.status === 'error') &&
      this.state.ownerId === ownerId &&
      this.state.sessionId === sessionId
    ) {
      this.finish(this.base, false);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finish(this.base, true);
    this.listeners.clear();
  }

  private isActive(sessionId: number): boolean {
    return (
      !this.disposed &&
      (this.state.status === 'listening' || this.state.status === 'processing') &&
      this.state.sessionId === sessionId
    );
  }

  private onEvent(sessionId: number, event: SpeechRecognitionProviderEvent): void {
    if (!this.isActive(sessionId) || !('ownerId' in this.state)) return;
    const { ownerId } = this.state;
    if (event.type === 'transcript') {
      if (event.isFinal) {
        const text = event.transcript.trim().replace(/\s+/gu, ' ');
        if (text) this.chunks.push(text);
      }
      if (this.state.status === 'listening')
        this.publish({
          ...this.state,
          interimTranscript: event.isFinal ? '' : event.transcript,
        });
    } else if (event.type === 'external-dictation-started') {
      this.finish(this.base, false);
    } else if (event.type === 'error') {
      this.finish({ status: 'error', ownerId, sessionId, failure: event.error }, true);
    } else {
      const transcript = this.chunks.join(' ');
      this.finish(
        transcript
          ? { status: 'success', ownerId, sessionId, transcript }
          : { status: 'error', ownerId, sessionId, failure: 'no-speech' },
        false,
      );
    }
  }

  private finish(next: VoiceInputState, cancel: boolean): void {
    const session = this.session;
    this.session = null;
    clearTimeout(this.deadline);
    this.deadline = undefined;
    this.chunks = [];
    // Invalidate callbacks before calling the platform's cleanup methods.
    this.publish(next);
    if (session) this.cleanup(session, cancel);
  }

  private cleanup(session: SpeechRecognitionSession, cancel: boolean): void {
    try {
      if (cancel) session.cancel();
    } catch {
      /* Continue releasing listeners. */
    }
    try {
      session.dispose();
    } catch {
      /* A faulty adapter cannot escape cleanup. */
    }
  }

  private publish(next: VoiceInputState): void {
    const previousOwner = 'ownerId' in this.state ? this.state.ownerId : undefined;
    this.state = next;
    const nextOwner = 'ownerId' in next ? next.ownerId : undefined;
    for (const ownerId of new Set([previousOwner, nextOwner])) {
      if (ownerId !== undefined) this.listeners.get(ownerId)?.forEach((listener) => listener());
    }
  }
}
