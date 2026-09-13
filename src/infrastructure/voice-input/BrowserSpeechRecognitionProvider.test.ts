import { describe, expect, it, vi } from 'vitest';
import {
  BrowserSpeechRecognitionProvider,
  type BrowserRecognition,
} from './BrowserSpeechRecognitionProvider';
import type { SpeechRecognitionProviderEvent } from '../../application/ports/SpeechRecognitionProvider';

class Recognition implements BrowserRecognition {
  static instances: Recognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: BrowserRecognition['onresult'] = null;
  onerror: BrowserRecognition['onerror'] = null;
  onend: BrowserRecognition['onend'] = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    Recognition.instances.push(this);
  }
}

describe('BrowserSpeechRecognitionProvider', () => {
  it.each(['SpeechRecognition', 'webkitSpeechRecognition'])(
    'detects %s lazily and sends each final result once',
    (key) => {
      Recognition.instances = [];
      const provider = new BrowserSpeechRecognitionProvider(() => ({ [key]: Recognition }));
      expect(provider.isSupported()).toBe(true);
      expect(Recognition.instances).toHaveLength(0);
      const events: SpeechRecognitionProviderEvent[] = [];
      const session = provider.start({ language: 'ru-RU', onEvent: (event) => events.push(event) });
      const engine = Recognition.instances[0]!;
      expect(engine).toMatchObject({ lang: 'ru-RU', continuous: true, interimResults: true });
      const first = { 0: { transcript: 'Это' }, length: 1, isFinal: true };
      engine.onresult?.({ resultIndex: 0, results: { 0: first, length: 1 } });
      engine.onresult?.({
        resultIndex: 0,
        results: {
          0: first,
          1: { 0: { transcript: 'пров' }, length: 1, isFinal: false },
          length: 2,
        },
      });
      engine.onresult?.({
        resultIndex: 1,
        results: {
          0: first,
          1: { 0: { transcript: 'проверка' }, length: 1, isFinal: true },
          length: 2,
        },
      });
      session.stop();
      expect(engine.stop).toHaveBeenCalledOnce();
      const late = engine.onresult;
      engine.onend?.();
      late?.({ resultIndex: 0, results: { 0: first, length: 1 } });
      expect(events).toEqual([
        { type: 'transcript', transcript: 'Это', isFinal: true },
        { type: 'transcript', transcript: '', isFinal: false },
        { type: 'transcript', transcript: 'пров', isFinal: false },
        { type: 'transcript', transcript: 'проверка', isFinal: true },
        { type: 'transcript', transcript: '', isFinal: false },
        { type: 'ended' },
      ]);
      expect(engine.onresult).toBeNull();
      session.dispose();
    },
  );

  it.each([
    ['not-allowed', 'permission-denied'],
    ['audio-capture', 'microphone-unavailable'],
    ['no-speech', 'no-speech'],
    ['network', 'network'],
    ['aborted', 'aborted'],
    ['service-not-allowed', 'service-unavailable'],
    ['language-not-supported', 'service-unavailable'],
    ['unexpected', 'unknown'],
  ])('maps %s and releases listeners', (code, failure) => {
    const events: SpeechRecognitionProviderEvent[] = [];
    const provider = new BrowserSpeechRecognitionProvider(() => ({
      SpeechRecognition: Recognition,
    }));
    provider.start({ language: 'en-US', onEvent: (event) => events.push(event) });
    const engine = Recognition.instances.at(-1)!;
    engine.onerror?.({ error: code });
    expect(events).toEqual([{ type: 'error', error: failure }]);
    expect(engine.onend).toBeNull();
    expect(engine.abort).toHaveBeenCalledOnce();
  });

  it('cancel/dispose are idempotent and suppress queued callbacks', () => {
    const events = vi.fn();
    const provider = new BrowserSpeechRecognitionProvider(() => ({
      SpeechRecognition: Recognition,
    }));
    const session = provider.start({ language: 'ru-RU', onEvent: events });
    const engine = Recognition.instances.at(-1)!;
    const end = engine.onend;
    session.cancel();
    session.dispose();
    session.cancel();
    end?.();
    expect(engine.abort).toHaveBeenCalledOnce();
    expect(events).not.toHaveBeenCalled();
  });

  it('unsupported and synchronous failures produce deferred typed events', async () => {
    class Denied extends Recognition {
      override start = vi.fn(() => {
        throw new DOMException('denied', 'NotAllowedError');
      });
    }
    const events = vi.fn();
    const provider = new BrowserSpeechRecognitionProvider(() => ({ SpeechRecognition: Denied }));
    expect(() => provider.start({ language: 'ru-RU', onEvent: events })).not.toThrow();
    expect(events).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(events).toHaveBeenCalledWith({ type: 'error', error: 'permission-denied' });
    const unavailable = new BrowserSpeechRecognitionProvider(() => ({}));
    expect(unavailable.isSupported()).toBe(false);
    const pending = vi.fn();
    unavailable.start({ language: 'ru-RU', onEvent: pending }).dispose();
    await Promise.resolve();
    expect(pending).not.toHaveBeenCalled();
  });
});
