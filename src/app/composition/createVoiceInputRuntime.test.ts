import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { BrowserRecognition } from '../../infrastructure/voice-input/BrowserSpeechRecognitionProvider';
import { createVoiceInputRuntime } from './createVoiceInputRuntime';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

class NetworkOnlyRecognition implements BrowserRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: BrowserRecognition['onresult'] = null;
  onerror: BrowserRecognition['onerror'] = null;
  onend: BrowserRecognition['onend'] = null;

  start(): void {
    this.onerror?.({ error: 'network' });
  }
  stop(): void {}
  abort(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createVoiceInputRuntime', () => {
  it('uses Windows dictation in Tauri even when WebView exposes failing browser recognition', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.stubGlobal('window', { SpeechRecognition: NetworkOnlyRecognition });

    const voice = createVoiceInputRuntime();
    voice.start('field');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('windows_voice_typing_start'));

    expect(voice.getSnapshot('field')).toEqual({ status: 'idle' });
    voice.dispose();
  });

  it('uses Windows dictation when the Tauri bridge exists but isTauri reports false', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      SpeechRecognition: NetworkOnlyRecognition,
    });

    const voice = createVoiceInputRuntime();
    voice.start('field');
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('windows_voice_typing_start'));

    expect(voice.getSnapshot('field')).toEqual({ status: 'idle' });
    voice.dispose();
  });

  it('keeps browser recognition when the Tauri bridge is absent', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.stubGlobal('window', { SpeechRecognition: NetworkOnlyRecognition });

    const voice = createVoiceInputRuntime();
    voice.start('field');
    await vi.waitFor(() =>
      expect(voice.getSnapshot('field')).toMatchObject({ status: 'error', failure: 'network' }),
    );

    expect(invoke).not.toHaveBeenCalled();
    voice.dispose();
  });
});
