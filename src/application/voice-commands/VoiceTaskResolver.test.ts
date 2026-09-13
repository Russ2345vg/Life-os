import { expect, it } from 'vitest';
import { matchesVoiceQuery } from './VoiceTaskResolver';

it.each([
  ['Встреча с врачом', 'встречу', true],
  ['Встреча с коллегой', 'встречу', true],
  ['купить продукты', 'купить продукты', true],
  ['позвонить в банк', 'банк', true],
  ['Забрать документы', 'банк', false],
  ['позвонить в банкомат', 'банк', false],
  ['купить продукты', '', false],
  ['Купить ёлку', 'елку', true],
])('matches %s against %s conservatively', (title, query, expected) =>
  expect(matchesVoiceQuery(title, query)).toBe(expected),
);
