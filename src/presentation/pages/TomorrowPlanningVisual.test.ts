// @ts-expect-error — тест выполняется в Node, а production tsconfig не включает Node types.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheetUrl = new URL('../styles/planning-tomorrow.css', import.meta.url);
const stylesheet = existsSync(stylesheetUrl) ? readFileSync(stylesheetUrl, 'utf8') : '';
const atmosphereUrl = new URL('../../../public/planning-tomorrow-atmosphere.png', import.meta.url);

describe('TomorrowPlanningCenter visual contract', () => {
  it('изолирует визуальную систему внутри страницы и сохраняет правую панель главным центром', () => {
    expect(stylesheet).toMatch(/\.tomorrow-planning-page\s*{/);
    expect(stylesheet).toMatch(/\.tomorrow-planning-grid\s*{[^}]*align-items:\s*stretch/s);
    expect(stylesheet).toMatch(/\.tomorrow-planning-form-card\s*{[^}]*align-self:\s*start/s);
    expect(stylesheet).toMatch(/\.tomorrow-plan-card\s*{[^}]*grid-area:\s*plan/s);
    expect(stylesheet).toMatch(/\.tomorrow-planning-form-card\s*{[^}]*grid-area:\s*form/s);
    expect(stylesheet).toContain('/planning-tomorrow-atmosphere.png');
  });

  it('перестраивает mobile-поток, сохраняет touch targets и не допускает horizontal scroll', () => {
    expect(stylesheet).toMatch(/@media \(max-width:\s*52rem\)/);
    expect(stylesheet).toMatch(
      /\.tomorrow-planning-grid\s*{[^}]*grid-template-areas:[^}]*['"]plan['"][^}]*['"]form['"]/s,
    );
    expect(stylesheet).toMatch(/min-height:\s*2\.75rem/);
    expect(stylesheet).toMatch(/overflow-x:\s*clip/);
  });

  it('защищает keyboard focus и reduced motion', () => {
    expect(stylesheet).toContain(':focus-visible');
    expect(stylesheet).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });

  it('поставляет атмосферный фон как локальный asset экрана', () => {
    expect(existsSync(atmosphereUrl)).toBe(true);
  });

  it('уплотняет desktop hero и рабочие поверхности для viewport 1600 на 900', () => {
    expect(stylesheet).toMatch(
      /\.tomorrow-planning-header h1\s*{[^}]*font-size:\s*clamp\(2\.35rem,\s*3\.6vw,\s*4rem\)/s,
    );
    expect(stylesheet).toMatch(
      /\.tomorrow-planning-header\s*{[^}]*margin-bottom:\s*var\(--space-4\)/s,
    );
    expect(stylesheet).toContain('rgb(11 13 15 / 48%) 0');
    expect(stylesheet).toContain('rgb(11 13 15 / 84%) 24rem');
    expect(stylesheet).toMatch(
      /\.tomorrow-planning-form-card\s*{[^}]*padding:\s*var\(--space-5,[^}]*border-color:\s*color-mix\(in srgb, var\(--section-accent\) 12%, var\(--border-strong\)\)/s,
    );
    expect(stylesheet).not.toMatch(/\.tomorrow-planning-form-card\s*{[^}]*-1px 0 0 color-mix/s);
    expect(stylesheet).toMatch(/\.tomorrow-plan-card\s*{[^}]*box-shadow:\s*var\(--shadow-deep\)/s);
    expect(stylesheet).toMatch(
      /\.tomorrow-planning-form\s*{[^}]*gap:\s*var\(--space-3\)[^}]*margin-top:\s*var\(--space-4\)/s,
    );
    expect(stylesheet).toMatch(
      /\.tomorrow-planning-field (?:input|input,)[\s\S]*?min-height:\s*2\.75rem/s,
    );
    expect(stylesheet).toMatch(/\.tomorrow-planning-field textarea\s*{[^}]*min-height:\s*5\.5rem/s);
    expect(stylesheet).toMatch(
      /\.tomorrow-plan-slot-empty strong\s*{[^}]*color:\s*var\(--text-secondary\)/s,
    );
    expect(stylesheet).toMatch(
      /\.tomorrow-slot-add\s*{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--section-accent\) 48%/s,
    );
    expect(stylesheet).toMatch(
      /\.tomorrow-plan-slot-empty \.tomorrow-slot-add\s*{[^}]*font-size:\s*1\.7rem[^}]*font-weight:\s*500/s,
    );
  });
});
