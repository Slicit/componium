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

**The port is published on every interface** unless you say otherwise. There is
no authentication in front of the studio, so on a machine that faces the
internet put it behind something that has some, or bind it to one interface:

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
