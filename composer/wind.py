"""What makes air move in a film, and how hard to blow.

The fan used to be driven by one signal: forward optical expansion, smoothed.
The reasoning was sound as far as it went, and it went one step. Measured on
big-buck-bunny, the four moments it chose to blow hardest were a tranquil
garden, a perched bird singing, a rabbit standing still, and a squirrel hanging
from a branch, all of them labelled calm. Twenty-five of the twenty-nine
moments whose description plainly describes moving air had the fan off. See
LOGBOOK/experiments/README-wind-causes.md.

The fault is not tuning. Expansion cannot tell moving through air from looking
closer at a thing, because those make the same picture. It is a push-in
detector, and a push-in detector is a fine thing to have as one input.

A film moves air for four different reasons, and they behave differently:

  carried   Riding, driving, flying, falling. A level that persists while the
            travelling does, and the only one expansion sees at all.
  weather   Wind in the world: trees bending, grass laid flat, hair pulled,
            debris carried past. The camera is often perfectly still, which is
            exactly what expansion reads as nothing.
  flight    Being the thing in the air. Related to carried and worth its own
            name, because a glide is sustained and a dive is not.
  blast     An explosion or shockwave. Not a level at all: a fast attack and a
            decay, over in a couple of seconds.

Taken as a maximum rather than a sum. A blast during a glide is a blast, and
adding them would make the arithmetic decide something the film did not.

## About the word matching, which is a stopgap and should be read as one

The vision pass has no word for wind. Its permitted effects are explosion,
lightning, fire, smoke, dust, splash and rain, so nothing in the vocabulary
means wind, flight, falling or speed, and the labels alone cannot answer this.

What it does write is a sentence per frame describing what is happening, and
those sentences say "sways gently in the breeze" and "soars through the sky".
Reading them is unglamorous and it is evidence already on disk, which matters
more than it sounds: the vision pass is the one thing here that costs a GPU and
an hour, and every film already analysed can be improved without paying it
again.

It is still keyword matching over prose from a model, and it will miss wind
described in words nobody listed. The durable fix is the prompt, which now asks
for these directly; that only helps a film analysed after the change, which is
why both exist.
"""

# The words, kept as data because they are the part most likely to be wrong and
# the part somebody will want to argue with.
#
# Split by how much a word means on its own, which is the lesson of measuring
# the first version of this: a list of words is read as an invitation to find
# them, and prose about a film is full of small things doing wind-like verbs.
#
# On the first pass over big-buck-bunny this fired at 0.55 for "a purple
# butterfly fluttering nearby", at 0.70 for "a butterfly flies past", and at
# 0.70 for "rain visibly falling". A butterfly is not weather and rain falling
# is not the viewer falling. What those have in common is that the sentence
# names something small doing the moving, and the fan is about what is
# happening to the person in the seat.

# Words that mean moving air whatever else the sentence says. Air itself is the
# subject: there is no small thing that can be a gale.
WEATHER_PLAIN = (
    "wind", "windy", "windswept", "gale", "gust", "gusting", "breeze", "breezy",
    "storm", "stormy", "blizzard", "howling",
)

# Words that mean moving air only when something else agrees. Each of these has
# an innocent reading: a character sways, a flag flutters, a cloak billows in a
# still room.
WEATHER_MAYBE = (
    "blowing", "blown", "billowing", "swaying", "sways", "rustling",
    "whipping", "fluttering",
)

# Being carried through air. Every one of these is ambiguous in the same way,
# because the sentence rarely says whose point of view it is: "a squirrel
# soars" is the ride when the camera is with it and is scenery when it is not.
# So all of them want corroboration.
FLIGHT_WORDS = (
    "flying", "flies", "soars", "soaring", "gliding", "glides", "swooping",
    "swoops", "diving", "dives", "plunging", "plunges", "falling", "falls",
    "plummeting", "tumbling",
)

RIDE_WORDS = (
    "racing", "speeding", "rushing", "hurtling", "galloping", "chasing",
    "charging", "sprinting", "careening",
)

BLAST_LABELS = ("explosion",)

# What the vision pass says when it has been asked directly.
#
# Added to the prompt at the same time as this file, so only a film
# analysed since will carry them. When they are there they are believed
# without corroboration, because they are an answer to the question rather
# than an inference from a sentence about something else: `carried` asks
# about the camera, which is the exact ambiguity the words cannot resolve.
WEATHER_LABELS = ("wind",)
CARRIED_LABELS = ("carried",)

# How hard each cause blows, at full.
#
# Not one, mostly, and deliberately. A fan at full is loud and a room that
# spends a film at full has nothing left to say when something actually
# happens. A blast gets the top of the range because it is two seconds long.
WEATHER_LEVEL = 0.55
FLIGHT_LEVEL = 0.70
RIDE_LEVEL = 0.85
BLAST_LEVEL = 1.0

# What expansion alone is worth without corroboration.
#
# The measured failure: a push-in on a still subject reaching 1.0. Capped
# rather than dropped, because a forward dolly is real evidence of travel and
# is sometimes the only evidence there is. Uncapped when something else agrees
# that the film is moving.
CARRIED_CAP = 0.45

# How long an observation speaks for.
#
# The vision pass looks every two seconds or so, and a description of wind
# describes a condition rather than an instant: grass does not stop swaying
# between frames. Held forward, and a shorter distance backward, because the
# fan has to start before the shot to be at speed during it.
HOLD_AFTER = 3.0
HOLD_BEFORE = 1.0

# How much movement counts as the picture agreeing.
#
# Low, because this is corroboration rather than the signal: the question is
# whether anything at all is going anywhere, and the description is what says
# what. Measured against the glide sequence in big-buck-bunny, where expansion
# runs between 0.2 and 0.5 while the film is plainly flying.
CORROBORATION = 0.18

# A blast is a shape rather than a level.
BLAST_ATTACK = 0.3
BLAST_DECAY = 2.0


def _has(text, words):
    """Whether any of those words appears in a description."""
    if not text:
        return False
    low = text.lower()
    return any(w in low for w in words)


def _spread(level, at, fps, into, before=HOLD_BEFORE, after=HOLD_AFTER):
    """Hold a level around the moment it was observed."""
    first = max(0, int((at - before) * fps))
    last = min(len(into), int((at + after) * fps))
    for i in range(first, last):
        if level > into[i]:
            into[i] = level


def _mark(at, fps, into, before=HOLD_BEFORE, after=HOLD_AFTER):
    """Note that the film is travelling around this moment."""
    first = max(0, int((at - before) * fps))
    last = min(len(into), int((at + after) * fps))
    for i in range(first, last):
        into[i] = True


def _blast(at, fps, into):
    """A gust: up fast, down over a couple of seconds.

    Shaped rather than held, because a shockwave is an event. A fan cannot
    reproduce the front of one and it can reproduce the shape, which is what
    somebody in the seat actually feels.
    """
    start = int(at * fps)
    rise = max(1, int(BLAST_ATTACK * fps))
    fall = max(1, int(BLAST_DECAY * fps))
    for n in range(rise):
        i = start + n
        if 0 <= i < len(into):
            into[i] = max(into[i], BLAST_LEVEL * (n + 1) / rise)
    for n in range(fall):
        i = start + rise + n
        if 0 <= i < len(into):
            into[i] = max(into[i], BLAST_LEVEL * (1 - n / fall))


def causes(observations, frames, fps, expansion=None, corroborate=True):
    """Every wind cause the vision pass can be read for, per frame.

    Returns the level each cause asks for, so a caller can report which one
    spoke. A track nobody can explain is a track nobody trusts.

    Corroboration is the same idea the vision gate already uses for splash,
    which only counts where the model also saw water. Here the ambiguous causes
    need the picture to agree that something is moving: either the frame was
    called active, or the camera is measurably travelling. Without it a
    butterfly crossing a still garden reads as flight.
    """
    weather = [0.0] * frames
    flight = [0.0] * frames
    ride = [0.0] * frames
    blast = [0.0] * frames
    travelling = [False] * frames
    expansion = expansion or []

    def moving(at):
        """Whether the picture agrees that anything is going anywhere."""
        if not corroborate:
            return True
        i = int(at * fps)
        near = expansion[max(0, i - int(fps)):i + int(fps)] or [0.0]
        return max(near) >= CORROBORATION

    for o in observations or []:
        at = float(o.get("t", 0.0))
        said = o.get("seen") or ""
        labels = o.get("labels") or []
        active = "scene-active" in labels
        agreed = active or moving(at)

        # A label first, because it is an answer to the question. The words
        # are what is left when nobody was asked.
        if any(l in WEATHER_LABELS for l in labels):
            _spread(WEATHER_LEVEL, at, fps, weather)
        elif _has(said, WEATHER_PLAIN):
            _spread(WEATHER_LEVEL, at, fps, weather)
        elif _has(said, WEATHER_MAYBE) and agreed:
            _spread(WEATHER_LEVEL, at, fps, weather)

        if any(l in CARRIED_LABELS for l in labels):
            _spread(RIDE_LEVEL, at, fps, ride)
            _mark(at, fps, travelling)
        else:
            if _has(said, FLIGHT_WORDS) and agreed:
                _spread(FLIGHT_LEVEL, at, fps, flight)
                _mark(at, fps, travelling)
            if _has(said, RIDE_WORDS) and agreed:
                _spread(RIDE_LEVEL, at, fps, ride)
                _mark(at, fps, travelling)
        if any(l in BLAST_LABELS for l in labels):
            _blast(at, fps, blast)

    return {"weather": weather, "flight": flight, "ride": ride,
            "blast": blast, "travelling": travelling}


def series(expansion, observations, fps, frames=None):
    """One wind level per frame, from every cause.

    `expansion` is the existing forward-motion signal, already smoothed and
    normalised. It is kept, capped, and uncapped where something else agrees
    the film is travelling.
    """
    if frames is None:
        frames = len(expansion or [])
    if frames <= 0:
        return []
    expansion = list(expansion or []) + [0.0] * max(0, frames - len(expansion or []))
    if not observations:
        # Nothing to corroborate against, so nothing to cap. A film
        # analysed without vision behaves exactly as it did before this
        # existed, rather than quietly losing half its wind because the
        # evidence that would have justified it was never gathered.
        return [round(v, 4) for v in expansion[:frames]]

    found = causes(observations, frames, fps, expansion)
    out = [0.0] * frames
    for i in range(frames):
        carried = expansion[i]
        if not found["travelling"][i]:
            # A push-in on a still subject looks exactly like this and is not
            # wind. Allowed to say something, not allowed to shout.
            carried = min(carried, CARRIED_CAP)
        out[i] = max(carried, found["weather"][i], found["flight"][i],
                     found["ride"][i], found["blast"][i])
    return [round(v, 4) for v in out]


def explain(expansion, observations, fps, frames=None):
    """Which cause is responsible at each frame, for a report.

    Same arithmetic as series, and it exists so that a person can ask why the
    fan is on at a given second and get an answer other than "the numbers".
    """
    if frames is None:
        frames = len(expansion or [])
    expansion = list(expansion or []) + [0.0] * max(0, frames - len(expansion or []))
    found = causes(observations, frames, fps, expansion)

    out = []
    for i in range(frames):
        carried = expansion[i]
        if not found["travelling"][i]:
            carried = min(carried, CARRIED_CAP)
        best, why = carried, "carried"
        for name in ("weather", "flight", "ride", "blast"):
            if found[name][i] > best:
                best, why = found[name][i], name
        out.append((round(best, 4), why if best > 0 else "still"))
    return out
