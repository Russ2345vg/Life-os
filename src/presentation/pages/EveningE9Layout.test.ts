import { describe, expect, it } from 'vitest';
// @ts-expect-error — the test runs in Node while the production tsconfig does not include Node types.
import { readFileSync } from 'node:fs';

const globalCss = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');

describe('E9.2 scene layout contract', () => {
  it('keeps the working area constrained and the card transition restrained', () => {
    expect(globalCss).toMatch(/\.evening-e9-scene\s*{[^}]*width:\s*min\(100%, 44rem\)/);
    expect(globalCss).toMatch(/\.evening-e9-card\s*{[\s\S]*?animation:\s*evening-e9-card-in 210ms/);
  });

  it('adapts the actions for narrow and mobile layouts', () => {
    expect(globalCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.evening-resolving-primary-actions\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(globalCss).toMatch(
      /@media \(max-width: 30rem\)[\s\S]*?\.evening-reflection-actions\s*{[^}]*flex-direction:\s*column-reverse/,
    );
  });

  it('removes the card movement for reduced-motion users', () => {
    expect(globalCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.evening-e9-card\s*{[^}]*animation:\s*none/,
    );
  });
});
