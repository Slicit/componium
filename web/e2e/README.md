# The browser suite

    cd web
    npm run test:e2e                  # all of it, headless
    npx playwright test picker        # one file
    npx playwright test --ui          # watch it happen, needs a display

It starts everything it needs and stops it again: a throwaway studio over
fixture films (`studio.sh`), and the vite dev server pointed at that studio
rather than at a real one. So it tests the working tree, which the deployed
container cannot do, and it never touches the films or scores on this machine.

## What belongs here, and what does not

Almost nothing. There are 749 unit tests and they are faster, clearer and
easier to debug, so a thing that can be proven in vitest is proven in vitest.

What belongs here is what jsdom structurally cannot answer, which so far is
three kinds of question:

- **Is it actually visible?** jsdom does no layout and stacks nothing, so
  every z-index and every overflow is invisible to it. The film picker opened
  underneath the page for a whole milestone with green tests either side.
- **Does the keyboard reach it?** Focus does not move on its own in jsdom, and
  `data-highlighted` is never set, so a menu with no keyboard at all looks
  identical to one with a good keyboard.
- **Does a real input event do what a synthetic one claims?** Radix inspects a
  PointerEvent's provenance. A hand-made `new Event('pointerdown')` carries
  none of it, and a test built on one is checking a string.

If a new spec here does not answer one of those, it probably wants to be a
unit test instead.

## Reading a failure

`trace: 'retain-on-failure'` is on, so a failed run leaves a recording:

    npx playwright show-trace test-results/<the failing test>/trace.zip

It has the DOM at every step, the network, the console, and a screenshot
before and after each action. It is almost always faster than adding a log.

## One worker, on purpose

Both servers are shared and the studio holds one score, so two specs at once
are editing the same document. Stream Composer, the sibling project this suite
was modelled on, found this the expensive way: nothing surfaced on a 1-CPU dev
box, and GitHub's 2-CPU runner defaulted to two workers and broke immediately.

Giving each worker its own studio is a real option if this ever gets slow
enough to want it. Thirteen specs in half a minute is not that.

## The fixture

`studio.sh` builds a tree under `/tmp/componium-e2e` from scratch on every
run: five empty files with real release names, `examples/demo.componium` as
the open score, and `examples/demo-rig.toml` as the rig. Using the examples
rather than a private fixture means a fixture that goes stale is a broken
example somebody would have hit anyway.

The films are zero bytes. Nothing here plays one, and a real film would make
the fixture slow to build and impossible to commit.
