# Installing Componium on a server

```sh
curl -fsSL https://raw.githubusercontent.com/Slicit/componium/main/install.sh | bash
```

It asks four questions, writes the answers down, pulls one image and starts.
When it finishes it prints the address of the studio.

Non-interactive, which is also what an update does:

```sh
curl -fsSL .../install.sh | bash -s -- --yes \
    --media /srv/films --scores /srv/scores --advertise 192.168.1.20
```

## What gets installed

Two containers, or five.

| | |
|---|---|
| **studio** | the library and the timeline editor. The part with a URL |
| **db** | derived data: observations, the analysis queue, kept score metadata |

That is a server: films in, scores out. If the same machine is also the one in
the room, `--with-show` adds three more:

| | |
|---|---|
| **player** | mpv, the reference time source |
| **conductor** | follows the player and drives the rig |
| **node** | a software instrument, for proving the path without hardware |

They are a Compose profile, so they can be added later by re-running the
installer with `--with-show`, and they never start by accident.

## Where your things live

```
/opt/componium/          the install: compose files, examples, scripts
  .env                   every answer you gave
  rigs/                  what hardware you have. Edited in the studio
  state/                 which boards exist, and their secrets
  firmware/              node images the admin page can flash
/srv/films               your films        (wherever you said)
/srv/scores              the scores it makes  (wherever you said)
```

Films, scores and rigs are **plain directories on the host**, not Docker
volumes. That is deliberate. A film is large, it is yours, and the first thing
anybody wants to do is copy one in or back one up; a named volume would put
them somewhere only Docker can reach. Point `--media` at whichever disk has the
room.

The one named volume is the database, and losing it costs an afternoon of
re-analysis rather than anything irreplaceable: every observation in it can be
rebuilt from the films and the scores, which are the files above.

## Updating

```sh
/opt/componium/update.sh
```

That is `install.sh --yes` with your existing answers, which is exactly what it
is. It replaces the compose files and the examples, pulls the new image and
restarts. It does not touch your films, your scores, your rigs, the board list
or the database: an update replaces containers, not data.

To pin or roll back:

```sh
/opt/componium/update.sh --version v0.2.0
```

Every release publishes `ghcr.io/slicit/componium:<version>` as well as moving
`:latest`, so a version you once ran is always still there.

## Signing in

The studio is private. Nothing in it is reachable without a session: not the
timeline, not the library, not the API. The one exception is `/firmware/`,
which an ESP32 fetches when it is told to update itself, because a board has
no way to sign in and putting it behind the session would mean no board could
ever update again.

**The first administrator is made on the first start**, with a password
generated for you and written to

    /opt/componium/state/initial-admin-password.txt

readable only by you. The installer prints it once as well. It is a file
rather than only a line of output because an installer run under `tee`, in CI,
or over somebody's shoulder puts everything it prints somewhere it was not
meant to go. Change it under **Admin, Users**, then delete the file.

### Who can do what

| | |
|---|---|
| **viewer** | watches a score and changes nothing |
| **operator** | authors scores, analyses films, runs shows |
| **admin** | also the rigs, the boards, the firmware, the analysis settings, and this list |

Add people under **Admin, Users**. Passwords are not kept: each person has a
verifier their password reproduces, which cannot be turned back into one, so
somebody who forgets theirs needs a new one set rather than recovered.
Removing somebody, or changing their password or role, signs them out of
wherever they are immediately.

The last administrator cannot be removed or demoted. A studio with nobody who
can add a user has one way back, which is editing a TOML file over SSH, and
the person who would have to do that is the person who just locked themselves
out of it.

### What is stored, and where

`/opt/componium/state/users.toml`, 0600, beside the board list, because both
are credentials. Anybody who can read it can spend a GPU on it offline, so it
belongs on the host and not in the repository or a backup that travels.

Sessions live in memory, so restarting the studio signs everybody out. That is
a property rather than a gap: the alternative is a second thing to keep, expire
and back up, for a studio that takes two seconds to sign back in to.

### If you lock yourself out

Stop the studio, delete `state/users.toml`, start it again. It makes a new
administrator and writes the password where it wrote the first one. Films,
scores and rigs are untouched: the user list is the only thing that file holds.

## The first five minutes

1. Copy a film into the media directory.
2. Open the studio. The library lists it.
3. **Analyse** it. That reads the film and writes a score beside it, which
   takes a few minutes for a feature.
4. Open it in the timeline and listen to what it decided.

The shelf starts with one virtual rig, which drives nothing and is there so the
studio has something to open. Describe your own hardware under **Admin →
Devices**, and the boards themselves under **Admin → Boards**.

## The things worth knowing before they surprise you

**The advertise address.** The installer asks for this host's address on the
network your boards are on, and it is used for exactly one thing: telling a
board where to fetch firmware when you press update. A container cannot work
out its host's address, so it has to be told. Everything else works without it.

**Vision is off.** Analysis uses audio, luminance, camera movement and
subtitles out of the box, which is most of what it uses anyway. Pointing it at
a vision model is a separate decision with a GPU behind it; set
`COMPONIUM_VLM_COMMAND` and the rest in `.env`.

**The port is published on every interface** unless you say otherwise. There
is a sign-in in front of the studio now, and it is a sign-in rather than a
hardened front door: no rate limiting, no second factor, and plain HTTP
unless something in front of it is terminating TLS. On a machine that faces
the internet, put it behind something that does those, or bind it to one
interface:

```sh
./install.sh --bind 127.0.0.1
```

**Nothing here has driven your hardware yet.** Read
[wet-and-hot.md](wet-and-hot.md) before connecting anything with heat, water or
moving mass, and [running.md](running.md) for the order to bring a real rig up
in.

## If it does not start

```sh
cd /opt/componium
docker compose ps
docker compose logs -f
```

[troubleshooting.md](troubleshooting.md) is organised by what you are looking
at. The two failures particular to a container are both in there: a studio
showing old behaviour is usually an image that was not pulled, and an upload
that fails with no reason is usually a media directory owned by the wrong uid,
which `COMPONIUM_UID` in `.env` is for.
