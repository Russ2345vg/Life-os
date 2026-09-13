import type { Page } from '@playwright/test';

export async function installSpeech(page: Page, supported = true) {
  await page.addInitScript((enabled) => {
    class SpeechFake {
      static instances: SpeechFake[] = [];
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      stopped = false;
      aborted = false;
      constructor() {
        SpeechFake.instances.push(this);
      }
      start() {}
      stop() {
        this.stopped = true;
      }
      abort() {
        this.aborted = true;
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: enabled ? SpeechFake : undefined,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    Object.assign(window, {
      voiceTest: {
        instances: SpeechFake.instances,
        result(index: number, text: string, final = true) {
          SpeechFake.instances[index]?.onresult?.({
            resultIndex: 0,
            results: [{ 0: { transcript: text }, length: 1, isFinal: final }],
          });
        },
        end(index: number) {
          SpeechFake.instances[index]?.onend?.();
        },
        error(index: number) {
          SpeechFake.instances[index]?.onerror?.({ error: 'not-allowed' });
        },
      },
    });
  }, supported);
}

export type VoiceTest = {
  instances: { lang: string; aborted: boolean; stopped: boolean; onend: (() => void) | null }[];
  result(index: number, text: string, final?: boolean): void;
  end(index: number): void;
  error(index: number): void;
};

export async function speech(
  page: Page,
  action: 'result' | 'end' | 'error',
  index: number,
  text = '',
) {
  await page.evaluate(
    ({ action, index, text }) => {
      const voice = (window as unknown as { voiceTest: VoiceTest }).voiceTest;
      if (action === 'result') voice.result(index, text);
      else voice[action](index);
    },
    { action, index, text },
  );
}
