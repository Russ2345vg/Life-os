import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ActionActualResult, EntityId, Goal, LifeAction, LifeActionTitle } from '../../domain';
import { ActionResults } from './ActionResults';

const now = new Date('2026-10-01T12:00:00Z');
const goal = Goal.create({ id: EntityId.create('goal'), title: 'Моя цель', now });
function action(key: string, note: string | null) {
  const value = LifeAction.createDraft({
    id: EntityId.create(key),
    title: LifeActionTitle.create(key),
    goalId: goal.id,
    createdAt: now,
    eventId: EntityId.create(key + '-created'),
  });
  value.complete(
    note === null ? null : ActionActualResult.create(note),
    now,
    EntityId.create(key + '-completed'),
  );
  return value;
}

describe('success history', () => {
  it('shows every completion with a date and only renders results that exist', () => {
    const html = renderToStaticMarkup(
      createElement(ActionResults, {
        actions: [action('Без итога', null), action('С итогом', 'Заметил прогресс')],
      }),
    );
    expect(html).toContain('aria-label="История успехов"');
    expect(html).toContain('Без итога');
    expect(html).toContain('Заметил прогресс');
    expect(html.match(/<time /g)).toHaveLength(2);
    expect(html).not.toContain('<p></p>');
  });

  it('offers a link to the related goal in a direction history', () => {
    const html = renderToStaticMarkup(
      createElement(ActionResults, { actions: [action('Шаг', null)], goals: [goal] }),
    );
    expect(html).toContain('href="#/v2/goals/goal"');
    expect(html).toContain('Моя цель');
  });

  it('explains where an empty history comes from', () => {
    const html = renderToStaticMarkup(createElement(ActionResults, { actions: [] }));
    expect(html).toContain('Здесь появятся завершённые действия.');
  });
});
