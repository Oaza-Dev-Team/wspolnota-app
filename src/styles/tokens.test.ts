import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('design tokens', () => {
  it('defines every colour token from the handoff', () => {
    const wymagane = [
      '--navy-900', '--navy-700', '--blue-500', '--gold-500',
      '--bg-app', '--bg-panel', '--bg-row', '--bg-row-alt', '--surface',
      '--border', '--border-input', '--divider',
      '--text', '--text-body', '--text-muted', '--text-faint', '--placeholder',
      '--success-bg', '--success-fg', '--warn-bg', '--warn-fg',
      '--danger-bg', '--danger-fg', '--purple-bg', '--purple-fg',
    ];
    for (const token of wymagane) {
      expect(css, `missing ${token}`).toContain(`${token}:`);
    }
  });

  it('defines all twelve region colours', () => {
    for (let i = 1; i <= 12; i++) {
      expect(css, `missing --rejon-${i}`).toContain(`--rejon-${i}:`);
    }
  });

});

// The three --font-* custom properties are produced by next/font and injected
// through a class on <html>; defining them in tokens.css would override the
// generated families. The wiring is therefore asserted on the layout instead.
describe('font wiring', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('declares all three families with their token names', () => {
    for (const [rodzina, token] of [
      ['Source_Sans_3', '--font-ui'],
      ['Source_Serif_4', '--font-naglowek'],
      ['IBM_Plex_Mono', '--font-mono'],
    ]) {
      expect(layout, `missing ${rodzina}`).toContain(rodzina);
      expect(layout, `missing ${token}`).toContain(token);
    }
  });

  it('requests the latin-ext subset so Polish glyphs are covered', () => {
    const wystapienia = layout.match(/latin-ext/g) ?? [];
    expect(wystapienia).toHaveLength(3);
  });

  it('self-hosts rather than linking Google stylesheets', () => {
    // Looks for a real remote reference, not a mention: the file explains in a
    // comment why it does not contact fonts.gstatic.com.
    expect(layout).not.toMatch(/href=["'{`]?\s*(?:https?:)?\/\/fonts\.(googleapis|gstatic)\.com/);
    expect(layout).not.toContain('<link');
  });
});
