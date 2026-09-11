#!/bin/sh
# What the installer and the updater do, checked rather than assumed.
#
#   hack/check-install.sh
#
# No Docker and no network: it installs from this checkout into a temporary
# directory and looks at what came out. The two failures it exists for both
# reached a release.
#
#   - update.sh upgraded /opt/componium whatever directory it was in, because
#     it did not tell install.sh where it lived. The install being updated was
#     left on the old image, reporting success.
#   - .env lived under deploy/, which an upgrade replaces wholesale, so the
#     first update deleted every answer.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)

# Both the install and the update read this checkout rather than GitHub, so
# this needs no network and cannot be slowed down or rate limited by one.
#
# What that does not cover is the download itself: fetching a release,
# unpacking it, finding the tree inside it. That path is exercised by
# actually installing a release, which is a thing a person does once per
# release rather than a thing CI should do on every push.
COMPONIUM_SOURCE="$here"
export COMPONIUM_SOURCE
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

dir="$work/install"
media="$work/films"
scores="$work/scores"

fail() { printf 'not ok: %s\n' "$*" >&2; exit 1; }
ok() { printf 'ok   %s\n' "$*"; }

"$here/install.sh" --yes --no-start \
    --dir "$dir" --version main \
    --media "$media" --scores "$scores" \
    --port 9911 --advertise 10.0.0.9 >"$work/install.log" 2>&1 \
    || { cat "$work/install.log" >&2; fail "install.sh did not finish"; }
ok "installs"

[ -f "$dir/.env" ] || fail ".env is not at the root of the install"
grep -q "^COMPONIUM_PORT=9911" "$dir/.env" || fail "the port was not recorded"
grep -q "^COMPONIUM_MEDIA=$media" "$dir/.env" || fail "the media directory was not recorded"
[ -f "$dir/deploy/docker-compose.server.yml" ] || fail "the server compose file is missing"
[ -f "$dir/rigs/demo-rig.toml" ] || fail "the shelf was not seeded"
[ -d "$media" ] && [ -d "$scores" ] || fail "the directories were not made"
ok "writes the answers, seeds a rig, makes the directories"

# A password only ever generated once, or an upgrade invalidates the database
# it is upgrading.
password=$(grep "^COMPONIUM_DB_PASSWORD=" "$dir/.env")
[ -n "$password" ] || fail "no database password was generated"

marker="$work/films/keep-me"
: > "$marker"

# Whether the default directory existed before, so that finding it after
# means this run made it rather than that somebody has Componium installed
# on the machine running the tests. The first version of this check could
# not tell those apart and blamed the wrong thing.
default_before=no
[ -d /opt/componium ] && default_before=yes

"$dir/update.sh" --no-start >"$work/update.log" 2>&1 \
    || { cat "$work/update.log" >&2; fail "update.sh did not finish"; }
ok "updates"

grep -q "$dir" "$work/update.log" || fail "update.sh did not upgrade its own directory"
if [ "$default_before" = "no" ] && [ -d /opt/componium ]; then
    fail "update.sh created /opt/componium from an install somewhere else"
fi
ok "upgrades the install it belongs to, and nothing else"

grep -q "^COMPONIUM_PORT=9911" "$dir/.env" || fail "the port did not survive the update"
grep -q "^COMPONIUM_MEDIA=$media" "$dir/.env" || fail "the media directory did not survive"
grep -q "^COMPONIUM_ADVERTISE=10.0.0.9" "$dir/.env" || fail "the advertise address did not survive"
grep -q "^$password\$" "$dir/.env" || fail "the database password changed on update"
[ -f "$marker" ] || fail "the update touched the films"
ok "keeps every answer, the database password, and your films"

printf '\nall good\n'
