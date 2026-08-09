import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityId, Sphere } from '../../domain';
import { SphereBadge, SphereSelect } from './SphereReference';

const NOW = new Date('2026-08-08T08:00:00.000Z');

describe('SphereReference', () => {
  it('shows the current canonical name after rename and marks an archived link', () => {
    const original = Sphere.create({
      id: EntityId.create('sphere-work'),
      name: 'Работа',
      now: NOW,
    });
    const renamed = original.update({ name: 'Карьера' }, new Date(NOW.getTime() + 1_000));
    const archived = renamed.archive(new Date(NOW.getTime() + 2_000));
    const markup = renderToStaticMarkup(
      <SphereBadge sphereId="sphere-work" snapshot={{ active: [], archived: [archived] }} />,
    );
    expect(markup).toContain('Карьера');
    expect(markup).toContain('Архивная');
    expect(markup).not.toContain('Работа');
  });

  it('does not offer archived spheres for a new link and survives a missing target', () => {
    const active = Sphere.create({
      id: EntityId.create('sphere-active'),
      name: 'Активная',
      now: NOW,
    });
    const archived = Sphere.create({
      id: EntityId.create('sphere-old'),
      name: 'Старая',
      now: NOW,
    }).archive(NOW);
    const select = renderToStaticMarkup(
      <SphereSelect
        value={null}
        snapshot={{ active: [active], archived: [archived] }}
        onChange={() => undefined}
      />,
    );
    const missing = renderToStaticMarkup(
      <SphereBadge sphereId="sphere-missing" snapshot={{ active: [active], archived: [] }} />,
    );
    expect(select).toContain('Активная');
    expect(select).not.toContain('Старая');
    expect(missing).toContain('Сфера недоступна');
  });

  it('keeps an archived current link visible while retaining the unlink option', () => {
    const archived = Sphere.create({
      id: EntityId.create('sphere-old'),
      name: 'Старая',
      now: NOW,
    }).archive(NOW);

    const markup = renderToStaticMarkup(
      <SphereSelect
        value="sphere-old"
        snapshot={{ active: [], archived: [archived] }}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('Старая · Архивная');
    expect(markup).toContain('Без сферы');
  });
});
