import { useCallback, useContext, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { VoiceInputState } from '../../application/voice-input/VoiceInputCoordinator';
import { VoiceInputContext } from './VoiceInputContext';

const UNSUPPORTED: VoiceInputState = { status: 'unsupported' };
const noop = (): void => {};

export function useVoiceInput(onTranscript: (transcript: string) => void, language = 'ru-RU') {
  const coordinator = useContext(VoiceInputContext);
  const ownerId = useId();
  const delivered = useRef<number | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => coordinator?.subscribe(ownerId, listener) ?? noop,
    [coordinator, ownerId],
  );
  const snapshot = useCallback(
    () => coordinator?.getSnapshot(ownerId) ?? UNSUPPORTED,
    [coordinator, ownerId],
  );
  const state = useSyncExternalStore(subscribe, snapshot, () => UNSUPPORTED);

  useEffect(() => () => coordinator?.release(ownerId), [coordinator, ownerId]);
  useEffect(() => {
    if (state.status !== 'success') return;
    if (delivered.current !== state.sessionId) {
      delivered.current = state.sessionId;
      onTranscript(state.transcript);
    }
    const timer = setTimeout(() => coordinator?.reset(ownerId, state.sessionId), 600);
    return () => clearTimeout(timer);
  }, [state, coordinator, ownerId, onTranscript]);

  return {
    state,
    start: () => coordinator?.start(ownerId, language),
    stop: () => coordinator?.stop(ownerId),
    cancel: useCallback(() => coordinator?.cancel(ownerId), [coordinator, ownerId]),
    reset: () => {
      if (state.status === 'success' || state.status === 'error')
        coordinator?.reset(ownerId, state.sessionId);
    },
  };
}
