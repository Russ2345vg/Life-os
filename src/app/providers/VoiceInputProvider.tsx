import { useEffect, useRef, useState, type ReactNode } from 'react';
import { VoiceInputContext } from '../../presentation/voice-input/VoiceInputContext';
import { createVoiceInputRuntime } from '../composition/createVoiceInputRuntime';

export function VoiceInputProvider({ children }: { readonly children: ReactNode }) {
  const [runtime] = useState(createVoiceInputRuntime);
  const generation = useRef(0);
  useEffect(() => {
    const lifecycle = generation;
    const current = ++lifecycle.current;
    return () => {
      queueMicrotask(() => {
        if (lifecycle.current === current) runtime.dispose();
      });
    };
  }, [runtime]);
  return <VoiceInputContext.Provider value={runtime}>{children}</VoiceInputContext.Provider>;
}
