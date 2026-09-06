/* The house rules, enforced rather than written down and hoped for.
 *
 * CLAUDE.md has said since August that an icon button carries an aria-label.
 * Nothing checked it, so the rule held only for as long as whoever was editing
 * remembered it. These are the checks that make the rules real.
 *
 * They read the source rather than the DOM on purpose. Rendering every page
 * needs every page's fetches mocked, which is a lot of scaffolding to answer a
 * question about text. The cost is reasoning about JSX without a parser, so
 * each rule is written to be conservative: it flags what is unambiguous and
 * stays quiet otherwise. A rule that cries wolf gets deleted, and then nothing
 * is checked at all.
 *
 * The tag scanner below is the reason this is worth doing rather than a
 * regular expression. `[^>]*` looks like it finds a tag's attributes, and it
 * does until the first arrow function: `onClick={(e) => ...}` contains a `>`,
 * so the match ends in the middle of the tag and everything after it is
 * invisible. That produced a false report against an input that was correctly
 * labelled all along, which is exactly how a checker loses its credibility.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), 'src');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(path);
  }
  return out;
}

const all = sources(SRC).map((path) => ({
  name: relative(SRC, path),
  text: readFileSync(path, 'utf8'),
}));

/* Components copied in from shadcn are not read by the rules below, and
 * cannot be: they render through Radix, so a button in the source is
 * <AlertDialogPrimitive.Action> rather than <button>, and a source scan
 * looking for <button> finds nothing and says everything is fine. That is
 * the worst way for a check to fail, so rather than let it happen quietly,
 * they are excluded here and the boundary below is what holds instead.
 *
 * What actually covers them is a rendering test. Confirm.test.tsx asks for
 * the dialog's buttons by their accessible names, which is the same
 * question these rules ask, put to the DOM instead of the file. */
const files = all.filter((f) => !f.name.startsWith('ui/shad/'));

type Tag = { attrs: string; end: number; selfClosing: boolean };

/* Everything between `<name` and the `>` that actually closes it, skipping any
 * `>` inside braces, quotes or template literals. */
function tags(text: string, name: string): Tag[] {
  const out: Tag[] = [];
  const opener = new RegExp(`<${name}(?=[\\s/>])`, 'g');
  for (const found of text.matchAll(opener)) {
    let at = found.index! + found[0].length;
    let depth = 0;
    let quote = '';
    while (at < text.length) {
      const ch = text[at];
      if (quote) {
        if (ch === quote && text[at - 1] !== '\\') quote = '';
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
      } else if (ch === '>' && depth === 0) {
        const selfClosing = text[at - 1] === '/';
        out.push({
          attrs: text.slice(found.index! + found[0].length, at - (selfClosing ? 1 : 0)),
          end: at + 1,
          selfClosing,
        });
        break;
      }
      at++;
    }
  }
  return out;
}

/* The components Admin.tsx renders as whole pages. Each is a page in its own
 * right, so each starts its headings at the same level: a reader moving
 * between them should not find the hierarchy shifting under them.
 * ui/admin/Boards.tsx is deliberately not here. It is a section used inside a
 * page and starts at h3 because that is what it is. */
const PAGES = [
  'ui/admin/Rigs.tsx',
  'ui/admin/Devices.tsx',
  'ui/admin/Nodes.tsx',
  'ui/admin/Firmware.tsx',
  'ui/admin/RoomDefaults.tsx',
];

describe('buttons', () => {
  it('an icon button says what it does', () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const tag of tags(file.text, 'button')) {
        const body = file.text.slice(tag.end).split('</button>')[0];
        const words = body.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '');
        const iconOnly = body.includes('<Icon') && !/[A-Za-z]{2,}/.test(words);
        if (iconOnly && !tag.attrs.includes('aria-label')) {
          bad.push(`${file.name}: an icon button with nothing to read`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('an action is a button, not a div that listens for clicks', () => {
    /* A div with an onClick cannot be tabbed to, cannot be pressed with a
     * keyboard and is announced as nothing. The fix is always the same and is
     * never more work: use a button. */
    const bad: string[] = [];
    for (const file of files) {
      for (const name of ['div', 'span', 'td', 'li']) {
        for (const tag of tags(file.text, name)) {
          if (/\bonClick=/.test(tag.attrs)) {
            bad.push(`${file.name}: a <${name}> with onClick`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('inputs', () => {
  it('every control a person can reach is labelled', () => {
    /* Three ways count, because all three reach a screen reader: an
     * aria-label, an id that a <label htmlFor> points at, or sitting inside a
     * <label> with words of its own. A placeholder is not one of them: it
     * disappears the moment somebody types.
     *
     * `hidden` is exempt. The file input behind an upload button is hidden and
     * clicked by the button, so what needs the label is the button. */
    const bad: string[] = [];
    for (const file of files) {
      for (const tag of tags(file.text, 'input')) {
        const attrs = tag.attrs;
        if (/\bhidden\b/.test(attrs) || attrs.includes('type="hidden"')) continue;
        if (attrs.includes('aria-label') || /\bid=/.test(attrs)) continue;
        const before = file.text.slice(0, tag.end);
        if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) continue;
        bad.push(`${file.name}: unlabelled input ${attrs.trim().split('\n')[0].slice(0, 50)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('components from a library', () => {
  it('are reached through a wrapper, not used directly by pages', () => {
    /* One project component stands in front of each copied one. Three
     * reasons, and the third is the one that matters later: the app keeps
     * speaking its own vocabulary (Confirm, not AlertDialog); swapping or
     * dropping a library touches one file; and the wrapper is a place a
     * rendering test can live, which is the only kind of test that can see
     * these at all. */
    const wrappers = ['ui/Confirm.tsx', 'ui/Modal.tsx', 'ui/Tip.tsx'];
    const bad: string[] = [];
    for (const file of all) {
      if (file.name.startsWith('ui/shad/') || wrappers.includes(file.name)) continue;
      if (/from '[^']*\/shad\//.test(file.text)) {
        bad.push(`${file.name} imports a shadcn component directly`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keep their utility classes to themselves', () => {
    /* tailwind.config.js only scans ui/shad, so a utility class written
     * anywhere else is not generated and does nothing at all. Caught here
     * rather than left to be discovered as an element that simply ignores
     * the padding it was given. */
    const utility =
      /className="[^"]*\b(?:flex|grid|p-\d|px-\d|py-\d|mt-\d|gap-\d|text-(?:sm|lg|xs)|rounded-(?:sm|md|lg)|bg-(?:card|popover|background|primary|secondary|muted|destructive))\b/;
    const bad: string[] = [];
    for (const file of files) {
      if (utility.test(file.text)) bad.push(`${file.name} uses a Tailwind utility`);
    }
    expect(bad).toEqual([]);
  });
});

describe('headings', () => {
  it('every admin page starts at the same level', () => {
    const bad: string[] = [];
    for (const name of PAGES) {
      const file = files.find((f) => f.name === name);
      expect(file, `${name} should exist; update PAGES if it moved`).toBeTruthy();
      const first = file!.text.match(/<h([1-6])\b/);
      if (!first) bad.push(`${name}: a page with no heading at all`);
      else if (first[1] !== '2') {
        bad.push(`${name}: starts at h${first[1]}, every other page starts at h2`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no file skips a heading level', () => {
    /* h2 then h4 reads as a missing section to anything navigating by
     * heading, which is how a screen reader moves around a page. */
    const bad: string[] = [];
    for (const file of files) {
      const levels = [...file.text.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
      let deepest = 0;
      for (const level of levels) {
        if (deepest && level > deepest + 1) {
          bad.push(`${file.name}: h${deepest} followed by h${level}`);
          break;
        }
        deepest = Math.max(deepest, level);
      }
    }
    expect(bad).toEqual([]);
  });
});
