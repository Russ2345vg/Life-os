import { VoiceInputCoordinator } from '../../application/voice-input/VoiceInputCoordinator';
import { BrowserSpeechRecognitionProvider } from '../../infrastructure/voice-input/BrowserSpeechRecognitionProvider';
import { TauriSpeechRecognitionProvider } from '../../infrastructure/voice-input/TauriSpeechRecognitionProvider';

export function createVoiceInputRuntime(): VoiceInputCoordinator {
  const native = new TauriSpeechRecognitionProvider();
  const browser = new BrowserSpeechRecognitionProvider();
  return new VoiceInputCoordinator(native.isSupported() ? native : browser);
}
