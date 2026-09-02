import { describe, expect, it } from 'vitest';
import { RELAXATION_PRACTICE, RelaxationSnapshot, SCREEN_FREE_STATE } from './RelaxationSnapshot';

const CREATED_AT = new Date('2026-08-30T12:00:00.000Z');

describe('RelaxationSnapshot', () => {
  it('создаёт обычный вечер с чтением, 15-минутной практикой и 25 минутами без экранов', () => {
    const snapshot = createSnapshot();

    expect(snapshot.defaultPractice).toBe(RELAXATION_PRACTICE.reading);
    expect(snapshot.selectedPractice).toBe(RELAXATION_PRACTICE.reading);
    expect(snapshot.defaultChangedForFuture).toBe(false);
    expect(snapshot.practiceDurationMinutes).toBe(15);
    expect(snapshot.practiceTimerStartedAt).toBeNull();
    expect(snapshot.practiceCompletedAt).toBeNull();
    expect(snapshot.screenFreeDurationMinutes).toBe(25);
    expect(snapshot.screenFreeState).toBe(SCREEN_FREE_STATE.pending);
    expect(snapshot.readyAt(new Date('2026-08-30T13:00:00.000Z'))).toBe(false);
  });

  it('заменяет практику только на вечер или сохраняет её новым default', () => {
    const currentOnly = createSnapshot();
    expect(currentOnly.choosePractice(RELAXATION_PRACTICE.meditation, false, at('12:01:00'))).toBe(
      true,
    );
    expect(currentOnly.selectedPractice).toBe(RELAXATION_PRACTICE.meditation);
    expect(currentOnly.defaultPractice).toBe(RELAXATION_PRACTICE.reading);
    expect(currentOnly.defaultChangedForFuture).toBe(false);

    const persistent = createSnapshot();
    persistent.choosePractice(RELAXATION_PRACTICE.breathing, true, at('12:01:00'));
    expect(persistent.selectedPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(persistent.defaultPractice).toBe(RELAXATION_PRACTICE.breathing);
    expect(persistent.defaultChangedForFuture).toBe(true);
  });

  it('поддерживает все пять практик и повторный одинаковый выбор идемпотентен', () => {
    const practices = Object.values(RELAXATION_PRACTICE);

    for (const practice of practices) {
      const snapshot = createSnapshot();
      snapshot.choosePractice(practice, false, at('12:01:00'));
      expect(snapshot.selectedPractice).toBe(practice);
      const updatedAt = snapshot.updatedAt;
      expect(snapshot.choosePractice(practice, false, at('12:02:00'))).toBe(false);
      expect(snapshot.updatedAt).toEqual(updatedAt);
    }
  });

  it('при смене практики или длительности сбрасывает только активный таймер практики', () => {
    const snapshot = createSnapshot();
    snapshot.completeDrink(at('12:01:00'));
    snapshot.completeHygiene(at('12:02:00'));
    snapshot.startPracticeTimer(at('12:03:00'));

    snapshot.choosePractice(RELAXATION_PRACTICE.stretching, false, at('12:04:00'));
    expect(snapshot.practiceTimerStartedAt).toBeNull();
    expect(snapshot.drinkCompletedAt).toEqual(at('12:01:00'));
    expect(snapshot.hygieneCompletedAt).toEqual(at('12:02:00'));

    snapshot.startPracticeTimer(at('12:05:00'));
    snapshot.setPracticeDuration(20, at('12:06:00'));
    expect(snapshot.practiceTimerStartedAt).toBeNull();
    expect(snapshot.practiceDurationMinutes).toBe(20);
    expect(snapshot.drinkCompletedAt).toEqual(at('12:01:00'));
  });

  it.each([4, 21, 10.5])('отклоняет недопустимую длительность %s', (minutes) => {
    const snapshot = createSnapshot();

    expect(() => snapshot.setPracticeDuration(minutes, at('12:01:00'))).toThrowError(
      expect.objectContaining({ code: 'relaxation.invalid_practice_duration' }),
    );
  });

  it('выполняет напиток и гигиену в любом порядке и сохраняет первый timestamp', () => {
    const snapshot = createSnapshot();
    snapshot.completeHygiene(at('12:01:00'));
    snapshot.completeDrink(at('12:02:00'));

    expect(snapshot.completeHygiene(at('12:03:00'))).toBe(false);
    expect(snapshot.completeDrink(at('12:04:00'))).toBe(false);
    expect(snapshot.hygieneCompletedAt).toEqual(at('12:01:00'));
    expect(snapshot.drinkCompletedAt).toEqual(at('12:02:00'));
  });

  it('делает таймер практики опциональным и завершает практику только вручную', () => {
    const withoutTimer = createSnapshot();
    withoutTimer.completePractice(at('12:05:00'));
    expect(withoutTimer.practiceTimerStartedAt).toBeNull();
    expect(withoutTimer.practiceCompletedAt).toEqual(at('12:05:00'));

    const timed = createSnapshot();
    expect(timed.startPracticeTimer(at('12:01:00'))).toBe(true);
    expect(timed.startPracticeTimer(at('12:02:00'))).toBe(false);
    expect(timed.practiceTimerStartedAt).toEqual(at('12:01:00'));
    expect(timed.practiceCompletedAt).toBeNull();
    timed.completePractice(at('12:30:00'));
    expect(timed.practiceCompletedAt).toEqual(at('12:30:00'));
  });

  it('запускает 25 минут без экранов и сокращает активное окно до 10 без смены startedAt', () => {
    const snapshot = createSnapshot();
    snapshot.startScreenFree(at('12:04:00'));
    snapshot.shortenScreenFree(at('12:08:00'));

    expect(snapshot.screenFreeState).toBe(SCREEN_FREE_STATE.active);
    expect(snapshot.screenFreeDurationMinutes).toBe(10);
    expect(snapshot.screenFreeStartedAt).toEqual(at('12:04:00'));
    expect(snapshot.screenFreeElapsedAt(at('12:13:59'))).toBe(false);
    expect(snapshot.screenFreeElapsedAt(at('12:14:00'))).toBe(true);
    expect(snapshot.completeElapsedScreenFree(at('12:14:00'))).toBe(true);
    expect(snapshot.screenFreeState).toBe(SCREEN_FREE_STATE.completed);
    expect(snapshot.screenFreeCompletedAt).toEqual(at('12:14:00'));
  });

  it('сохраняет осознанный пропуск без экранов как neutral non-success outcome', () => {
    const snapshot = createSnapshot();
    snapshot.skipScreenFree(at('12:03:00'));

    expect(snapshot.screenFreeState).toBe(SCREEN_FREE_STATE.skipped);
    expect(snapshot.screenFreeSkippedAt).toEqual(at('12:03:00'));
    expect(snapshot.screenFreeCompletedAt).toBeNull();
    expect(snapshot.screenFreeElapsedAt(at('13:00:00'))).toBe(false);
  });

  it('становится ready независимо от порядка после трёх completion и elapsed либо skipped screen-free', () => {
    const elapsed = createSnapshot();
    elapsed.startScreenFree(at('12:00:00'));
    elapsed.completePractice(at('12:01:00'));
    elapsed.completeHygiene(at('12:02:00'));
    elapsed.completeDrink(at('12:03:00'));

    expect(elapsed.readyAt(at('12:24:59'))).toBe(false);
    expect(elapsed.readyAt(at('12:25:00'))).toBe(true);

    const skipped = createSnapshot();
    skipped.completePractice(at('12:01:00'));
    skipped.skipScreenFree(at('12:02:00'));
    skipped.completeDrink(at('12:03:00'));
    skipped.completeHygiene(at('12:04:00'));
    expect(skipped.readyAt(at('12:04:00'))).toBe(true);
  });

  it('после завершения практики запрещает менять её и длительность', () => {
    const snapshot = createSnapshot();
    snapshot.completePractice(at('12:05:00'));

    expect(() =>
      snapshot.choosePractice(RELAXATION_PRACTICE.calmMusic, false, at('12:06:00')),
    ).toThrowError(expect.objectContaining({ code: 'relaxation.practice_completed' }));
    expect(() => snapshot.setPracticeDuration(10, at('12:06:00'))).toThrowError(
      expect.objectContaining({ code: 'relaxation.practice_completed' }),
    );
  });

  it('защищает сохранённые даты от мутации через входы и getters', () => {
    const occurredAt = at('12:01:00');
    const snapshot = createSnapshot();
    snapshot.completeDrink(occurredAt);
    occurredAt.setUTCFullYear(2030);

    const read = snapshot.drinkCompletedAt;
    read?.setUTCFullYear(2040);

    expect(snapshot.drinkCompletedAt).toEqual(at('12:01:00'));
  });

  it('отклоняет несовместимые persisted screen-free состояния', () => {
    const base = persistedData();

    expect(() =>
      RelaxationSnapshot.rehydrate({
        ...base,
        screenFreeState: SCREEN_FREE_STATE.active,
        screenFreeStartedAt: null,
      }),
    ).toThrowError(expect.objectContaining({ code: 'relaxation.invalid_screen_free_state' }));

    expect(() =>
      RelaxationSnapshot.rehydrate({
        ...base,
        screenFreeState: SCREEN_FREE_STATE.skipped,
        screenFreeSkippedAt: null,
      }),
    ).toThrowError(expect.objectContaining({ code: 'relaxation.invalid_screen_free_state' }));

    expect(() =>
      RelaxationSnapshot.rehydrate({
        ...base,
        screenFreeState: SCREEN_FREE_STATE.completed,
        screenFreeCompletedAt: null,
      }),
    ).toThrowError(expect.objectContaining({ code: 'relaxation.invalid_screen_free_state' }));
  });
});

function createSnapshot(): RelaxationSnapshot {
  return RelaxationSnapshot.start({
    defaultPractice: RELAXATION_PRACTICE.reading,
    practiceDurationMinutes: 15,
    screenFreeDurationMinutes: 25,
    occurredAt: CREATED_AT,
  });
}

function persistedData() {
  return {
    defaultPractice: RELAXATION_PRACTICE.reading,
    selectedPractice: RELAXATION_PRACTICE.reading,
    defaultChangedForFuture: false,
    practiceDurationMinutes: 15,
    drinkCompletedAt: null,
    hygieneCompletedAt: null,
    practiceTimerStartedAt: null,
    practiceCompletedAt: null,
    screenFreeDurationMinutes: 25 as const,
    screenFreeState: SCREEN_FREE_STATE.pending,
    screenFreeStartedAt: null,
    screenFreeSkippedAt: null,
    screenFreeCompletedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function at(time: string): Date {
  return new Date(`2026-08-30T${time}.000Z`);
}
