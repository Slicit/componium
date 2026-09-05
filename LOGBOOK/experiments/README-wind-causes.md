# What the wind track is driven by, and why it is wrong

Measured on `big-buck-bunny.componium`, 596 seconds, against the vision
observations already kept beside it. No model was re-run: the descriptions were
on disk and the question is answerable from them.

Reproduce with `hack/windlook.py <score> <score>.seen.jsonl`.

## What drives it today

One signal, and only one. `motion_est.wind_series` takes the forward optical
expansion between frames, smoothed over 1.5 seconds, and normalises it. That is
the whole model.

The reasoning behind it is sound and is worth keeping: apparent speed was tried
first and is wrong, because a pan across a static room reads maximal while a
forward dolly, the one case where air actually rushes past, cancels to nothing.
Expansion separates them. Measured on synthetic clips: pan 0.0156, dolly 0.0004,
static 0.0000.

The mistake is treating that one signal as the answer rather than as one input.

## What it produces

    0.00 to 0.05    64.1%  of the film
    0.05 to 0.20    17.8%
    0.20 to 0.50    10.4%
    0.50 to 0.80     1.5%
    0.80 to 1.00     6.2%   37 seconds at or near full

## The four moments it chooses to blow hardest

    14.8s  1.00  [scene-calm]  a tranquil garden, a small stream in grass
    21.8s  1.00  [scene-calm]  a bird perched on a branch, singing
    54.5s  1.00  [scene-calm]  a rabbit standing near a cave, looking around
   442.8s  1.00  [scene-calm]  a squirrel hanging upside down, looking surprised

Every one is labelled calm. Every one is a camera pushing in on something
stationary. Expansion cannot tell moving through air from looking closer at a
thing, because those two produce the same picture. The current model is not a
wind detector with a tuning problem; it is a push-in detector.

## And what it sleeps through

    1.0s    fan 0.06  an explosion, orange smoke rising above a tree line
  301.0s   fan 0.00  a field of tall grass swaying in the breeze
  415.0s   fan 0.00  a peach swaying slightly in the breeze
  409-451s fan 0.00 to 0.49, mostly under 0.10, through the entire flying
                     squirrel glide: soars, glides, dives over spikes
  495-567s fan 0.00  rain falling, repeatedly

Of 29 moments whose description plainly describes air moving, 25 had the fan
effectively off.

## Why the vision pass cannot help

It has no word for it. The permitted effects are explosion, lightning, fire,
smoke, dust, splash and rain, plus WATER and SCENE. Across 298 observations of
this film the labels found were: scene-calm 275, scene-active 23, water 21,
splash 13, smoke 4, rain 3, dust 2, fire 1.

Nothing in that vocabulary means wind, flight, falling or speed. The one thing
that comes close, `explosion`, is already detected and is routed to the fogger.
A blast is the clearest wind event a film has and the fan is told nothing about
it.

## What wind actually is, in a film

Four separate causes, and one signal covers a corner of one of them.

- **Being carried through air.** Riding, driving, flying, falling. Expansion
  sees some of this and only when the camera is the thing travelling.
- **Wind in the world.** Trees bending, grass laid flat, hair and clothing
  pulled, debris carried past. The camera may be perfectly still, which is
  exactly the case expansion reads as nothing.
- **A blast.** An explosion or a shockwave, which is a fast attack and a decay
  rather than a level.
- **Sound.** Real wind is broadband noise and a blast is a transient. The audio
  is already decoded for other tracks and contributes nothing here.

## What was done about it

Recorded here first, deliberately, because the fix touches the prompt as well
as the code and the prompt cannot be changed without re-running vision over
every film. See composer/wind.py, which says what it does and what it cannot.
