"""What the wind track actually does, against what the film actually shows.

Reads a generated score and the vision observations kept beside it. No model is
run: the descriptions are already on disk and re-running the pass costs an hour
of GPU for an answer that is already written down.

The question is not whether the numbers are plausible. It is whether the
moments the fan blows are the moments air would be moving.
"""

import json
import re
import sys

score_path, seen_path = sys.argv[1], sys.argv[2]

# --- the wind curve, straight out of the TOML ---------------------------
text = open(score_path, encoding="utf-8").read()
blocks = text.split("[[track]]")
wind = []
for b in blocks:
    if 'instrument = "wind.main"' not in b:
        continue
    at = None
    for line in b.split("\n"):
        m = re.match(r't = "(\d+):(\d+):([\d.]+)"', line.strip())
        if m:
            at = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        m = re.match(r"intensity = ([\d.]+)", line.strip())
        if m and at is not None:
            wind.append((at, float(m.group(1))))

if not wind:
    print("no wind track in", score_path)
    sys.exit(1)

wind.sort()
values = [v for _, v in wind]
print("wind track: %d points, %.1fs to %.1fs" % (len(wind), wind[0][0], wind[-1][0]))
print()

# --- how much of the film has the fan on --------------------------------
def held(at):
    """The curve holds its last value, so this is what is being sent."""
    last = 0.0
    for t, v in wind:
        if t > at:
            return last
        last = v
    return last

span = wind[-1][0]
step = 1.0
on = [held(t) for t in [i * step for i in range(int(span / step))]]
bands = [(0.0, 0.05), (0.05, 0.2), (0.2, 0.5), (0.5, 0.8), (0.8, 1.01)]
print("how much of the film the fan spends at each level:")
for lo, hi in bands:
    n = sum(1 for v in on if lo <= v < hi)
    print("  %4.2f to %4.2f   %5.1f%%  (%d of %d seconds)"
          % (lo, hi, 100.0 * n / len(on), n, len(on)))
print()

# --- what the film was showing at the windiest moments -------------------
seen = []
for line in open(seen_path, encoding="utf-8"):
    row = json.loads(line)
    seen.append((row["t"], row.get("labels", []), row.get("seen", "")))


def nearest(at):
    best = min(seen, key=lambda r: abs(r[0] - at))
    return best if abs(best[0] - at) <= 4 else None


peaks = sorted(wind, key=lambda p: -p[1])[:12]
print("the twelve windiest moments, and what was on screen:")
for at, v in sorted(peaks):
    row = nearest(at)
    said = row[2] if row else "(nothing seen near this)"
    labs = ",".join(row[1]) if row else ""
    print("  %6.1fs  %.2f  [%s] %s" % (at, v, labs, said[:96]))
print()

# --- and the reverse: what the film showed that the fan ignored ----------
WINDY_WORDS = re.compile(
    r"\b(wind|windy|gale|storm|blow|blowing|blown|gust|breeze|flying|flies|"
    r"fall|falls|falling|fell|dive|diving|plunge|explosion|blast|shockwave|"
    r"speed|speeding|racing|rushing|chase|chasing)\b", re.I)

print("moments the description sounds like moving air, and what the fan did:")
missed = 0
for at, labs, said in seen:
    if not WINDY_WORDS.search(said) and "explosion" not in labs:
        continue
    v = held(at)
    if v < 0.15:
        missed += 1
    print("  %6.1fs  fan %.2f  [%s] %s" % (at, v, ",".join(labs), said[:88]))
print()
print("%d of those had the fan effectively off (under 0.15)." % missed)
