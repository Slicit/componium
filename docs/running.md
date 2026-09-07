# Running a show

The README shows the two commands that prove the thing works. This is the
other document: what the pieces are, which of them you actually need, and the
order to bring them up in when there is real hardware involved.

Nothing here is new. It is the path through
[hardware.md](hardware.md), [cip.md](cip.md), [wet-and-hot.md](wet-and-hot.md)
and [../deploy/README.md](../deploy/README.md), in the order a person meets
them. When something in it does not work, [troubleshooting.md](troubleshooting.md)
is organised by what you are looking at rather than by what is wrong.

## The four processes, and which you need

| | What it is | Needed when |
|---|---|---|
| **player** | mpv, playing the film, with its IPC socket exposed | always, except `componium studio` alone |
| **conductor** | `componium play`. Follows the player, dispatches cues | whenever anything should move |
| **node** | `componium node`, or an ESP32 running the firmware | one per board of instruments |
| **studio** | `componium studio`. The editor, in a browser | while writing or fixing a score |

A virtual rig needs only the first two. A rig with one ESP32 on it needs three.
The studio is never required to run a show and is the only one with a URL.

## The shortest real path

1. **Get a score.** Either write one in the studio, or generate one and then
   fix it in the studio:

   ```sh
   python3 composer/compose.py film.mkv -o film.componium
   ```

   The composer is offline and slow, and it is meant to be. It reads the video,
   the soundtrack and the subtitle track and proposes a score. It never runs
   during playback.

2. **Describe your rig.** A rig file lists the instruments that exist and where
   they are. `examples/` has four to copy from, and the studio writes the file
   directly, so editing it by hand and editing it in the browser are the same
   act on the same file.

3. **Check the two against each other, before anything is powered:**

   ```sh
   componium validate -score film.componium -rig my-rig.toml
   ```

   This is the step that catches a score naming an instrument the rig does not
   have, and a cue asking for more than an instrument declared it can do.

4. **Measure the machine, once:**

   ```sh
   componium tune
   componium doctor
   ```

   `tune` measures how this machine and this player actually behave, since a
   media player reports its position by polling at roughly 1 Hz with jitter.
   `doctor` prints the resulting profile in words. Do this once per machine,
   and again if you change player.

5. **Rehearse before you play.** Same score, same rig, every driver stubbed:

   ```sh
   componium rehearse -score film.componium -rig my-rig.toml
   ```

   It prints what each instrument would have been told and when. This is where
   a scoring mistake is cheap.

6. **Then play it.**

   ```sh
   mpv --input-ipc-server=/tmp/mpv.sock film.mkv
   componium play -score film.componium -rig my-rig.toml
   ```

## Bringing up a board

Do this before the board is anywhere near a score. `hack/poke.py` talks to a
node with no conductor, no studio and no score in the picture, which is the
only way to tell a wiring problem from a scoring one:

```sh
python3 hack/poke.py 192.168.1.75 hello     # is anything there, and what
python3 hack/poke.py 192.168.1.75 hold 0.4  # pin one output, meter in hand
python3 hack/poke.py 192.168.1.75 find      # where a fan starts, where it stalls
```

`find` is worth the ten minutes. A fan does not start at the duty it will then
run at, so a board needs both a floor and a breakaway kick, and those are two
different numbers you measure rather than guess. Put them in the board's
configuration from the studio's Boards page. See
[adr/0008-what-a-number-means-on-the-wire.md](adr/0008-what-a-number-means-on-the-wire.md)
for why they are announced to three decimals and not more.

With more than one output on a board, `hack/poke-together.py` is the one that
answers the question a single output cannot: whether they move together, and
whether each strip gets the colour meant for it.

## The demonstration stack

`deploy/docker-compose.yml` brings up all four processes plus a generated test
clip, with no hardware at all. It is the fastest way to see the whole system
work, and the fastest way to check that a change did not break it. See
[../deploy/README.md](../deploy/README.md).

## Before you leave it running

Read [wet-and-hot.md](wet-and-hot.md) first if the rig has fog, water, heat or
moving mass in it. The short version of that document is that the conductor is
not your safety system and was never designed to be: every instrument declares
a safe state and its own duty limits, and fails back to safe on its own if it
goes 300 ms without a heartbeat, whether or not the conductor is alive to
notice. Test that with the conductor deliberately killed. If nothing happens
when you kill it, nothing is protecting you.

What has actually run against hardware, as of 2026-09-07, is one fan: an
ESP32 running this firmware, driving a 12 V fan through a MOSFET, with its
start and stall thresholds measured by `poke find` rather than guessed. Nothing
else. The lighting path is verified over a real socket against a real listener,
which proves the protocol and proves nothing about a fixture, and fog, water,
heat and moving mass have never been connected to any of it.
