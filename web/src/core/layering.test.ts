/* Which way the imports are allowed to point.
 *
 * The timeline is three layers and it is worth what it is worth because of
 * where the lines are. core/ is the model and the geometry, render/ turns a
 * score and a view into a list of primitives, ui/ owns pixels and pointers.
 * Everything points downward: ui may read core and render, render may read
 * core, and core reads nobody.
 *
 * The rule is not tidiness. render/ can be tested at all only because it never
 * touches a canvas, and core/ can be tested at all only because it never
 * touches React. The moment either reaches upward, the thing that made the
 * timeline testable in a headless environment is gone, and the way you find
 * out is that a canvas draws nothing and looks exactly like one that works.
 *
 * This had already happened once and nobody noticed: core/viewport.ts imported
 * four numbers from ui/useSplit.ts, so the model layer could not be loaded
 * without React. See ADR 0009.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(new URL('..', import.meta.url).pathname.replace(/\/$/, ''), '');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function importsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from|import)\s+'([^']+)'/g)) out.push(m[1]);
  return out;
}

function inLayer(layer: string) {
  return sources(join(SRC, layer)).map((path) => ({
    name: relative(SRC, path),
    imports: importsOf(readFileSync(path, 'utf8')),
  }));
}

describe('the layers point downward', () => {
  it('core knows nothing about React or the UI', () => {
    /* core/ is the model: what a score is, where a lane sits, what a time
     * means. It is loaded by tests that never mount anything, and that is what
     * makes those tests fast and worth having. */
    const bad: string[] = [];
    for (const file of inLayer('core')) {
      for (const spec of file.imports) {
        if (spec === 'react' || spec.startsWith('react/') || /(^|\/)ui\//.test(spec)) {
          bad.push(`${file.name} imports ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('the renderer knows nothing about React, the UI, or a canvas', () => {
    /* render/ turns a score and a view into a DrawList and stops. Something
     * else executes that list against a real context. That seam is the only
     * reason the drawing itself is tested: a draw list can be asserted on in
     * node, and a canvas in this environment cannot be relied on to run at
     * all. Reaching for a CanvasRenderingContext2D here would quietly end
     * that. */
    const bad: string[] = [];
    for (const file of inLayer('render')) {
      for (const spec of file.imports) {
        if (spec === 'react' || spec.startsWith('react/') || /(^|\/)ui\//.test(spec)) {
          bad.push(`${file.name} imports ${spec}`);
        }
      }
    }
    /* paint() is the one place a context appears, and it is the executor
     * rather than the renderer: it takes a list somebody else built. Anything
     * that builds a list must not mention one. */
    for (const file of sources(join(SRC, 'render'))) {
      const text = readFileSync(file, 'utf8');
      const name = relative(SRC, file);
      if (name.endsWith('drawlist.ts')) continue;
      if (text.includes('CanvasRenderingContext2D')) {
        bad.push(`${name} names a canvas context; only the executor may`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the timeline is reached through its props and nothing else', () => {
    /* A component that reads app state directly is a component that only
     * works in this app, at this point in this tree. Everything the timeline
     * draws arrives as a prop, which is why it can be rendered in a test with
     * a handmade score and no application around it at all. */
    const timeline = readFileSync(join(SRC, 'ui/Timeline.tsx'), 'utf8');
    const reachingOut = importsOf(timeline).filter((spec) =>
      spec.includes('useLive') || spec.includes('useRoute')
      || spec.includes('state') || spec.endsWith('/App'));
    expect(reachingOut).toEqual([]);
  });
});
