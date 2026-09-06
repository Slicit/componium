# ADR 0010 — A path to shadcn/ui, if we want one

Status: proposed · 2026-09-06

## Context

The studio's interface is hand built: React with no component library, 1,425
lines of CSS with semantic class names, and three runtime dependencies —
react, react-dom and three. Twenty-six components.

That has worked, and the parts of it that work are worth naming before
proposing to change any of them. The theme is eight tokens and reads as one
thing. The icons are eight inline SVGs, deliberately not a dependency. The
house rules are checked by reading the source, which is only possible because
the source says `<button>` when it means a button.

It has also cost real time in one specific place. Every control with a popover,
a focus trap or a keyboard contract has been written from scratch: the menu,
the viewport panel, and now the film picker. Each is about a hundred lines and
each had to be told the things a native control knows for free — Escape closes,
a press outside dismisses, focus goes somewhere sensible, the arrow keys do not
run off the end of a list. That is the work a component library exists to
absorb, and there will be more of it: a dialog, a tooltip, a toast and a
command palette are all things this studio will plausibly want.

shadcn/ui is the usual answer, and it is worth being precise about what it is,
because it is not a dependency in the ordinary sense. It is a set of components
you copy into your own repo, built on Radix primitives for behaviour and
Tailwind for style. What you install is Radix, Tailwind, and a handful of
class-name helpers; what you own afterwards is the component source.

## What it would actually cost here

**Tailwind is a second styling system, not an addition to the first.** The
existing CSS is semantic — `.picker-pop`, `.lib-row` — and Tailwind is
utilities in the markup. Both can run at once, with preflight disabled so
Tailwind's reset does not fight 1,425 lines of existing rules, but "both at
once" is the actual steady state for a long time, and reading the interface
then means knowing which system any given element is dressed by.

**Radix cannot be driven in this project's browser.** The sandboxed preview
pane cannot simulate a click through a Radix Select, and never produces real
render frames. Today that costs nothing, because the hand-built controls are
plain DOM and their tests are jsdom. Under Radix, every popover, dialog and
dropdown becomes a portal with a focus trap that this environment cannot
exercise end to end. Testing does not become impossible — Radix works fine in
jsdom, and these components are tested that way — but the option of checking a
real one by hand largely goes away.

**It would blind the house-rules checks.** `web/src/ui/houserules.test.ts`
reads the source and asserts that icon buttons have a label, that actions are
buttons rather than clickable divs, and that controls are labelled. Radix
renders through `asChild` and Slot, so a `<Button>` in the source is not a
`<button>` in the source. Those checks would silently start passing because
they can no longer see anything, which is the worst way for a check to fail.
Replacing them means rendering components and asserting on the DOM, which is
more scaffolding than the checks currently need.

**The icon rule would come under pressure.** shadcn's examples use
lucide-react. CLAUDE.md says eight glyphs are not worth a dependency, and an
icon font that fails to load leaves squares. That rule can survive — lucide is
optional — but every copied component arrives importing it.

**Bundle.** The main chunk is 301KB and the room is 770KB, so the studio is
not a small page and Radix's per-component cost, a few kilobytes each, is not
what would hurt. Tailwind's output would likely end up smaller than the CSS it
replaces. The cost is the transition, where both exist.

## The part that is genuinely easy

Preserving the theme is not a risk. shadcn reads colours from CSS variables
holding bare HSL triplets, consumed as `hsl(var(--background))`. The existing
palette maps onto its names directly, and the numbers are already known:

| now | value | HSL triplet | shadcn name |
|---|---|---|---|
| `--ground` | `#0d1015` | `218 24% 7%` | `--background` |
| `--surface` | `#141920` | `215 23% 10%` | `--card`, `--popover` |
| `--surface-2` | `#1b222b` | `214 23% 14%` | `--secondary`, `--muted` |
| `--ink` | `#e4e9f0` | `215 29% 92%` | `--foreground` |
| `--muted` | `#8c96a5` | `216 12% 60%` | `--muted-foreground` |
| `--line` | `#232b35` | `213 20% 17%` | `--border`, `--input` |
| `--accent` | `#d8a24a` | `37 65% 57%` | `--primary`, `--ring` |
| `--warn` | `#d66e63` | `6 58% 61%` | `--destructive` |

Written as aliases rather than as a second copy, so there is one palette and
changing a colour still means changing one line.

## Proposal

**Stage 1, worth doing whether or not the rest ever happens.** Express the
palette as HSL triplets under both names, in `index.css`. No dependency, no
build change, nothing to undo. It costs an hour, it makes the theme
machine-readable, and it removes the only part of a future migration that
would otherwise touch every colour in the app.

**Stage 2, only when a specific control justifies it.** Add Tailwind with
preflight disabled and a prefix, and Radix for one component: whichever of
dialog, tooltip or command palette is actually wanted next. New code only, no
rewrites. The question this stage answers is whether two styling systems in
one repo is tolerable in practice, and it answers it at the cost of one
component rather than twenty-six.

**Stage 3, if stage 2 was pleasant.** Replace the hand-built controls that
are genuinely hard, in this order: the menu, the film picker, the viewport
panel. All three are popovers with keyboard contracts, which is exactly where
Radix earns its keep. Before the first one lands, the house-rules checks have
to be rewritten to render and inspect the DOM rather than read source, or they
must be understood to no longer cover anything built this way.

**Never for the timeline, the room, or anything drawing to a canvas.** ADR
0009 says why: those are three layers with a testable seam, and a component
library has nothing to offer a canvas.

## Recommendation

Do stage 1 now. Do not do stage 2 yet.

The honest summary is that this repo has three runtime dependencies and a UI
that works, and the pain a component library removes is real but is currently
about four controls. The cost is a second styling system, a testing story that
this environment makes worse rather than better, and a set of house-rule checks
that would quietly stop seeing anything.

That balance changes if the studio grows the things it does not have yet — a
dialog, a toast, a command palette, a settings surface with many form controls.
At that point the fourth hand-built popover is the argument, and this document
is the plan. Until then the mapping table above is the only part worth
building, because it is the part that makes the decision reversible later.
