import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlannerScenariosPanel, scenarioCandidates } from './PlannerScenariosPanel';
import { DayDate, EntityId, LifeAction, LifeActionTitle } from '../../domain';

describe('Planner scenarios presentation', () => {
  it('keeps the normal day usable while scenarios load', () => {
    const html = renderToStaticMarkup(
      createElement(PlannerScenariosPanel, {
        service: {
          list: async () => [],
          create: async () => {
            throw new Error();
          },
          update: async () => {
            throw new Error();
          },
          addAction: async () => {
            throw new Error();
          },
          removeAction: async () => {
            throw new Error();
          },
          archive: async () => {
            throw new Error();
          },
        },
        date: '2026-09-24',
        actions: [],
        busy: false,
        renderAction: () => null,
        children: createElement('p', null, 'Обычный план дня'),
      }),
    );
    expect(html).toContain('Загружаем сценарии');
    expect(html).toContain('Обычный план дня');
    expect(html).toContain('Все задачи');
  });
  it('searches existing open tasks, prioritizes the selected date, and excludes existing links', () => {
    const actions = ['later', 'today', 'selected', 'done'].map((id) =>
      LifeAction.createDraft({
        id: EntityId.create(id),
        title: LifeActionTitle.create(`Задача ${id}`),
        plannedDate: id === 'today' ? DayDate.create('2026-09-24') : null,
        createdAt: new Date('2026-09-24'),
        eventId: EntityId.create(`created-${id}`),
      }),
    );
    actions[3]!.complete(null, new Date('2026-09-24'), EntityId.create('done'));
    expect(
      scenarioCandidates(actions, ['selected'], 'задача', '2026-09-24').map((a) => a.id.toString()),
    ).toEqual(['today', 'later']);
    expect(scenarioCandidates(actions, [], 'Не найдено', '2026-09-24')).toEqual([]);
  });
});
