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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

/* The only files allowed to reach into ui/shad. Listed in CLAUDE.md too,
 * with a reason each, and the last test in this file insists the two agree:
 * a carve-out that exists only in a test file is one nobody can review. */
const wrappers = [
  'ui/Confirm.tsx',
  'ui/Modal.tsx',
  'ui/Tip.tsx',
  'ui/Menu.tsx',
  'ui/FilmPicker.tsx',
];

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
  'ui/admin/Analysis.tsx',
  'ui/admin/Users.tsx',
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

  it('a word that has a glyph is not shipped as a word', () => {
    /* The icon rule has two halves and only one of them was checked. An action
     * with a settled, universal glyph uses the glyph: delete is a bin, edit is
     * a pencil, save a disk, search a magnifier. Spelling one out costs a row
     * of width to say something a person reads faster as a shape.
     *
     * The library got this right and admin did not, for weeks, in the same
     * table-row idiom: a bin beside a film and the word "remove" beside a rig.
     * Nothing noticed, because the rule was a paragraph.
     *
     * Only whole labels count. "Remove this track" in a menu is a sentence and
     * a menu is a list of sentences; "Save the rig" names what it saves; Reset
     * and Rebuild have no glyph two people would read the same way. It is the
     * bare verb, alone on a button, that had a glyph waiting for it. */
    const glyphed = ['delete', 'remove', 'rename', 'edit', 'save', 'close', 'search'];
    const bad: string[] = [];
    for (const file of files) {
      for (const tag of tags(file.text, 'button')) {
        const body = file.text.slice(tag.end).split('</button>')[0];
        const label = body
          .replace(/<[^>]*>/g, '')
          .replace(/\{[^}]*\}/g, '')
          .trim()
          .toLowerCase();
        if (glyphed.includes(label)) {
          bad.push(file.name + ': a button labelled "' + label + '", which has an icon');
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a download is shaped like the buttons it stands among', () => {
    /* `adm-link` renders an underlined run of text with no padding, which is
     * right for its one real use: a board's name, in a row where picking the
     * board is the point. Three download anchors had borrowed it, and a bare
     * link in a row of buttons sits a few pixels above their baseline and reads
     * as something else entirely.
     *
     * They stay anchors. There is a real file at a real URL, so right click,
     * save as and open in a new tab all work, and none of that survives being
     * turned into a button with a click handler. `dl-link` gives them a
     * button's shape without giving that up. */
    const bad: string[] = [];
    for (const file of files) {
      for (const tag of tags(file.text, 'a')) {
        if (!/\bdownload\b/.test(tag.attrs)) continue;
        if (/adm-link/.test(tag.attrs)) {
          bad.push(file.name + ': a download styled as a name-button');
        } else if (!/dl-link/.test(tag.attrs)) {
          bad.push(file.name + ': a download with no dl-link');
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('pages', () => {
  it('every page uses the shared page shell', () => {
    /* `.page` sets the measure, the padding, and the size of an h2. A page
     * without it starts its headings at the right tag and the wrong size, and
     * the size is the part a reader actually notices.
     *
     * Both halves of this had drifted. Rigs was inside no shell at all, so its
     * title rendered several points larger than the identical tag on the four
     * admin pages beside it. The library, the only page outside admin, was
     * still wearing `.panel`, which is the style of a small box inside the
     * studio, so the one page a person is most likely to open announced itself
     * in 11px uppercase grey. */
    const shells = [...PAGES, 'ui/LibraryPage.tsx'];
    const bad: string[] = [];
    for (const name of shells) {
      const file = files.find((f) => f.name === name);
      if (!file) {
        bad.push(name + ' is missing');
        continue;
      }
      if (!/className="page\b/.test(file.text)) {
        bad.push(name + ' does not use the page shell');
      }
      if (/className="[^"]*\bpanel\b/.test(file.text)) {
        bad.push(name + ' is dressed as a panel');
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

describe('the exceptions register', () => {
  /* CLAUDE.md carries a list of the places these rules deliberately do not
   * reach. It is only worth having if it cannot rot, which is what these three
   * check: that it exists, that everything in it is still real, and that the
   * carve-outs in this file are all in it.
   *
   * The third is the one that matters. Every exception here began as an array
   * in this file with a comment beside it, which is a carve-out only somebody
   * reading the test can find. */
  const REPO = join(SRC, '..', '..');
  const rules = readFileSync(join(REPO, 'CLAUDE.md'), 'utf8');
  const section = (rules.split('## Exceptions to the UI rules')[1] || '').split('\n## ')[0];
  const entries = [...section.matchAll(/^- `([^`]+)` \u00b7 (.+)$/gm)].map((m) => ({
    path: m[1],
    why: m[2],
  }));

  it('is there, and every entry gives a reason', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((e) => e.why.trim().length < 10)).toEqual([]);
  });

  it('names only files that still exist', () => {
    const gone = entries.filter((e) => !existsSync(join(REPO, e.path)));
    expect(gone.map((e) => e.path)).toEqual([]);
  });

  it('accounts for every carve-out this file makes', () => {
    const listed = new Set(entries.map((e) => e.path));
    const undocumented = wrappers.map((w) => 'web/src/' + w).filter((p) => !listed.has(p));
    expect(undocumented).toEqual([]);
    expect(listed.has('web/src/ui/shad/')).toBe(true);
  });
});
