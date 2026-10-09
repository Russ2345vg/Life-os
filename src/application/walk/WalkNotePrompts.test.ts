import { describe, expect, it } from 'vitest';
import { MAX_WALK_CAPTURE_LENGTH } from '../../domain/walk-capture/WalkCapture';
import { appendWalkNoteQuestion, WALK_NOTE_TOPICS } from './WalkNotePrompts';

describe('walk note questions', () => {
  it('offers distinct, short questions with room for an answer in every topic', () => {
    expect(new Set(WALK_NOTE_TOPICS.map((topic) => topic.id)).size).toBe(WALK_NOTE_TOPICS.length);
    for (const topic of WALK_NOTE_TOPICS) {
      expect(topic.questions.length).toBeGreaterThanOrEqual(5);
      expect(new Set(topic.questions).size).toBe(topic.questions.length);
      for (const question of topic.questions) {
        expect(question).toMatch(/\?$/);
        expect(question.length).toBeLessThan(MAX_WALK_CAPTURE_LENGTH / 3);
      }
    }
  });

  it('appends a question without overwriting the existing draft or its whitespace', () => {
    expect(appendWalkNoteQuestion('Моя мысль  ', 'Что я заметил?')).toEqual({
      status: 'added',
      text: 'Моя мысль  \n\nЧто я заметил?\n',
    });
    expect(appendWalkNoteQuestion('', 'Что я заметил?').text).toBe('Что я заметил?\n');
  });

  it('prevents a duplicate question while keeping the answer intact', () => {
    const draft = 'Что я заметил?\nСтало спокойнее';
    expect(appendWalkNoteQuestion(draft, 'Что я заметил?')).toEqual({
      status: 'alreadyAdded',
      text: draft,
    });
    expect(
      appendWalkNoteQuestion('Что я заметил? — интересный вопрос', 'Что я заметил?').status,
    ).toBe('added');
  });

  it('accepts the limit exactly and rejects overflow without truncating the draft', () => {
    const question = 'Что дальше?';
    const draft = 'я'.repeat(MAX_WALK_CAPTURE_LENGTH - question.length - 3);
    expect(appendWalkNoteQuestion(draft, question).text).toHaveLength(MAX_WALK_CAPTURE_LENGTH);
    const tooLong = draft + 'я';
    expect(appendWalkNoteQuestion(tooLong, question)).toEqual({ status: 'tooLong', text: tooLong });
  });
});
