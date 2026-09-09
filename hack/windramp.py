"""Is the ramp the compressor, or is it the wind?

compress() drops a point when it is within a threshold of the LAST KEPT one.
That is a good rule for noticing change and the wrong rule for a curve that is
then read back by linear interpolation: a long flat stretch is dropped
entirely, so there is no point holding the flat value just before a step, and
the reader slides from the last kept point all the way up to the step.
"""
import sys

sys.path.insert(0, "/home/claude/Componium/composer")
import compose                                             # noqa: E402

FPS = 4.0

# Silent for 100 seconds, then a four second gust. Exactly the shape the gate
# produces: zeroes, then a cause.
series = [0.0] * int(100 * FPS) + [0.55] * int(4 * FPS) + [0.0] * int(20 * FPS)
points = [(i / FPS, (v,)) for i, v in enumerate(series)]

kept = compose.compress(points, 0.02)
print("frames in:", len(points), " points kept:", len(kept))
print("kept:", [(round(t, 2), round(v[0], 3)) for t, v in kept])


def read_back(kept, at):
    """What a linear-interpolating reader sees, which is what the fan does."""
    for i in range(len(kept) - 1):
        (t0, v0), (t1, v1) = kept[i], kept[i + 1]
        if t0 <= at <= t1:
            if t1 == t0:
                return v0[0]
            return v0[0] + (v1[0] - v0[0]) * (at - t0) / (t1 - t0)
    return kept[-1][1][0]


print()
print("%8s %10s %10s" % ("second", "written", "read back"))
for at in (0, 25, 50, 75, 99, 100, 102, 104, 110):
    i = min(len(series) - 1, int(at * FPS))
    print("%8.0f %10.3f %10.3f" % (at, series[i], read_back(kept, at)))

blown = sum(1 for at in range(0, 124)
            if read_back(kept, at) > 0.05)
wanted = sum(1 for at in range(0, 124) if series[min(len(series) - 1, int(at * FPS))] > 0.05)
print()
print("seconds the fan should blow: %d" % wanted)
print("seconds it will blow:        %d" % blown)
