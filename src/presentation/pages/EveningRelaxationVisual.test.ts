// @ts-expect-error -- Node types are intentionally absent from the browser application project.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scene = readFileSync(new URL('./EveningRelaxationScene.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/evening-relaxation.css', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const finalCss = readFileSync(
  new URL('../styles/evening-final-scenes.css', import.meta.url),
  'utf8',
);

describe('Evening Relaxation visual contract', () => {
  it('подключает отдельный tokens-only visual layer', () => {
    expect(scene).toContain("import '../styles/evening-relaxation.css'");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(css).toContain('var(--section-routine)');
    expect(css).toContain('var(--success)');
    expect(css).toContain('var(--danger)');
  });

  it('фиксирует mobile reflow, 44px controls, focus и reduced motion', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*48rem\)/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('grid-template-areas');
    expect(css).toContain("'status'");
    expect(css).toContain("'essentials'");
    expect(css).toContain("'screen-free'");
    expect(css).toContain("'practice'");
    expect(css).toContain("'continuation'");
  });

  it('сохраняет семь шагов journey в relaxation и следующей final scene', () => {
    expect(globalCss).not.toMatch(
      /\.evening-command-center-page \.evening-command-center-journey ol\s*{\s*grid-template-columns:\s*repeat\(5,/,
    );
    expect(finalCss).toContain('grid-template-columns: repeat(7, minmax(0, 1fr))');
  });
});
