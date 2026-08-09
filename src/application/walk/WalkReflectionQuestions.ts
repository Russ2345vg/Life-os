export const WALK_REFLECTION_QUESTIONS = [
  'О чём сейчас стоит спокойно подумать?',
  'Что сегодня было действительно важным?',
  'Что сейчас забирает больше внимания, чем заслуживает?',
  'Какое решение можно упростить?',
  'Что сегодня получилось лучше ожидаемого?',
  'Что можно отпустить?',
  'Какой следующий небольшой шаг имеет смысл?',
  'Что сейчас хочется понять яснее?',
  'За что сегодня можно быть благодарным?',
  'Что стоит заметить вокруг себя прямо сейчас?',
] as const;

export type WalkReflectionQuestionPicker = () => string;

export function pickWalkReflectionQuestion(random: () => number = Math.random): string {
  const index = Math.min(
    WALK_REFLECTION_QUESTIONS.length - 1,
    Math.floor(Math.max(0, random()) * WALK_REFLECTION_QUESTIONS.length),
  );
  return WALK_REFLECTION_QUESTIONS[index]!;
}
