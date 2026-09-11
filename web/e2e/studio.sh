#!/bin/sh
# A studio with nothing real behind it, for the browser suite to drive.
#
# The suite must never touch the films and scores on the machine it runs on. A
# spec that saved a score would be editing somebody's work, and the box this
# is developed on has real films and real scores on it. So this builds a whole
# throwaway tree under a temp directory and points a studio at that.
#
# playwright.config.ts starts it and stops it again. Run it by hand to look at
# the same fixture in a real browser:
#
#     web/e2e/studio.sh          # then open the vite dev server against it
#
set -eu

here=$(cd "$(dirname "$0")/../.." && pwd)
cd "$here"

port=${COMPONIUM_E2E_PORT:-8798}
root=${COMPONIUM_E2E_ROOT:-/tmp/componium-e2e}

rm -rf "$root"
mkdir -p "$root/films" "$root/scores" "$root/rigs" "$root/state"

# The films are empty files. The picker lists names and nothing here plays one,
# so a byte of video would only make the fixture slow to build. The names are
# real though, release-named and long, because a short tidy name is exactly the
# case where a search box looks unnecessary.
for film in \
    "Rebel.Moon.Part.Two.The.Scargiver.2024.MULTi.1080p.WEB.H265-CHiLL.mkv" \
    "Wanted.2008.MULTi.TRUEFRENCH.1080p.BluRay.x264-FiDO.mkv" \
    "Sintel.2010.1080p.x264.mkv" \
    "Tears.of.Steel.2012.1080p.mkv" \
    "big-buck-bunny.mp4"
do
    : > "$root/films/$film"
done

# The studio is private, so it makes an administrator on its first start and
# leaves the password in $root/state. e2e/global-setup.ts reads it there and
# signs in once for the whole run.

# One score, so the timeline has cues and curve points to right click on, and
# one rig so the instruments those cues name actually exist. Both are the
# examples the README tells a newcomer to run, which means a fixture that goes
# stale is a broken example rather than a private breakage.
cp examples/demo.componium "$root/scores/Sintel.2010.1080p.x264.componium"
cp examples/demo-rig.toml "$root/rigs/demo-rig.toml"

# Two rigs, not one. The studio's rig picker hides itself when there is
# nothing to choose between, which is right, and meant that no screenshot
# and no spec had ever seen it: a control that only exists on a shelf with
# two things on it needs a fixture with two things on it.
cp examples/room-rig.toml "$root/rigs/room-rig.toml"

exec go run ./cmd/componium studio \
    -score "$root/scores/Sintel.2010.1080p.x264.componium" \
    -media "$root/films" \
    -scores "$root/scores" \
    -rig "$root/rigs" \
    -users "$root/state/users.toml" \
    -addr "127.0.0.1:$port"
