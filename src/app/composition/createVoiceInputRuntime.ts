import { VoiceInputCoordinator } from '../../application/voice-input/VoiceInputCoordinator';
import { BrowserSpeechRecognitionProvider } from '../../infrastructure/voice-input/BrowserSpeechRecognitionProvider';

export function createVoiceInputRuntime(): VoiceInputCoordinator {
  return new VoiceInputCoordinator(new BrowserSpeechRecognitionProvider());
}
