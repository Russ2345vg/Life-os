import { describe, expect, it } from 'vitest';
import { insertVoiceTranscript } from './insertVoiceTranscript';

describe('insertVoiceTranscript', () => {
  it.each([
    ['', 'Привет', 0, 0, 'Привет', 6],
    ['мир', 'Привет', 0, 0, 'Привет мир', 7],
    ['Привет', 'мир', 6, 6, 'Привет мир', 10],
    ['Сегодня я пойду домой', 'после работы', 9, 9, 'Сегодня я после работы пойду домой', 22],
    ['Сегодня я пойду домой', 'поеду', 10, 15, 'Сегодня я поеду домой', 15],
    ['Привет!', 'мир', 6, 6, 'Привет мир!', 10],
    ['(мир)', 'весь', 1, 1, '(весь мир)', 6],
    ['abc', 'x', 99, -1, 'x', 1],
    ['abc', '  ', 1, 2, 'abc', 1],
    ['', '  Это\n  проверка  ', null, null, 'Это проверка', 12],
  ])('inserts into %j preserving unselected text', (value, transcript, start, end, next, caret) => {
    expect(insertVoiceTranscript(value, transcript, start, end)).toMatchObject({
      value: next,
      caret,
    });
  });

  it('limits only the new text and reports truncation', () => {
    expect(insertVoiceTranscript('abc', 'defgh', 3, 3, 7)).toEqual({
      value: 'abc def',
      caret: 7,
      limited: true,
    });
    expect(insertVoiceTranscript('abc', 'word', 1, 2, 3)).toEqual({
      value: 'abc',
      caret: 1,
      limited: true,
    });
    expect(insertVoiceTranscript('abc', 'word', 3, 3, 2).value).toBe('abc');
  });

  it('does not split a surrogate pair to satisfy maxLength', () => {
    expect(insertVoiceTranscript('', '😀', 0, 0, 1).value).toBe('');
  });
});
