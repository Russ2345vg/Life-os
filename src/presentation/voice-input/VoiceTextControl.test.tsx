import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VoiceTextInput } from './VoiceTextInput';
import { VoiceTextArea } from './VoiceTextArea';
import { VoiceInputButton } from './VoiceInputButton';

describe('voice text control rendering', () => {
  it('preserves native validation/description attributes without a runtime', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceTextInput, {
        value: 'Текст',
        onValueChange: () => {},
        id: 'title',
        name: 'title',
        required: true,
        maxLength: 30,
        'aria-describedby': 'hint',
        'aria-invalid': true,
      }),
    );
    expect(html).toContain('value="Текст"');
    expect(html).toContain('aria-describedby="hint"');
    expect(html).toContain('maxLength="30"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('type="button"');
    expect(html).toContain('Голосовой ввод недоступен');
    expect(html).toContain('aria-controls="title"');
  });

  it('opt-out leaves an ordinary editable textarea and supports end actions', () => {
    const html = renderToStaticMarkup(
      createElement(VoiceTextArea, {
        value: 'Заметка',
        onValueChange: () => {},
        voiceInput: false,
        rows: 3,
        endActions: createElement('button', { type: 'button' }, 'Очистить'),
      }),
    );
    expect(html).toContain('rows="3"');
    expect(html).toContain('Заметка</textarea>');
    expect(html).toContain('Очистить');
    expect(html).not.toContain('голосовой');
  });

  it.each(['idle', 'listening', 'processing', 'success', 'error', 'unsupported'] as const)(
    'renders a non-submit accessible %s action',
    (status) => {
      const html = renderToStaticMarkup(
        createElement(VoiceInputButton, { status, onClick: () => {} }),
      );
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-label=');
      expect(html).toContain('data-tooltip=');
      expect(html).toContain(`aria-pressed="${status === 'listening'}"`);
    },
  );
});
