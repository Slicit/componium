# ADR 0009 — The timeline stays a component

Status: accepted · 2026-09-06

## Context

The timeline is the surface the whole studio is used through. Somebody
reviewing a two hour film spends their entire session inside it: scrubbing,
zooming, reading cues against the picture, dragging points. It works well, and
that is not an accident of the drawing code — it is the shape underneath.

It is also the part most likely to be broken by something well meant. It is the
obvious place to hang a new panel, the obvious component to give direct access
to whatever state a feature needs, and the obvious canvas to draw one more
thing on. Each of those is a small, reasonable edit, and any of them costs the
properties that make it work.

Four of those properties are load bearing, and none of them are visible from
reading `Timeline.tsx` alone.

**It is three layers, pointing downward.** `core/` is the model and the
geometry: what a score is, where a lane sits, what a time means. `render/`
turns a score and a view into a list of primitives. `ui/Timeline.tsx` owns
pixels and pointers and nothing else. Everything points down: ui may read core
and render, render may read core, core reads nobody.

**The renderer never touches a canvas.** It produces a `DrawList` — data — and
something else executes that list against a real context. That seam is the only
reason the drawing is tested at all. A canvas in a headless environment cannot
be relied on to run, and a canvas that draws nothing looks exactly like one that
works. A draw list can be asserted on in node: at this zoom, this cue is a rect
at this x, this tall, in this colour. It is also how the performance budget
becomes measurable, because the length of the list is the work and it can be
counted without painting.

**Text is DOM and lanes are canvas, deliberately.** The track names beside the
lanes are text and buttons and behave like text and buttons: selectable,
focusable, readable by a screen reader. The lanes are canvas because a two hour
score is 45,000 curve points and no arrangement of DOM nodes survives that.

**Redrawing is gated, and the gate is subtle.** Building one draw list on a two
hour score at the zoom people review at costs about five milliseconds, a third
of a frame budget before anything has rasterised. The effect that builds it
once had no dependency array and ran on every commit, so every unrelated slider
elsewhere on the page paid for a full rebuild. The reason it was written that
way is real: the view is a stable mutable object whose identity never changes
when the window is panned, so depending on the object misses every scroll.
Depending on the numbers it holds does not. The same problem produced
`revision`: the score is mutated in place by commands, so a memo keyed on its
identity never recomputes, and adding a track drew nothing.

## Decision

**The timeline stays a standalone component with a props-only interface, and
the three layers keep pointing downward.**

Everything it draws arrives as a prop. It does not reach for application state,
routing, or live playback: it is given a score, a rig, a view, a time and some
callbacks, and it can be rendered in a test with a handmade score and no
application around it at all.

`web/src/core/layering.test.ts` enforces the direction of the imports, and
fails the build. It checks that core imports neither React nor anything under
`ui/`, that the renderer imports neither and never names a
`CanvasRenderingContext2D` outside the executor, and that `Timeline.tsx` does
not import the app's own state hooks.

Writing this down found one violation already in place: `core/viewport.ts`
imported four numbers from `ui/useSplit.ts`, so the model layer could not be
loaded without React. The arithmetic moved to `core/split.ts` and the hook file
re-exports it.

## Consequences

Improving the timeline is expected. Growing it is what needs an argument, and
the argument has to say which layer the new thing belongs in.

A feature that needs the timeline to know something adds a prop. If that feels
like too many props, that is a signal about the feature, not about the rule:
the alternative is a component that only works at one point in one tree, and
that cannot be tested without mounting the application around it.

New drawing goes in `render/` and returns primitives, never a context. If a
primitive is missing from the `DrawList`, add the primitive — that keeps the
new drawing as testable as the drawing already there.

Anything that is text stays DOM. Text drawn onto the canvas cannot be selected,
found by the browser's search, or read aloud, and the reason the names are
beside the lanes rather than in them is that they are text.

Any effect that reads the view depends on its numbers, never on its identity,
and any memo over the score depends on `revision`. Both of those have already
been got wrong once, and both failed silently: one by redrawing far too often,
the other by not redrawing at all.

The layering test is cheap to satisfy and cheap to delete. If a future change
makes it fail, the answer is almost never to relax it: it is the last thing
standing between this component and the ordinary fate of a component that
several features found convenient.
