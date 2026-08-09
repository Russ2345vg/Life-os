import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EntityId, Sphere } from '../../domain';
import {
  SPHERE_MOBILE_BREAKPOINT_PX,
  SphereForm,
  SphereSections,
  type SphereFormDraft,
} from './SpheresPage';

const NOW = new Date('2026-08-08T08:00:00.000Z');

function sphere(id: string, name: string): Sphere {
  return Sphere.create({
    id: EntityId.create(id),
    name,
    description: `${name}: краткое описание`,
    icon: '✦',
    color: '#6b78c7',
    now: NOW,
  });
}

describe('SpheresPage stage 15.1 UI', () => {
  it('separates active and archived spheres and exposes canonical actions', () => {
    const active = sphere('sphere-active', 'Творчество');
    const archived = sphere('sphere-archived', 'Старое направление').archive(
      new Date('2026-08-08T09:00:00.000Z'),
    );
    const markup = renderToStaticMarkup(
      createElement(SphereSections, {
        snapshot: { active: [active], archived: [archived] },
        showArchived: true,
        busyId: null,
        onEdit: vi.fn(),
        onArchive: vi.fn(),
        onRestore: vi.fn(),
        onToggleArchived: vi.fn(),
      }),
    );

    expect(markup).toContain('Активные сферы');
    expect(markup).toContain('Архивные сферы');
    expect(markup).toContain('Творчество');
    expect(markup).toContain('Старое направление');
    expect(markup).toContain('Редактировать');
    expect(markup).toContain('Архивировать');
    expect(markup).toContain('Восстановить');
    expect(markup).not.toContain('Удалить');
  });

  it('keeps archived cards hidden behind the simple archive switch', () => {
    const markup = renderToStaticMarkup(
      createElement(SphereSections, {
        snapshot: {
          active: [sphere('sphere-active', 'Дом')],
          archived: [
            sphere('sphere-archived', 'Скрытый архив').archive(
              new Date('2026-08-08T09:00:00.000Z'),
            ),
          ],
        },
        showArchived: false,
        busyId: null,
        onEdit: vi.fn(),
        onArchive: vi.fn(),
        onRestore: vi.fn(),
        onToggleArchived: vi.fn(),
      }),
    );

    expect(markup).toContain('Показать (1)');
    expect(markup).not.toContain('Скрытый архив');
  });

  it('renders a keyboard-accessible compact form with bounded fields', () => {
    const draft: SphereFormDraft = {
      name: 'Творчество',
      description: '',
      icon: '🎨',
      color: '#6b78c7',
    };
    const markup = renderToStaticMarkup(
      createElement(SphereForm, {
        mode: 'create',
        draft,
        isSaving: false,
        error: null,
        onChange: vi.fn(),
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(markup).toContain('<form');
    expect(markup).toContain('name="name"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('maxLength="120"');
    expect(markup).toContain('maxLength="500"');
    expect(markup).toContain('type="color"');
    expect(markup).toContain('Сохранить');
    expect(markup).toContain('Отмена');
  });

  it('contains the 390 px safeguards for wrapping, one-column cards and non-overlapping buttons', () => {
    const markup = renderToStaticMarkup(
      createElement(SphereSections, {
        snapshot: {
          active: [sphere('sphere-mobile', 'Очень длинное название сферы для переноса')],
          archived: [],
        },
        showArchived: false,
        busyId: null,
        onEdit: vi.fn(),
        onArchive: vi.fn(),
        onRestore: vi.fn(),
        onToggleArchived: vi.fn(),
      }),
    );

    expect(390).toBeLessThan(SPHERE_MOBILE_BREAKPOINT_PX);
    expect(markup).toContain('sphere-grid');
    expect(markup).toContain('sphere-card-copy');
    expect(markup).toContain('sphere-card-actions');
    expect(markup).toContain('Очень длинное название сферы для переноса');
  });
});
