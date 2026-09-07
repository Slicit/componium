Read LOGBOOK.md

## Before you commit

    hack/check-edits.sh          # a second, run it after every edit
    hack/check-edits.sh --full   # adds the typecheck and both test suites

It catches the failures that tests do not: a file whose line endings changed, a
backtick a shell ate, a Go file gofmt would reformat. Two of those have shipped
here, and both left code that still parsed and still built.

## The web code

```sh
cd web
npx oxlint src         # errors fail CI, warnings are the backlog
npx oxfmt --write src  # formatting is not a review topic
```

oxlint runs at two levels on purpose. `error` is the line CI holds and the
tree is clean of them, so anything that trips one is something a branch
just added. `warn` is a written down backlog: each rule in
`web/.oxlintrc.json` carries the count it had when it was set, so it is a
number that can be watched going down. Promoting a warn to an error is how
this gets stricter, one rule and one small commit at a time.

A rule that is off has a sentence saying why, and every one of them was
judged against the code rather than silenced: `prefer-tag-over-role` is
wrong about custom widgets built the way ARIA says to build them, and
`control-has-associated-label` was wrong all 23 times it fired here.

It is worth knowing that oxlint found a real gap the project's own house
rules had missed: the pane splitters could not be resized from a keyboard.
The house rules look for `onClick` on a non-interactive element, and those
handlers were `onPointerDown`. A rule written from memory catches the cases
its author thought of.

## The browser suite

```sh
cd web
npm run test:e2e            # starts its own studio and dev server, stops them again
```

Thirteen specs in real Chromium, and they are deliberately few. Anything that
can be proven in vitest is proven in vitest, because 749 unit tests run in
seventeen seconds and this runs in thirty for thirteen.

What belongs there is only what jsdom structurally cannot answer: whether
something is actually visible (it does no layout and stacks nothing), whether
a keyboard reaches it (focus never moves on its own), and whether a real input
event does what a synthetic one claimed (Radix inspects where a PointerEvent
came from, and `new Event('pointerdown')` carries none of that).

Each of those has already shipped past a green suite here. See
`web/e2e/README.md`, and prefer `npx playwright show-trace` over adding logs.

## Editing a file

**Never put a program inside an ssh argument.** A heredoc or a quoted command
goes through the local shell first, and the local shell eats backticks,
apostrophes and backslashes on the way. It has emptied TypeScript template
literals and Go struct tags in this repo, and both times the result still
compiled. Write the program to a file, copy the file, run the file.

**Say how many times a replacement should match.** `sed -i` and `str.replace`
will happily change nothing, or change five things when you meant one, and both
are silent about it. `hack/patchfile.py` does the counting:

    import sys; sys.path.insert(0, "hack")
    from patchfile import edit

    edit("internal/cip/messages.go", [("old", "new")])   # must match once

A wrong count means the file is not what the patch thinks it is, which is worth
finding out before the change lands rather than after. It also writes LF and
refuses a patch that changes nothing.

**After editing anything under `web/src`, rebuild the bundle.** CI compares
`internal/studio/webdist` against a fresh build, and `tsc` and vitest both pass
without it, so nothing local catches this:

    cd web && npm run build     # then commit internal/studio/webdist

## Buttons: icons for the universal, words for the rest

An action with a settled, universal icon uses the icon — delete is a bin, save
a disk, edit a pencil, search a magnifier, paging chevrons. An action without
one keeps its word: Rebuild, Prepare, Reset and Resume have no glyph two people
read the same way, and inventing one produces a row of symbols that must all be
hovered to be understood.

A mixed row is the signal, not an inconsistency: icons are what you do often
and recognise instantly, words are what is worth reading before clicking.

Glyphs are inline SVG in web/src/ui/Icon.tsx — a handful is not worth a
dependency, and an icon font that fails to load leaves squares. Every icon
button carries an aria-label and a title; the svg itself is aria-hidden, or a
screen reader says it twice.

## The rest of the UI rules

These are checked by `web/src/ui/houserules.test.ts`, which fails the build.
They were written down before and drifted anyway, which is why they are now
tests rather than paragraphs.

**An admin page starts at h2, and no file skips a level.** Every page under
`web/src/ui/admin` that Admin.tsx renders whole begins its headings at the same
level, so moving between pages does not shift the hierarchy underfoot. h2 then
h4 reads as a missing section to anything navigating by heading. A component
that is a section inside a page starts lower, and that is correct: Boards.tsx
starts at h3 because it is a section.

**Every control a person can reach is labelled.** An aria-label, an id a
`<label htmlFor>` points at, or sitting inside a `<label>` with words of its
own. A placeholder is not a label: it disappears the moment somebody types. A
`hidden` input driven by a button is exempt, because the button is the thing
that needs the name.

**An action is a button.** Never a div, span, td or li with an onClick: those
cannot be tabbed to, cannot be pressed from a keyboard, and are announced as
nothing. The fix is always the same and is never more work.

## Dependencies

**Nothing younger than two weeks.** The attack this is against is
specific: someone takes over a maintainer account, publishes a version
with an altered build step, and it is pulled into thousands of installs
within hours. It is usually caught, and usually in days. Waiting two weeks
costs almost nothing and puts this project outside that window.

So updates are resolved *as of* a date rather than taken newest-first,
which is the only way the rule reaches transitive packages too:

```sh
cd web
npm install --before="$(date -u -d '15 days ago' +%Y-%m-%dT%H:%M:%SZ)"
npm audit && node ../hack/check-dep-age.mjs
```

Direct ranges are widened to their major on purpose. A range pinned to the
newest patch cannot express "the newest that is old enough": npm is asked
for a version it may not use and gives up rather than falling back.

`hack/check-dep-age.mjs` enforces it and runs in CI on any change to a
lockfile. The escape hatch is `hack/dep-age-allow.json`, and every entry
needs a reason and a date it expires: a security fix worth taking on the
day it lands is a real thing, and a rule with no way to say so out loud
gets deleted the first time it is inconvenient.

**A monthly review, on the first.** `.github/workflows/dependencies.yml`
reports what has moved and what is known to be broken, across npm and Go,
and opens or updates a single issue with it. It does not fail the build
for things being out of date, because that is the normal state of a
project between reviews and a permanently red schedule is one nobody
reads. The gates that do fail run on every push: known vulnerabilities,
and anything too new.

**Node 22.** Node 20 left support in April 2026. `engines` says so and CI
runs it.

## The timeline

It is three layers pointing downward: `core/` is the model, `render/`
turns a score and a view into a list of primitives, `ui/Timeline.tsx` owns
pixels and pointers. The renderer never touches a canvas, which is the only
reason the drawing is tested at all. Everything the component draws arrives
as a prop.

`web/src/core/layering.test.ts` fails the build if a layer reaches upward.
Improving it is expected; growing it needs an argument that says which
layer the new thing belongs in. See ADR 0009.

## Numbers on the wire

A value is announced at the resolution the hardware has, not at the resolution
a float happens to print. Three decimals for anything 0..1, because the PWM
timer is ten bits. See ADR 0008 — the digits are not cosmetic, and once took a
board off the network.
