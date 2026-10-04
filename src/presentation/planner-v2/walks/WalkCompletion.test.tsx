import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DayDate } from '../../../domain/day/DayDate';
import { EntityId } from '../../../domain/shared/EntityId';
import { Walk } from '../../../domain/walk/Walk';
import type { WalkServices } from '../../../application/walk/WalkServices';
import { WalkCompletion } from './WalkCompletion';

describe('WalkCompletion', () => {
  it('keeps a previously saved text result editable when reflection notes become available', () => {
    const walk = Walk.create({
      id: EntityId.create('legacy-reflection'),
      date: DayDate.create('2026-10-03'),
      type: 'reflection',
      intent: 'reflection',
      now: new Date('2026-10-03T10:00:00Z'),
    })
      .start({ mode: 'stopwatch', startedAt: new Date('2026-10-03T10:00:00Z') })
      .complete({ endedAt: new Date('2026-10-03T10:20:00Z') })
      .reviseReflection({
        result: 'Старый итог',
        afterState: null,
        impact: null,
        updatedAt: new Date('2026-10-03T10:21:00Z'),
      });
    const html = renderToStaticMarkup(
      <WalkCompletion walk={walk} services={{} as WalkServices} onDone={() => undefined} />,
    );
    expect(html).toContain('Ранее сохранённый итог');
    expect(html).toContain('Старый итог');
    expect(html).toContain('Что понял');
  });
});
