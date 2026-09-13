import { describe, expect, it } from 'vitest';
// @ts-expect-error — тест выполняется в Node, а производственный tsconfig не подключает Node-типы.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/goal-album.css', import.meta.url), 'utf8');

describe('GoalAlbum responsive layout contract', () => {
  it('keeps the page and adaptive card grid inside the shell canvas', () => {
    expect(css).toMatch(
      /\.goal-album-page\s*{[^}]*width:\s*min\(calc\(100%\s*-\s*2rem\),\s*82rem\)[^}]*min-width:\s*0/,
    );
    expect(css).toMatch(
      /\.goal-album-card-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*13\.5rem\),\s*1fr\)\)/,
    );
    expect(css).toMatch(/\.goal-album-card\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.goal-album-card-link\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.goal-album-card-copy\s*{[^}]*min-width:\s*0/);
  });

  it('preserves cover geometry, long content, and accessible controls', () => {
    expect(css).toMatch(
      /\.goal-album-card-cover,\s*\.goal-album-card-cover-placeholder\s*{[^}]*aspect-ratio:\s*16\s*\/\s*9/,
    );
    expect(css).toMatch(/\.goal-album-card-cover\s*{[^}]*object-fit:\s*cover/);
    expect(css).toMatch(
      /\.goal-album-card-title[^{]*{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(css).toMatch(
      /\.goal-album-card-next-progress[^{]*{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/,
    );
    expect(css).toMatch(/\.goal-album-filter[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.goal-album-view-mode[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(
      /\.goal-album-card-link:focus-visible\s*{[^}]*outline-offset:\s*-3px[^}]*box-shadow:\s*inset/,
    );
    expect(css).not.toMatch(/line-clamp|text-overflow:\s*ellipsis/);
  });

  it('keeps by-direction cards compact and prevents a single Goal from stretching', () => {
    expect(css).toMatch(
      /\.goal-album-card-grid--compact\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*17\.5rem\),\s*21\.25rem\)\)[^}]*justify-content:\s*space-between/,
    );
    expect(css).toMatch(
      /\.goal-album-sphere-group\s*{[^}]*border:\s*0[^}]*background:\s*transparent/,
    );
    expect(css).toMatch(
      /\.goal-album-sphere-group\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*17\.5rem\),\s*21\.25rem\)\)[^}]*justify-content:\s*space-between/,
    );
    expect(css).toMatch(/\.goal-album-sphere-header\s*{[^}]*grid-column:\s*1\s*\/\s*-1/);
    expect(css).toMatch(
      /\.goal-album-sphere-group\s*>\s*\.goal-album-card-grid\s*{[^}]*grid-column:\s*1\s*\/\s*-1/,
    );
    expect(css).toMatch(
      /\.goal-album-direction-group:has\(\.goal-album-card:nth-child\(2\)\)\s*{[^}]*grid-column:\s*1\s*\/\s*-1/,
    );
    expect(css).not.toMatch(/\.goal-album-direction-group\s*{[^}]*grid-template-columns/);
    expect(css).toMatch(
      /\.goal-album-card--compact \.goal-album-card-cover,\s*\.goal-album-card--compact \.goal-album-card-cover-placeholder\s*{[^}]*aspect-ratio:\s*auto[^}]*block-size:\s*6\.25rem[^}]*max-block-size:\s*6\.25rem/,
    );
    expect(css).toMatch(
      /\.goal-album-card--compact \.goal-album-card-cover-placeholder\s*{[^}]*background:\s*var\(--surface-field\)/,
    );
    expect(css).toMatch(/\.goal-album-groups\s*{[^}]*gap:\s*var\(--space-4\)/);
    expect(css).toMatch(/\.goal-album-direction-header\s*{[^}]*width:\s*fit-content/);
    expect(css).toMatch(/\.goal-album-direction-header\s*{[^}]*justify-content:\s*flex-start/);
    expect(css).toMatch(/\.goal-album-direction-header\s*>\s*span\s*{[^}]*border-radius:\s*999px/);
  });

  it('stacks the overview, controls, groups, and CTA at the approved breakpoints', () => {
    const compactCss = cssSection('@media (max-width: 64rem)', '@media (max-width: 48rem)');
    const stackedCss = cssSection('@media (max-width: 48rem)', '@media (max-width: 30rem)');
    const mobileCss = cssSection(
      '@media (max-width: 30rem)',
      '@media (prefers-reduced-motion: reduce)',
    );
    const reducedMotionCss = cssSection('@media (prefers-reduced-motion: reduce)');

    expect(compactCss).toMatch(/\.goal-album-overview\s*{[^}]*padding:\s*var\(--space-3\)/);
    expect(stackedCss).toMatch(
      /\.goal-album-header,\s*\.goal-album-controls\s*{[^}]*align-items:\s*stretch[^}]*flex-direction:\s*column/,
    );
    expect(stackedCss).toMatch(
      /\.goal-album-sphere-group\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(stackedCss).toMatch(
      /\.goal-album-card-grid--compact\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*21\.25rem\)\)/,
    );
    expect(stackedCss).toMatch(
      /\.goal-album-page\s*{[^}]*padding-bottom:\s*calc\(var\(--space-8\)\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    expect(mobileCss).toMatch(
      /\.goal-album-kpis\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(mobileCss).toMatch(
      /\.goal-album-card-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(mobileCss).toMatch(
      /\.goal-album-sphere-group\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(mobileCss).toMatch(
      /\.goal-album-card-grid--compact\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(mobileCss).toMatch(/\.goal-album-create-link\s*{[^}]*width:\s*100%/);
    expect(reducedMotionCss).toMatch(
      /\.goal-album-create-link,\s*\.goal-album-card\s*{[^}]*transition:\s*none/,
    );
    expect(reducedMotionCss).toMatch(
      /\.goal-album-create-link:active,\s*\.goal-album-card:hover\s*{[^}]*transform:\s*none/,
    );
  });

  it('defines the approved A2 detail and A3 sticky form compositions', () => {
    expect(css).toMatch(
      /\.goal-detail-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(16rem,\s*20rem\)/,
    );
    expect(css).toMatch(
      /\.goal-form-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(18rem,\s*24rem\)/,
    );
    expect(css).toMatch(/\.goal-form-preview\s*{[^}]*position:\s*sticky[^}]*top:/);
    expect(css).toMatch(
      /@media \(min-width:\s*80rem\)[\s\S]*\.goal-form-main\s*>\s*\.goal-form-section:first-child\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    const tabletCss = cssSection('@media (max-width: 56.25rem)', '@media (max-width: 48rem)');
    expect(tabletCss).toMatch(
      /\.goal-detail-layout,\s*\.goal-form-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(tabletCss).toMatch(/\.goal-form-preview\s*{[^}]*position:\s*static/);
  });

  it('keeps no-cover states intentional and compact without changing A1 cards', () => {
    expect(css).toMatch(
      /\.goal-detail-hero--without-cover\s*{[^}]*grid-template-columns:\s*minmax\(5\.5rem,\s*7rem\)\s+minmax\(0,\s*1fr\)\s+auto/,
    );
    expect(css).toMatch(
      /\.goal-detail-hero--without-cover \.goal-detail-cover-placeholder\s*{[^}]*background:\s*var\(--surface-field\)/,
    );
    expect(css).toMatch(
      /\.goal-form-preview-card--without-cover \.goal-album-card-cover-placeholder\s*{[^}]*aspect-ratio:\s*auto[^}]*block-size:\s*8\.75rem[^}]*background:\s*var\(--surface-field\)/,
    );
  });

  it('uses a denser A3 rhythm while preserving touch targets and sticky clearance', () => {
    expect(css).toMatch(/\.goal-form textarea\s*{[^}]*min-height:\s*5\.5rem/);
    expect(css).toMatch(
      /\.goal-form-parameter-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toMatch(
      /\.goal-form-layout\s*{[^}]*padding-bottom:\s*calc\(5\.5rem\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    const mobileCss = cssSection('@media (max-width: 48rem)', '@media (max-width: 30rem)');
    expect(mobileCss).toMatch(
      /\.goal-form-parameter-grid\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it('keeps A2 and A3 controls accessible with long data and mobile safe area', () => {
    expect(css).toMatch(/\.goal-detail-hero\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.goal-form-main\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(
      /\.goal-detail-progress progress::-webkit-progress-value\s*{[^}]*background:\s*var\(--color-accent-gold\)/,
    );
    expect(css).toMatch(
      /\.goal-detail-progress progress::-moz-progress-bar\s*{[^}]*background:\s*var\(--color-accent-gold\)/,
    );
    expect(css).toMatch(
      /\.goal-form\s+:is\(input,\s*select,\s*textarea,\s*button\)[^{]*{[^}]*min-height:\s*2\.75rem/,
    );
    expect(css).toMatch(/\.goal-form\s+:is\(input,\s*select,\s*textarea,\s*button\):focus-visible/);
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    const mobileCss = cssSection(
      '@media (max-width: 30rem)',
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(mobileCss).toMatch(
      /\.goal-detail-actions :is\(a,\s*button\)\s*{[^}]*flex:\s*0\s+1\s+auto/,
    );
    expect(mobileCss).toMatch(
      /\.goal-form-actions\s*{[^}]*bottom:\s*calc\(4\.5rem\s*\+\s*env\(safe-area-inset-bottom\)\)/,
    );
    expect(css).not.toMatch(/line-clamp|text-overflow:\s*ellipsis/);
    expect(css).not.toMatch(/#[0-9a-f]{0,2}(?:7b2|8a2|9b3)/i);
  });
});

function cssSection(startMarker: string, endMarker?: string): string {
  const start = css.indexOf(startMarker);
  if (start === -1) throw new Error(`Missing CSS section: ${startMarker}`);
  const end =
    endMarker === undefined ? css.length : css.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`Missing CSS section boundary: ${endMarker}`);
  return css.slice(start, end);
}
