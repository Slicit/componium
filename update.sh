#!/usr/bin/env bash
#
# Update an existing Componium install in place.
#
#   /opt/componium/update.sh
#
# install.sh already does this: re-running it finds the existing .env, keeps
# every answer and every secret, redownloads the compose files and examples,
# pulls the new image and restarts. That upgrade path is the right one; it is
# simply not obvious that the installer is also the updater. This is that
# command, spelled the way somebody would look for it.
#
# Anything passed here is handed to install.sh, so a particular version still
# works:
#
#   ./update.sh --version v0.2.0
#
# What it does not touch: your films, your scores, your rigs, the board list,
# or the database. Those are bind mounts and a named volume, and an update
# replaces containers, not data.
#
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

if [ ! -f install.sh ]; then
  echo "install.sh is not beside update.sh; run this from the install directory." >&2
  exit 1
fi

# --dir is the whole point of running this copy rather than a fresh one.
#
# Without it, install.sh falls back to its default of /opt/componium, so an
# install anywhere else upgraded a directory it had nothing to do with and
# created it if it was not there. The install being upgraded was left
# untouched, on the old image, reporting success.
exec ./install.sh --yes --dir "$here" "$@"
