import { describe, expect, it } from 'vitest';
import {
  buildTomorrowWorkingFormPresentation,
  type TomorrowWorkingFormPresentationInput,
} from './TomorrowScenePresentation';

describe('Tomorrow working form presentation', () => {
  it('показывает только выбранную границу и не теряет значения скрытых уровней', () => {
    const presentation = buildTomorrowWorkingFormPresentation({
      selectedOutcomeLevel: 'target',
      minimum: 'Открыть рабочий документ',
      target: 'Подготовить проверяемую версию',
      stretch: 'Передать версию на ревью',
      primaryReady: true,
      firstActionReady: true,
      overloaded: false,
      overloadAccepted: false,
    });

    expect(presentation).toMatchObject({
      activeOutcome: {
        level: 'target',
        label: 'Норма',
        value: 'Подготовить проверяемую версию',
      },
      outcomeValues: {
        minimum: 'Открыть рабочий документ',
        target: 'Подготовить проверяемую версию',
        stretch: 'Передать версию на ревью',
      },
    });
  });

  it('приглушает последующие блоки до выбора главного решения', () => {
    expect(
      buildTomorrowWorkingFormPresentation({
        selectedOutcomeLevel: 'target',
        minimum: '',
        target: '',
        stretch: '',
        primaryReady: false,
        firstActionReady: false,
        overloaded: false,
        overloadAccepted: false,
      }),
    ).toMatchObject({
      followingBlocksDisabled: true,
      continueReady: false,
    });
  });

  it('разрешает продолжение только с главным решением, минимумом и первым шагом', () => {
    const readyInput: TomorrowWorkingFormPresentationInput = {
      selectedOutcomeLevel: 'target',
      minimum: 'Собрать минимально рабочую версию',
      target: 'Подготовить нормальный результат',
      stretch: '',
      primaryReady: true,
      firstActionReady: true,
      overloaded: false,
      overloadAccepted: false,
    };

    expect(buildTomorrowWorkingFormPresentation(readyInput).continueReady).toBe(true);
    expect(buildTomorrowWorkingFormPresentation({ ...readyInput, minimum: '' }).continueReady).toBe(
      false,
    );
    expect(
      buildTomorrowWorkingFormPresentation({ ...readyInput, firstActionReady: false })
        .continueReady,
    ).toBe(false);
    expect(
      buildTomorrowWorkingFormPresentation({ ...readyInput, overloaded: true }).continueReady,
    ).toBe(false);
    expect(
      buildTomorrowWorkingFormPresentation({
        ...readyInput,
        overloaded: true,
        overloadAccepted: true,
      }).continueReady,
    ).toBe(true);
  });
});
