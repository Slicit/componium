#!/bin/sh
# Everything that catches a mangled edit, in one command.
#
#   hack/check-edits.sh          # the fast ones, a few seconds
#   hack/check-edits.sh --full   # plus the web typecheck and the Go tests
#
# Run this after editing anything, before committing. It exists because the
# ways an edit goes wrong here are not the ways a test suite notices: a
# TypeScript template literal emptied by a shell, a Go struct tag eaten by a
# heredoc and a file that changed line endings all leave code that still parses
# and still builds. Two of the three have shipped.
#
# Ordered cheapest first, and stops at the first failure, so the common case is
# a second and a half.
set -eu

full=no
if [ "${1:-}" = "--full" ]; then
    full=yes
fi

here=$(cd "$(dirname "$0")/.." && pwd)
cd "$here"

say() { printf '%s\n' "$*"; }
fail() { printf '%s\n' "$*" >&2; exit 1; }

# --- carriage returns ----------------------------------------------------
# The repo is LF everywhere and CI enforces it. Caught here first because it
# is the cheapest to check and the most annoying to discover from a CI log.
say "carriage returns"
bad=$(git ls-files -z \
      | xargs -0 grep -Il "$(printf '\r')" 2>/dev/null || true)
if [ -n "$bad" ]; then
    fail "CRLF in tracked files, run: sed -i 's/\r\$//' <file>
$bad"
fi

# --- the mangling signatures --------------------------------------------
# What a shell leaves behind when it has eaten something. An empty template
# literal or an empty Go struct tag is not a thing anybody writes on purpose,
# and both are exactly what survives when backticks are stripped in transit.
say "shell mangling"
if git ls-files '*.ts' '*.tsx' | xargs grep -n '``' 2>/dev/null | grep -v '^\s*//' ; then
    fail "empty template literals: a shell ate the backticks"
fi
if git ls-files '*.go' | xargs grep -n '``' 2>/dev/null; then
    fail "empty struct tag or raw string: a shell ate the backticks"
fi

# --- syntax --------------------------------------------------------------
say "python"
git ls-files '*.py' | while read -r f; do
    python3 -m py_compile "$f" || fail "$f does not compile"
done

# --- the record ----------------------------------------------------------
# Cheap, and it is the thing nothing else notices: a feature file with no
# Intent, a status nobody updated, a [[link]] to a file that was renamed, an
# INDEX.md that has drifted from the files it indexes.
say "logbook"
python3 hack/logbook.py check
python3 hack/logbook.py index --check

say "go format"
unformatted=$(gofmt -l ./cmd ./internal 2>/dev/null || true)
if [ -n "$unformatted" ]; then
    fail "gofmt would change these, run: gofmt -w $unformatted"
fi

say "go build"
go build ./... > /dev/null

if [ "$full" = "no" ]; then
    say ""
    say "ok. --full adds the web typecheck, the web tests and the Go tests."
    exit 0
fi

say "web typecheck"
( cd web && npx tsc --noEmit )

say "web tests"
( cd web && npx vitest run --silent > /dev/null )

say "go tests"
go test ./... > /dev/null

say ""
say "ok, all of it."
