/* The palette did not change colour when it changed notation.
 *
 * Stage one of ADR 0010 rewrote eleven hex values as the hue, saturation and
 * lightness they already were, so that a component library could later be
 * handed the same numbers rather than have somebody re-pick the theme by eye.
 * The entire value of that depends on it being exact: a studio that comes back
 * a shade off is a worse outcome than never having done it.
 *
 * So the hex the studio shipped with is written down here, once, and this
 * converts what index.css now says back into bytes and compares. It guards two
 * different mistakes: the conversion having been slightly wrong on the day, and
 * somebody later editing a triplet by hand and landing near a colour rather
 * than on it.
 *
 * These are the values as of 2026-09-06. Changing the theme deliberately means
 * changing them here too, which is the point: a colour change should be a line
 * in a test rather than a surprise.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(
  join(new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), 'src/index.css'),
  'utf8');

const SHIPPED: Record<string, string> = {
  ground: '#0d1015',
  surface: '#141920',
  'surface-2': '#1b222b',
  ink: '#e4e9f0',
  muted: '#8c96a5',
  line: '#232b35',
  accent: '#d8a24a',
  warn: '#d66e63',
  'ch-r': '#e3736b',
  'ch-g': '#79c073',
  'ch-b': '#6b93e3',
};

/* What a component library would be pointed at, and the token behind each.
 *
 * Prefixed, and the reason is the fifth line below. `muted` exists in both
 * vocabularies and means opposite things: here it is the colour of dim text,
 * in shadcn it is a dim surface whose text is `muted-foreground`. Unprefixed,
 * adopting one would silently repaint every piece of dim text in the studio as
 * a panel. Nothing would fail; the text would just go dark.
 */
const ALIASES: Record<string, string> = {
  'ui-background': 'ground',
  'ui-card': 'surface',
  'ui-popover': 'surface',
  'ui-secondary': 'surface-2',
  'ui-muted': 'surface-2',
  'ui-foreground': 'ink',
  'ui-card-foreground': 'ink',
  'ui-popover-foreground': 'ink',
  'ui-muted-foreground': 'muted',
  'ui-secondary-foreground': 'muted',
  'ui-border': 'line',
  'ui-input': 'line',
  'ui-primary': 'accent',
  'ui-ring': 'accent',
  'ui-destructive': 'warn',
};

function tripletOf(name: string): [number, number, number] {
  const found = CSS.match(
    new RegExp('--' + name + '-hsl:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;'));
  if (!found) throw new Error('no --' + name + '-hsl in index.css');
  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

/* The conversion a browser does, rounding the same way. */
function hexOf([h, s, l]: [number, number, number]): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const sixth = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sixth];
  const byte = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + byte(r) + byte(g) + byte(b);
}

function definitionOf(name: string): string | null {
  const line = CSS.match(new RegExp('^\\s*--' + name + ':\\s*(.+);\\s*$', 'm'));
  return line ? line[1].trim() : null;
}

describe('the palette', () => {
  it('still paints exactly the colours it shipped with', () => {
    const drifted: string[] = [];
    for (const [name, hex] of Object.entries(SHIPPED)) {
      const got = hexOf(tripletOf(name));
      if (got !== hex) drifted.push(`--${name}: ${got}, shipped as ${hex}`);
    }
    expect(drifted).toEqual([]);
  });

  it('is still what the studio reads, under its own names', () => {
    /* Every name the stylesheet uses is derived from a triplet rather than
     * carrying its own value, so there is one palette and changing a colour is
     * still one line. A hex left behind here would be a colour that stops
     * following the token above it. */
    const stale: string[] = [];
    for (const name of Object.keys(SHIPPED)) {
      const value = definitionOf(name);
      if (value === null) stale.push(`--${name} is not defined`);
      else if (value !== `hsl(var(--${name}-hsl))`) {
        stale.push(`--${name} is ${value}, not derived from its triplet`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('offers the names a component library would look for', () => {
    /* Costing nothing today, which is the whole argument for doing this part
     * before deciding anything else. If the rest of ADR 0010 is never done,
     * these are fifteen unused lines. */
    const missing: string[] = [];
    for (const [alias, token] of Object.entries(ALIASES)) {
      const value = definitionOf(alias);
      if (value === null) missing.push(`--${alias} is not defined`);
      else if (value !== `var(--${token}-hsl)`) {
        missing.push(`--${alias} is ${value}, expected var(--${token}-hsl)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('hands those names bare triplets, which is the form they are read in', () => {
    /* A component library writes hsl(var(--ui-background)). An alias holding a
     * finished hsl(...) would produce hsl(hsl(...)) and paint nothing at all,
     * which is worth catching once rather than component by component. */
    for (const alias of Object.keys(ALIASES)) {
      expect(definitionOf(alias)).not.toContain('hsl(');
    }
  });

  it('keeps the studio and the library apart where they disagree', () => {
    /* The collision that made the prefix necessary, asserted so it cannot be
     * undone by somebody tidying the prefix away. `--muted` is dim text here
     * and a dim surface there, and they must not become the same variable. */
    expect(definitionOf('muted')).toBe('hsl(var(--muted-hsl))');
    expect(definitionOf('ui-muted')).toBe('var(--surface-2-hsl)');
    expect(definitionOf('ui-muted-foreground')).toBe('var(--muted-hsl)');
  });
});
