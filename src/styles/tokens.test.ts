import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_COUNT } from '@/lib/domain/regions';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('design tokens', () => {
  it('defines every colour token from the handoff', () => {
    const required = [
      '--navy-900', '--navy-700', '--blue-500', '--gold-500',
      '--bg-app', '--bg-panel', '--bg-row', '--bg-row-alt', '--surface',
      '--border', '--border-input', '--divider',
      '--text', '--text-body', '--text-muted', '--text-faint', '--placeholder',
      '--success-bg', '--success-fg', '--warn-bg', '--warn-fg',
      '--danger-bg', '--danger-fg', '--purple-bg', '--purple-fg',
      '--sidebar-text', '--sidebar-text-dim', '--sidebar-text-faint',
      '--sidebar-hover', '--sidebar-line', '--sidebar-outline',
      '--nav-active-bg', '--avatar-bg', '--focus-ring', '--row-hover',
      '--toast-bg', '--toast-text',
    ];
    for (const token of required) {
      expect(css, `missing ${token}`).toContain(`${token}:`);
    }
  });

  it('defines one colour per region and no more', () => {
    for (let i = 1; i <= REGION_COUNT; i++) {
      expect(css, `missing --region-${i}`).toContain(`--region-${i}:`);
    }
    // Catches a palette entry left behind when the region count changes.
    expect(css, 'stale palette entry').not.toContain(`--region-${REGION_COUNT + 1}:`);
  });
});

// The three --font-* custom properties are produced by next/font and injected
// through a class on <html>; defining them in tokens.css would override the
// generated families. The wiring is therefore asserted on the layout instead.
describe('font wiring', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('declares all three families with their token names', () => {
    for (const [family, token] of [
      ['Source_Sans_3', '--font-ui'],
      ['Source_Serif_4', '--font-heading'],
      ['IBM_Plex_Mono', '--font-mono'],
    ]) {
      expect(layout, `missing ${family}`).toContain(family);
      expect(layout, `missing ${token}`).toContain(token);
    }
  });

  it('requests the latin-ext subset so Polish glyphs are covered', () => {
    expect(layout.match(/latin-ext/g) ?? []).toHaveLength(3);
  });

  it('self-hosts rather than linking Google stylesheets', () => {
    expect(layout).not.toMatch(/href=["'{`]?\s*(?:https?:)?\/\/fonts\.(googleapis|gstatic)\.com/);
    expect(layout).not.toContain('<link');
  });
});
