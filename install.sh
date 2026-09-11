#!/usr/bin/env bash
#
# Componium installer.
#
#   curl -fsSL https://raw.githubusercontent.com/Slicit/componium/main/install.sh | bash
#
# Fetches the latest release, asks four questions, writes .env and starts the
# stack. Re-running it upgrades in place and keeps every answer, which is what
# update.sh beside it is.
#
# Non-interactive:
#   curl -fsSL .../install.sh | bash -s -- --yes --media /srv/films --scores /srv/scores
#
set -Eeuo pipefail

REPO="${COMPONIUM_REPO:-Slicit/componium}"
INSTALL_DIR="${COMPONIUM_INSTALL_DIR:-/opt/componium}"
VERSION="${COMPONIUM_VERSION:-latest}"

MEDIA=""
SCORES=""
PORT="8722"
BIND="0.0.0.0"
ADVERTISE=""
WITH_SHOW="no"
ASSUME_YES="no"
START="yes"

# ------------------------------------------------------------------- output

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m'); RED=$(printf '\033[31m')
  GREEN=$(printf '\033[32m'); YELLOW=$(printf '\033[33m'); BLUE=$(printf '\033[34m')
  RESET=$(printf '\033[0m')
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

say()  { printf '%s\n' "$*"; }
info() { printf '%s->%s %s\n' "$BLUE" "$RESET" "$*"; }
ok()   { printf '%s[ok]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s[!]%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '%s[x] %s%s\n' "$RED" "$*" "$RESET" >&2; exit 1; }

# `set -e` aborts without a word wherever something fails unguarded, and for an
# installer that is the worst possible ending: a banner, then the prompt back.
on_error() {
  local status=$?
  # An ERR inside a command substitution fires in a subshell, where `exit` ends
  # only that subshell. Announcing that the installer stopped from there is
  # untrue, and the false alarm buries whatever actually went wrong.
  if [ "${BASH_SUBSHELL:-0}" -gt 0 ]; then
    return "$status"
  fi
  printf '\n%s[x] The installer stopped unexpectedly (exit %s at line %s).%s\n' \
    "$RED" "$status" "${BASH_LINENO[0]:-?}" "$RESET" >&2
  printf '  Please report it with the output above:\n  https://github.com/%s/issues\n' \
    "$REPO" >&2
  exit "$status"
}
trap on_error ERR

banner() {
  printf '\n%s' "$BOLD"
  cat <<'ART'
   .   .   .    Componium
  ( ) ( ) ( )   one score, many instruments
   '   '   '
ART
  printf '%s\n' "$RESET"
}

# ------------------------------------------------------------------ prompts
#
# Piped into bash, stdin is the script itself, so every read comes from the
# terminal directly or not at all.

TTY="/dev/tty"
have_tty() { [ -e "$TTY" ] && [ -r "$TTY" ]; }

ask() { # ask <variable> <question> <default>
  local __var="$1" question="$2" default="${3:-}" answer=""
  if [ "$ASSUME_YES" = "yes" ] || ! have_tty; then
    printf -v "$__var" '%s' "$default"
    return
  fi
  if [ -n "$default" ]; then
    printf '%s %s[%s]%s ' "$question" "$DIM" "$default" "$RESET" > "$TTY"
  else
    printf '%s ' "$question" > "$TTY"
  fi
  IFS= read -r answer < "$TTY" || true
  printf -v "$__var" '%s' "${answer:-$default}"
}

confirm() { # confirm <question> <default yes|no>
  local question="$1" default="${2:-yes}" answer=""
  if [ "$ASSUME_YES" = "yes" ] || ! have_tty; then
    [ "$default" = "yes" ]
    return
  fi
  local hint="[Y/n]"; [ "$default" = "no" ] && hint="[y/N]"
  printf '%s %s%s%s ' "$question" "$DIM" "$hint" "$RESET" > "$TTY"
  IFS= read -r answer < "$TTY" || true
  answer="${answer:-$default}"
  case "$answer" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------- arguments

usage() {
  cat <<EOF
Componium installer

Usage: install.sh [options]

  --media <path>      Where the films are, or should go
  --scores <path>     Where generated scores are kept
  --port <port>       Port for the studio (default: 8722)
  --bind <address>    Address to publish on (default: 0.0.0.0)
  --advertise <host>  This host, as a board on the LAN would reach it
  --with-show         Also run the player, conductor and a software instrument
  --dir <path>        Install directory (default: /opt/componium)
  --version <tag>     Release to install (default: latest)
  --no-start          Write everything and do not start it
  --yes               Accept every default and ask nothing
  --help              Show this message
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --media) MEDIA="${2:-}"; shift 2 ;;
    --scores) SCORES="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --bind) BIND="${2:-}"; shift 2 ;;
    --advertise) ADVERTISE="${2:-}"; shift 2 ;;
    --with-show) WITH_SHOW="yes"; shift ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --no-start) START="no"; shift ;;
    --yes|-y) ASSUME_YES="yes"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1  (try --help)" ;;
  esac
done

# ------------------------------------------------------------ prerequisites

need() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
COMPOSE=""

# Everything that touches the install directory or Docker runs under the same
# privilege as the eventual `compose up`, so a tool that exists for one user and
# not the other is caught here rather than half way through.
resolve_privileges() {
  local parent
  parent="$(dirname "$INSTALL_DIR")"
  if [ "$(id -u)" -eq 0 ]; then return; fi
  if [ -d "$INSTALL_DIR" ] && [ -w "$INSTALL_DIR" ]; then return; fi
  if [ -w "$parent" ]; then return; fi
  need sudo || die "$INSTALL_DIR is not writable and sudo is unavailable. Re-run as root, or pass --dir <somewhere writable>."
  SUDO="sudo"
  info "Using sudo for $INSTALL_DIR and for Docker"
}

# Prints the major version, or nothing. Must never return non-zero: this runs
# inside a command substitution, and under `set -e` with pipefail a failing
# pipeline there kills the installer with no output at all.
compose_major() { # compose_major <command...>
  local out=""
  out="$("$@" version 2>/dev/null)" || return 0
  printf '%s\n' "$out" | grep -oiE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -1 | tr -d 'vV' | cut -d. -f1 || return 0
}

resolve_compose() {
  local candidate major
  for candidate in "$SUDO docker compose" "$SUDO docker-compose"; do
    # shellcheck disable=SC2086
    major="$(compose_major $candidate)"
    [ -n "$major" ] || continue
    if [ "$major" -ge 2 ] 2>/dev/null; then
      COMPOSE="$candidate"
      return
    fi
  done

  # The v2 plugin is often installed per user under ~/.docker/cli-plugins, so it
  # can work for you and not for root. Say that, rather than "not installed".
  if [ -n "$SUDO" ]; then
    for candidate in "docker compose" "docker-compose"; do
      # shellcheck disable=SC2086
      major="$(compose_major $candidate)"
      if [ -n "$major" ] && [ "$major" -ge 2 ] 2>/dev/null; then
        die "Docker Compose works for $(id -un) but not for root, so it is almost certainly under ~/.docker/cli-plugins, and this installer needs it as root.

    sudo apt-get install -y docker-compose-plugin      # Debian / Ubuntu
    sudo dnf install -y docker-compose-plugin          # Fedora / RHEL"
      fi
    done
  fi

  die "Docker Compose v2 is not installed. Add it with:
    sudo apt-get install -y docker-compose-plugin      # Debian / Ubuntu
    sudo dnf install -y docker-compose-plugin          # Fedora / RHEL
Or see https://docs.docker.com/compose/install/"
}

check_prereqs() {
  need curl || need wget || die "Neither curl nor wget is available. Install one and try again."
  need tar || die "tar is required."
  need docker || die "Docker is not installed. Install it first:  curl -fsSL https://get.docker.com | sh"
  $SUDO docker info >/dev/null 2>&1 || \
    die "Docker is installed but not reachable. Start it (systemctl start docker), or add your user to the docker group and log back in."
  resolve_compose
  ok "Docker $($SUDO docker version --format '{{.Server.Version}}' 2>/dev/null || echo present) with $(echo "$COMPOSE" | sed 's/^sudo //')"
}

fetch() { if need curl; then curl -fsSL "$1" -o "$2"; else wget -qO "$2" "$1"; fi; }
fetch_stdout() { if need curl; then curl -fsSL "$1"; else wget -qO- "$1"; fi; }

# --------------------------------------------------------------- download

IMAGE_TAG=""

resolve_version() {
  if [ "$VERSION" != "latest" ]; then
    IMAGE_TAG="${VERSION#v}"
    return
  fi
  local tag
  tag="$(fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[^"]*"([^"]+)".*/\1/' || true)"
  if [ -n "$tag" ]; then
    VERSION="$tag"
    IMAGE_TAG="${tag#v}"
  else
    # No release yet, or no reach. `main` is a real published tag, so this is a
    # working install rather than a failure, and it says so.
    warn "No published release found; installing from the main branch."
    VERSION="main"
    IMAGE_TAG="main"
  fi
}

download_bundle() {
  local tmp url src item

  # A checkout already on this machine, rather than a download. Useful for
  # installing an unreleased branch, and it is what the test uses: an
  # installer that can only be tested after it is published is one whose
  # first real run is somebody else's server.
  if [ -n "${COMPONIUM_SOURCE:-}" ]; then
    src="$COMPONIUM_SOURCE"
    [ -d "$src/deploy" ] || die "$src does not look like a Componium checkout."
    info "Installing from $src"
    install_from "$src"
    return
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  if [ "$VERSION" = "main" ]; then
    url="https://codeload.github.com/$REPO/tar.gz/refs/heads/main"
  else
    url="https://codeload.github.com/$REPO/tar.gz/refs/tags/$VERSION"
  fi

  info "Downloading $VERSION"
  fetch "$url" "$tmp/bundle.tar.gz" || die "Could not download $VERSION from $REPO."
  mkdir -p "$tmp/extract"
  tar -xzf "$tmp/bundle.tar.gz" -C "$tmp/extract"

  src="$(find "$tmp/extract" -maxdepth 2 -name deploy -type d -print -quit)"
  [ -n "$src" ] || die "The downloaded archive does not look like Componium."
  install_from "$(dirname "$src")"
}

# install_from copies a checkout into place, keeping nothing but .env.
#
# .env lives at the root of the install directory rather than inside
# deploy/, which this replaces wholesale on every upgrade. That is not a
# detail: an .env under deploy/ would be deleted by the first update, and
# the symptom is a studio that comes back up looking at empty directories
# because every path it was told about is gone.
install_from() { # install_from <checkout>
  local src="$1" item
  $SUDO mkdir -p "$INSTALL_DIR"
  for item in deploy examples docs README.md LICENSE install.sh update.sh; do
    [ -e "$src/$item" ] || continue
    $SUDO rm -rf "${INSTALL_DIR:?}/${item:?}"
    $SUDO cp -R "$src/$item" "$INSTALL_DIR/$item"
  done
  # The demonstration compose file comes along, and its .env does not: it
  # names this developer box's own paths.
  $SUDO rm -f "$INSTALL_DIR/deploy/.env"
  $SUDO chmod +x "$INSTALL_DIR/install.sh" "$INSTALL_DIR/update.sh" 2>/dev/null || true
  ok "Installed $VERSION into $INSTALL_DIR"
}

# -------------------------------------------------------------- configure

read_existing() { # read_existing <key>
  [ -f "$INSTALL_DIR/.env" ] || return 0
  $SUDO grep -E "^$1=" "$INSTALL_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true
}

guess_address() {
  local guess
  guess="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}' | head -1)"
  [ -n "$guess" ] || guess="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  printf '%s' "$guess"
}

configure() {
  local upgrade="no" previous
  if [ -f "$INSTALL_DIR/.env" ]; then
    upgrade="yes"
    info "An existing configuration was found; keeping your settings."
    MEDIA="${MEDIA:-$(read_existing COMPONIUM_MEDIA)}"
    SCORES="${SCORES:-$(read_existing COMPONIUM_SCORES)}"
    previous="$(read_existing COMPONIUM_PORT)"; [ -n "$previous" ] && PORT="$previous"
    previous="$(read_existing COMPONIUM_BIND)"; [ -n "$previous" ] && BIND="$previous"
    previous="$(read_existing COMPONIUM_ADVERTISE)"; [ -n "$previous" ] && ADVERTISE="$previous"
    previous="$(read_existing COMPONIUM_PROFILES)"; [ "$previous" = "show" ] && WITH_SHOW="yes"
    confirm "Review the settings again?" "no" || return
  fi

  say ""
  say "${BOLD}Where do the films live?${RESET}"
  say "${DIM}  A directory on this host. Films are large and are yours, so they stay"
  say "  a plain directory you can copy into and back up, not a Docker volume"
  say "  only Docker can reach.${RESET}"
  ask MEDIA "  Films:" "${MEDIA:-$INSTALL_DIR/media}"
  ask SCORES "  Scores this makes:" "${SCORES:-$INSTALL_DIR/scores}"

  say ""
  say "${BOLD}The studio${RESET}"
  ask PORT "  Port:" "$PORT"
  if [ -z "$ADVERTISE" ]; then ADVERTISE="$(guess_address)"; fi
  say "${DIM}  Only used when a board is told to update its own firmware: it needs an"
  say "  address it can reach, and a container cannot work out its host's.${RESET}"
  ask ADVERTISE "  This host, on the network your boards are on:" "$ADVERTISE"

  say ""
  if [ "$WITH_SHOW" = "no" ]; then
    say "${BOLD}Is this machine also the one in the room?${RESET}"
    say "${DIM}  Adds a player, the conductor and a software instrument. Say no for a"
    say "  server that only holds films and makes scores; you can add it later"
    say "  by re-running this with --with-show.${RESET}"
    if confirm "  Run the show side too?" "no"; then
      WITH_SHOW="yes"
    fi
  fi
}

# ------------------------------------------------------------------- write

make_dirs() {
  local d
  for d in "$MEDIA" "$SCORES" "$INSTALL_DIR/rigs" "$INSTALL_DIR/state" "$INSTALL_DIR/firmware"; do
    $SUDO mkdir -p "$d"
    # Owned by whoever will run the containers, because they run as that uid
    # and a root-owned films directory is an upload that fails with no reason
    # a person could act on.
    $SUDO chown "$(id -u):$(id -g)" "$d" 2>/dev/null || true
  done

  # A studio with an empty shelf has nothing to open. Seed one rig, once: the
  # virtual example, which drives nothing and proves the whole path.
  if [ -z "$($SUDO ls -A "$INSTALL_DIR/rigs" 2>/dev/null)" ]; then
    $SUDO cp "$INSTALL_DIR/examples/demo-rig.toml" "$INSTALL_DIR/rigs/demo-rig.toml"
    $SUDO chown "$(id -u):$(id -g)" "$INSTALL_DIR/rigs/demo-rig.toml" 2>/dev/null || true
    info "Put the example rig on the shelf; edit it in the studio under Admin."
  fi
}

write_env() {
  local tmp profiles=""
  [ "$WITH_SHOW" = "yes" ] && profiles="show"
  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
# Written by install.sh on $(date -u '+%Y-%m-%d %H:%M:%S UTC').
# Re-running the installer keeps these values.

COMPOSE_FILE=deploy/docker-compose.server.yml
COMPOSE_PROJECT_NAME=componium
COMPOSE_PROFILES=$profiles

COMPONIUM_IMAGE=ghcr.io/slicit/componium
COMPONIUM_TAG=$IMAGE_TAG

# Your files. Plain directories on this host, on purpose: see the comment at
# the foot of docker-compose.server.yml.
COMPONIUM_MEDIA=$MEDIA
COMPONIUM_SCORES=$SCORES
COMPONIUM_RIGS=$INSTALL_DIR/rigs
COMPONIUM_STATE=$INSTALL_DIR/state
COMPONIUM_FIRMWARE=$INSTALL_DIR/firmware

# The containers write to those directories as this uid, so it has to be the
# one that owns them.
COMPONIUM_UID=$(id -u)
COMPONIUM_GID=$(id -g)

COMPONIUM_BIND=$BIND
COMPONIUM_PORT=$PORT
COMPONIUM_ADVERTISE=$ADVERTISE
COMPONIUM_PROFILES=$profiles

COMPONIUM_DB_PASSWORD=$(read_existing COMPONIUM_DB_PASSWORD || true)

# The vision seam. Naming a command turns frame labelling on for every film
# analysed here; without one the composer works from audio, luminance, motion
# and subtitles, which is most of what it uses anyway.
COMPONIUM_VLM_COMMAND=$(read_existing COMPONIUM_VLM_COMMAND || true)
COMPONIUM_VLM_HOST=$(read_existing COMPONIUM_VLM_HOST || true)
COMPONIUM_VLM_MODEL=$(read_existing COMPONIUM_VLM_MODEL || true)
COMPONIUM_VLM_API=$(read_existing COMPONIUM_VLM_API || true)
COMPONIUM_VLM_EVERY=$(read_existing COMPONIUM_VLM_EVERY || true)
COMPONIUM_VLM_WORKERS=$(read_existing COMPONIUM_VLM_WORKERS || true)
COMPONIUM_VLM_FRAMES=$(read_existing COMPONIUM_VLM_FRAMES || true)

TZ=$(cat /etc/timezone 2>/dev/null || echo UTC)
EOF

  # A password only on a first install, so an upgrade never invalidates the
  # database it is upgrading.
  if ! grep -qE '^COMPONIUM_DB_PASSWORD=.+' "$tmp"; then
    local generated
    generated="$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    sed -i "s|^COMPONIUM_DB_PASSWORD=.*|COMPONIUM_DB_PASSWORD=$generated|" "$tmp"
  fi

  $SUDO cp "$tmp" "$INSTALL_DIR/.env"
  $SUDO chmod 600 "$INSTALL_DIR/.env"
  rm -f "$tmp"
  ok "Configuration written to $INSTALL_DIR/.env"
}

# ------------------------------------------------------------------ launch

launch() {
  cd "$INSTALL_DIR"
  info "Pulling images"
  $COMPOSE pull 2>&1 | tail -3 || warn "Some images could not be pulled."
  info "Starting"
  $COMPOSE up -d --remove-orphans || die "The stack did not start. Look at it with:
    cd $INSTALL_DIR && $COMPOSE logs"
}

diagnose() {
  local down name
  down="$($COMPOSE ps --format '{{.Name}} {{.State}}' 2>/dev/null | awk '$2 != "running" { print $1 }')"
  if [ -z "$down" ]; then
    warn "Everything is running but the studio is not answering yet."
    say "  ${DIM}cd $INSTALL_DIR && $COMPOSE logs -f${RESET}"
    return
  fi
  warn "Not running: $(echo "$down" | tr '\n' ' ')"
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    say ""
    say "  ${BOLD}${name}${RESET} ${DIM}last 15 lines${RESET}"
    $COMPOSE logs --tail 15 "${name#componium-}" 2>&1 | sed 's/^/    /' || true
  done <<< "$down"
}

wait_for_health() {
  local attempts=0
  printf '%s->%s Waiting for the studio' "$BLUE" "$RESET"
  while [ $attempts -lt 45 ]; do
    if fetch_stdout "http://127.0.0.1:$PORT/api/media" >/dev/null 2>&1; then
      printf '\n'; ok "The studio is up"
      return 0
    fi
    printf '.'
    sleep 2
    attempts=$((attempts + 1))
  done
  printf '\n'
  diagnose
  return 1
}

# first_password prints the generated administrator once, if there is one.
#
# The studio writes it, not this script: it is the thing that knows whether
# anybody existed already. It goes into a 0600 file in the state directory
# rather than into this output alone, because an installer run under `tee`,
# in CI, or over a shared terminal puts everything it prints somewhere it
# was not meant to go.
first_password() {
  local file="$INSTALL_DIR/state/initial-admin-password.txt"
  $SUDO test -f "$file" 2>/dev/null || return 0
  local password
  password="$($SUDO grep -E "^Password:" "$file" 2>/dev/null | head -1 | sed "s/^Password:[[:space:]]*//")"
  [ -n "$password" ] || return 0
  say ""
  say "  ${BOLD}Sign in as${RESET}   admin"
  say "  ${BOLD}Password${RESET}     $password"
  say ""
  say "  ${DIM}This studio is private: nothing in it is reachable without signing in."
  say "  The password is also in $file, readable only by you."
  say "  Change it under Admin, Users, then delete that file.${RESET}"
}

summary() {
  local host="${ADVERTISE:-localhost}"
  say ""
  say "${GREEN}${BOLD}Componium is running.${RESET}"
  say ""
  say "  ${BOLD}Studio${RESET}     http://$host:$PORT"
  first_password
  say ""
  say "  ${BOLD}Films${RESET}      $MEDIA"
  say "  ${BOLD}Scores${RESET}     $SCORES"
  say "  ${BOLD}Rigs${RESET}       $INSTALL_DIR/rigs"
  say ""
  say "  ${DIM}Copy a film into $MEDIA, then open the studio and analyse it."
  say "  The rig on the shelf is virtual: it drives nothing and proves the"
  say "  whole path. Describe your own hardware under Admin > Devices.${RESET}"
  say ""
  say "  ${DIM}Manage it with:${RESET}"
  say "    cd $INSTALL_DIR"
  say "    $COMPOSE ps"
  say "    $COMPOSE logs -f"
  say "    $COMPOSE down"
  say ""
  say "  ${DIM}Update later:${RESET}  $INSTALL_DIR/update.sh"
  say ""
}

# --------------------------------------------------------------------- main

# Sourcing with COMPONIUM_LIB_ONLY=1 defines the functions and installs
# nothing, so the tests can exercise them directly.
if [ "${COMPONIUM_LIB_ONLY:-}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

banner
resolve_privileges
check_prereqs
resolve_version
download_bundle
configure
make_dirs
write_env
if [ "$START" = "no" ]; then
  ok "Ready. Start it with:  cd $INSTALL_DIR && $COMPOSE up -d"
  exit 0
fi
launch
wait_for_health || true
summary
