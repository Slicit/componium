Read LOGBOOK.md

## Before you commit

    hack/check-edits.sh          # a second, run it after every edit
    hack/check-edits.sh --full   # adds the typecheck and both test suites

It catches the failures that tests do not: a file whose line endings changed, a
backtick a shell ate, a Go file gofmt would reformat. Two of those have shipped
here, and both left code that still parsed and still built.

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
