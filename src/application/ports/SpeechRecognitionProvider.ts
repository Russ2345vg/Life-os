export type SpeechRecognitionFailure =
  | 'permission-denied'
  | 'microphone-unavailable'
  | 'no-speech'
  | 'network'
  | 'service-unavailable'
  | 'aborted'
  | 'unknown';

export type SpeechRecognitionProviderEvent =
  | { readonly type: 'transcript'; readonly transcript: string; readonly isFinal: boolean }
  | { readonly type: 'ended' }
  | { readonly type: 'error'; readonly error: SpeechRecognitionFailure };

export interface SpeechRecognitionStartRequest {
  readonly language: string;
  readonly onEvent: (event: SpeechRecognitionProviderEvent) => void;
}

export interface SpeechRecognitionSession {
  stop(): void;
  cancel(): void;
  dispose(): void;
}

export interface SpeechRecognitionProvider {
  isSupported(): boolean;
  /** Events are delivered after start returns. Final chunks are delivered exactly once. */
  start(request: SpeechRecognitionStartRequest): SpeechRecognitionSession;
}
