import { createContext } from 'react';
import type { VoiceInputCoordinator } from '../../application/voice-input/VoiceInputCoordinator';

export const VoiceInputContext = createContext<VoiceInputCoordinator | null>(null);
export const VoiceFieldLabelContext = createContext<string | undefined>(undefined);
