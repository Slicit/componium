---
status: shipped
branch: feat-e2e-and-docs
---

# A browser suite, for the things jsdom cannot answer

## Intent

Three pieces of behaviour in the studio had no test, and each of them had a
comment saying so. The film picker's dismissal on an outside press, the
right-click menu's arrow keys, and Tab leaving the picker rather than being
trapped by it. All three were written down as gaps rather than asserted around,
which was the right call at the time and left the project with three
paragraphs where it wanted three tests.

The wall was always the same one. jsdom does no layout, so nothing about
stacking or visibility is observable in it; it moves focus for nobody, so
`data-highlighted` is never set and a menu with no keyboard looks exactly like
a menu with a good one; and it cannot produce a PointerEvent that satisfies a
library which inspects where the event came from.

Stream Composer, the sibling project, had already hit all of this and solved
it with Playwright against real Chromium. This is that, adapted.

## Decisions

- **2026-09-07 · Node 22 on the development box first.** `engines` has said
  `>=22.12.0` for weeks and CI has run 22 for as long, and the box was on
  20.19.2. That is not a footnote: on Node 20 the suite printed a confident
  green summary while 22 of its 53 files had failed to start, because jsdom 30
  needs `markAsUncloneable`, which is a Node 22 API. The box now runs 22.23.2
  and reports 749 tests across 53 files, which is what CI reports. Installing
  Playwright on a runtime the project does not support would have been building
  on that.

- **2026-09-07 · A throwaway studio over fixture films, not the real one.**
  `web/e2e/studio.sh` builds a tree under `/tmp` on every run and points a
  studio at it. The alternative, running against the studio already on the box,
  means a spec that saves is editing somebody's actual work, and this box has
  real films and real scores on it. The fixture uses `examples/demo.componium`
  and `examples/demo-rig.toml` rather than private files, so a fixture that
  goes stale is a broken example a newcomer would have hit anyway.

- **2026-09-07 · Against the vite dev server, not the deployed bundle.** The
  container on this box serves CI's image of `main`. Testing a branch through
  it has already cost a day here, because the old binary dropped a new field
  silently and every symptom pointed at the branch. `vite.config.ts` takes its
  proxy target from `COMPONIUM_STUDIO` now, defaulting to the port a person
  uses by hand, so the suite can point it somewhere else without changing what
  anyone else gets.

- **2026-09-07 · The visibility check is a hit test, not a style assertion.**
  Asking whether `z-index` is 50 would have passed on the broken version: the
  value was right, and the stacking context it applied in was not. So the spec
  asks the browser what is painted at the option's own centre and insists it is
  the option, then does it again through `hover()`, which fails its
  actionability check if anything covers the target. Both are things only a
  compositor can answer.

- **2026-09-07 · One worker.** Both servers are shared and the studio holds one
  score. Stream Composer found this on a 2-CPU runner after it never once
  surfaced on a 1-CPU dev box, which is the kind of bug that is cheaper to
  inherit than to rediscover.

- **2026-09-07 · The menu does not wrap, and that is now written down.** The
  first version of the arrow-key spec asserted that ArrowDown past the last
  item returns to the first. It does not: the library's default is to stop, and
  the spec was asserting a preference rather than the behaviour. Left as it is
  and documented, with Home, End and typeahead covered instead, which are the
  rest of the sentence `Menu.tsx` claims and none of which had ever been
  checked.

- **2026-09-07 · Reopening immediately after Escape is a race, and the test is
  the only thing fast enough to hit it.** Closing restores focus to the trigger
  asynchronously; reopening within those few milliseconds gets the search box
  focused and then unfocused by the previous close finishing. The spec waits
  for the list to be gone, with a comment saying why, rather than a bare
  timeout.

## Verification

`npm run test:e2e` on claude-machine-02: 13 specs, all passing, about 30
seconds after the servers are up.

Three of them are the gaps this was built for, and each replaced a comment:
the outside press, the menu's arrow keys stepping over a disabled label, and
Tab leaving. Two more cover things nothing had ever checked, in either suite:
Home, End and typeahead in the menu, and the picker's list being genuinely on
top of the page rather than merely having a large z-index.

It also runs in CI as its own `browser` job, and the image job now waits for
it. The run uploads its report on failure, so a red build is readable without
reproducing it.

## Links

- Branch: `feat-e2e-and-docs`
- `web/e2e/README.md` for what belongs in this suite and what does not
- Related: [[feat-timeline-v2]] (the menu and its keyboard),
  [[feat-score-editing]] (what the menu's items do)
- The suite it is modelled on: `react-app/e2e` in Slicit/stream-composer
