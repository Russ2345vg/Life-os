import { describe, expect, it, vi, afterEach } from 'vitest';
import type {
  SpeechRecognitionProvider,
  SpeechRecognitionStartRequest,
} from '../ports/SpeechRecognitionProvider';
import { VoiceInputCoordinator } from './VoiceInputCoordinator';

function setup(supported = true) {
  const requests: SpeechRecognitionStartRequest[] = [];
  const sessions: {
    stop: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const provider: SpeechRecognitionProvider = {
    isSupported: () => supported,
    start: (request) => {
      requests.push(request);
      const session = { stop: vi.fn(), cancel: vi.fn(), dispose: vi.fn() };
      sessions.push(session);
      return session;
    },
  };
  return { coordinator: new VoiceInputCoordinator(provider), requests, sessions, provider };
}

afterEach(() => vi.useRealTimers());

describe('VoiceInputCoordinator', () => {
  it('returns to idle when native system dictation takes over the focused field', () => {
    const { coordinator, requests } = setup();
    coordinator.start('title');

    requests[0]!.onEvent({ type: 'external-dictation-started' });

    expect(coordinator.getSnapshot('title')).toEqual({ status: 'idle' });
  });

  it('buffers final chunks, exposes interim feedback and commits only on end', () => {
    const { coordinator: c, requests, sessions } = setup();
    expect(c.getSnapshot('a').status).toBe('idle');
    c.start('a', 'ru-RU');
    expect(c.getSnapshot('a').status).toBe('listening');
    requests[0]!.onEvent({ type: 'transcript', transcript: 'Черновик', isFinal: false });
    expect(c.getSnapshot('a')).toMatchObject({ interimTranscript: 'Черновик' });
    requests[0]!.onEvent({ type: 'transcript', transcript: ' Это  ', isFinal: true });
    c.stop('a');
    expect(c.getSnapshot('a').status).toBe('processing');
    expect(sessions[0]!.stop).toHaveBeenCalledOnce();
    requests[0]!.onEvent({ type: 'transcript', transcript: 'проверка', isFinal: true });
    requests[0]!.onEvent({ type: 'ended' });
    expect(c.getSnapshot('a')).toMatchObject({ status: 'success', transcript: 'Это проверка' });
    expect(sessions[0]!.dispose).toHaveBeenCalledOnce();
    c.dispose();
  });

  it('cancels previous owner, ignores stale results and only notifies affected fields', () => {
    const { coordinator: c, requests, sessions } = setup();
    const unrelated = vi.fn();
    c.subscribe('c', unrelated);
    c.start('a');
    c.start('b');
    expect(c.getSnapshot('a').status).toBe('idle');
    expect(sessions[0]!.cancel).toHaveBeenCalledOnce();
    requests[0]!.onEvent({ type: 'transcript', transcript: 'wrong', isFinal: true });
    requests[0]!.onEvent({ type: 'ended' });
    requests[1]!.onEvent({ type: 'transcript', transcript: 'right', isFinal: true });
    requests[1]!.onEvent({ type: 'ended' });
    expect(c.getSnapshot('b')).toMatchObject({ status: 'success', transcript: 'right' });
    expect(unrelated).not.toHaveBeenCalled();
    c.dispose();
  });

  it.each([
    'permission-denied',
    'microphone-unavailable',
    'network',
    'service-unavailable',
    'unknown',
    'aborted',
  ] as const)('handles %s without restarting', (error) => {
    const { coordinator: c, requests } = setup();
    c.start('a');
    requests[0]!.onEvent({ type: 'error', error });
    requests[0]!.onEvent({ type: 'ended' });
    expect(c.getSnapshot('a')).toMatchObject({ status: 'error', failure: error });
    expect(requests).toHaveLength(1);
    c.release('a');
    expect(c.getSnapshot('a').status).toBe('idle');
  });

  it('handles unsupported and empty recognition without creating text', () => {
    const unavailable = setup(false);
    unavailable.coordinator.start('a');
    expect(unavailable.coordinator.getSnapshot('a').status).toBe('unsupported');
    expect(unavailable.requests).toHaveLength(0);
    const { coordinator: c, requests } = setup();
    c.start('a');
    requests[0]!.onEvent({ type: 'ended' });
    expect(c.getSnapshot('a')).toMatchObject({ status: 'error', failure: 'no-speech' });
  });

  it('release and disposal cancel once and reject late results', () => {
    const { coordinator: c, requests, sessions } = setup();
    c.start('a');
    c.release('a');
    c.release('a');
    requests[0]!.onEvent({ type: 'ended' });
    expect(c.getSnapshot('a').status).toBe('idle');
    expect(sessions[0]!.cancel).toHaveBeenCalledOnce();
    c.start('b');
    c.dispose();
    c.dispose();
    c.start('a');
    expect(requests).toHaveLength(2);
    expect(sessions[1]!.dispose).toHaveBeenCalledOnce();
  });

  it('guards feedback reset by owner and session', () => {
    const { coordinator: c, requests } = setup();
    c.start('a');
    requests[0]!.onEvent({ type: 'ended' });
    const old = c.getSnapshot('a');
    c.start('a');
    if ('sessionId' in old) c.reset('a', old.sessionId);
    expect(c.getSnapshot('a').status).toBe('listening');
    c.cancel('a');
    expect(c.getSnapshot('a').status).toBe('idle');
  });

  it('contains exceptional provider start and stop', () => {
    const { coordinator: c, provider, sessions } = setup();
    c.start('a');
    sessions[0]!.stop.mockImplementation(() => {
      throw new Error('stop');
    });
    expect(() => c.stop('a')).not.toThrow();
    expect(c.getSnapshot('a').status).toBe('error');
    provider.start = () => {
      throw new Error('start');
    };
    expect(() => c.start('a')).not.toThrow();
    expect(c.getSnapshot('a').status).toBe('error');
  });

  it('bounds processing when a provider never ends', () => {
    vi.useFakeTimers();
    const { coordinator: c, sessions } = setup();
    c.start('a');
    c.stop('a');
    vi.advanceTimersByTime(15_000);
    expect(c.getSnapshot('a')).toMatchObject({ status: 'error', failure: 'service-unavailable' });
    expect(sessions[0]!.cancel).toHaveBeenCalledOnce();
    c.dispose();
  });
});
