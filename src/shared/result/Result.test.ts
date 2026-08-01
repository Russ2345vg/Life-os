import { describe, expect, it } from 'vitest';
import { failure, success } from './Result';

describe('Result', () => {
  it('создаёт успешный результат со значением', () => {
    const result = success(42);

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('создаёт неуспешный результат с ошибкой', () => {
    const error = new Error('failure');
    const result = failure(error);

    expect(result).toEqual({ ok: false, error });
  });
});
