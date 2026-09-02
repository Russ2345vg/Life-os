// @ts-expect-error -- Node types are intentionally absent from the browser application project.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles/evening-sleep-check.css', import.meta.url), 'utf8');
const scene = readFileSync(new URL('./EveningSleepCheckScene.tsx', import.meta.url), 'utf8');

describe('Evening Sleep Check visual contract', () => {
  it('держит один focus container и семантические цвета LifeOS', () => {
    expect(scene).toContain('evening-sleep-check-focus');
    expect(css).toContain('--sleep-accent: var(--gold-main)');
    expect(css).toContain('color: var(--success)');
    expect(css).toContain('color: var(--danger)');
    expect(css).not.toMatch(/purple|violet|#[a-f0-9]{6}/i);
  });

  it('сохраняет 44px targets, single-column mobile и отсутствие page overflow', () => {
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 480px)');
    expect(css).toContain('grid-template-columns: 1fr');
    expect(css).toContain('width: min(100%, 760px)');
    expect(css).toContain('min-height: 28rem');
    expect(css).toContain(':has(input:disabled)');
    expect(css).not.toContain('100vw');
  });

  it('оставляет native radio/focus semantics и отключает motion по умолчанию', () => {
    expect(scene).toContain('SubjectiveRatingScale');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(scene).toContain('maxLength={280}');
  });
});
