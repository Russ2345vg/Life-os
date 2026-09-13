import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Direction, EntityId } from '../../domain';
import { DirectionCard, DirectionStrategicOutline } from './DirectionsSection';

const NOW = new Date('2026-08-10T08:00:00.000Z');

describe('Direction strategic outline', () => {
  it('renders the configured outline only in direction details', () => {
    const direction = configuredDirection();
    const detailMarkup = renderToStaticMarkup(
      createElement(DirectionStrategicOutline, { direction, onConfigure: vi.fn() }),
    );
    const cardMarkup = renderToStaticMarkup(
      createElement(DirectionCard, {
        item: { direction, activeProjectCount: 0, totalProjectCount: 0, isMain: false },
        spheres: { active: [], archived: [] },
        busy: false,
        onOpen: vi.fn(),
        onEdit: vi.fn(),
        onMakeMain: vi.fn(),
        onArchive: vi.fn(),
        onRestore: undefined,
      }),
    );

    expect(detailMarkup).toContain('Стратегический контур');
    expect(detailMarkup).toContain('Замысел');
    expect(detailMarkup).toContain('Желаемое состояние');
    expect(detailMarkup).toContain('Входит');
    expect(detailMarkup).toContain('Не входит');
    expect(cardMarkup).toContain(direction.name);
    expect(cardMarkup).toContain(direction.description);
    expect(cardMarkup).not.toContain(direction.strategicIntent);
    expect(cardMarkup).not.toContain(direction.desiredState);
  });

  it('offers to configure an empty outline', () => {
    const direction = Direction.create({
      id: EntityId.create('direction-empty-outline'),
      name: 'Новое направление',
      now: NOW,
    });
    const markup = renderToStaticMarkup(
      createElement(DirectionStrategicOutline, { direction, onConfigure: vi.fn() }),
    );

    expect(markup).toContain('Настроить');
    expect(markup).toContain('Стратегический контур не настроен');
    expect(markup).toContain('Определите замысел, желаемое состояние и границы.');
    expect(markup).not.toContain('<dd>—</dd>');
  });
});

function configuredDirection(): Direction {
  return Direction.create({
    id: EntityId.create('direction-configured-outline'),
    name: 'LifeOS',
    description: 'Короткое описание направления',
    strategicIntent: 'Создать систему управления жизнью',
    desiredState: 'Целостная работающая система',
    inScope: 'Продукт и методология',
    outOfScope: 'Заказная разработка',
    now: NOW,
  });
}
