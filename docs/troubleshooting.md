# Troubleshooting

Organised by what you are looking at, not by what is wrong. If you knew what
was wrong you would not be here.

Almost everything below is something that actually happened to this project
rather than something imagined for a document. Where the cause is written up in
more depth for somebody changing the code, there is a link to it;
`LOGBOOK/notes.md` is the developer-facing version of several of these.

Two habits are worth having before any of it:

- **A valid message that arrives increments no counter.** So "the refusal count
  did not move" does not mean "nothing arrived". To prove a socket is alive,
  send something deliberately invalid and watch the refusal count rise. An
  earlier version of that reasoning here concluded a board was switched off
  when it was listening the whole time.
- **A diagnostic that writes state is not a diagnostic.** Probing the replay
  guard with a very large counter left a board refusing every honest client
  until it was rebooted, because the guard remembers the highest it has seen.

---

## The fan does not move

**Everything upstream looks right: the conductor logs the cue, the node logs
the output, the number in the studio changes.** Then the problem is after the
software, and no amount of looking at the software will show it.

Split the question in two with `hack/poke.py`, which needs no conductor, no
studio and no score:

```sh
python3 hack/poke.py 192.168.1.75 hold 1.0
```

- **Nothing at 1.0, but the fan runs when 12 V is applied to it directly.** The
  fan is fine and the switch is not. Meter the MOSFET's gate while `hold` is
  running: you should see the board's logic level there, and the drain should
  pull to near ground.
- **It runs from 5 V on the gate and not from 3.3 V.** That is the whole
  diagnosis. A MOSFET that needs more than 3.3 V on its gate is not a
  logic-level part, whatever the part number on it says. This project lost most
  of a day to an IRLB3034 which is a logic-level part, is rated to switch tens
  of amps from 3.3 V, and turned out to be counterfeit. Four continuity checks
  passed. Every measurement was consistent. The component was the only thing
  left. A genuine IRF540N in the same socket worked immediately, despite being
  the *less* suitable part on paper.
- **It runs at 1.0 and not at 0.3.** That is not a fault. A fan needs more duty
  to break away from rest than to keep turning, so a board carries both a floor
  and a breakaway kick, and those are two numbers you measure:

  ```sh
  python3 hack/poke.py 192.168.1.75 find --step_duration=10s --intensity_step=0.05
  ```

  Ten seconds a step is not caution. A fan that will start at a given duty does
  not always do it in the first second, and a threshold measured in a hurry is
  one the show finds again at the worst possible moment.

See [hardware.md](hardware.md) for what to buy, and note that `find` refuses to
run once the floor and kick are already configured: with them set it would be
measuring the mapping rather than the fan.

## The board has vanished

**The studio cannot see it, the conductor cannot reach it, and no tool in
`hack/` gets an answer**, but the board is powered, on the network, and still
serving its status page.

Every one of those tools begins with `hello`, so anything that breaks `hello`
alone looks exactly like a board that is switched off. That has happened here
once, and the cause was a reply four bytes too large for the buffer it was
built into: `send_raw` found it did not fit and returned without a log or a
counter.

- Check the board's status page directly. It is served over HTTP and does not
  involve CIP at all, so it answers when nothing else does.
- The way back in is an `update` sent by hand. Nothing about an update needs a
  `hello` first, which is what makes recovery possible; the studio's own update
  button dials first, and dialling waits for a hello, so it cannot help here.
- If this is a board you have just configured, suspect the size of what it is
  now trying to say about itself. See
  [adr/0008-what-a-number-means-on-the-wire.md](adr/0008-what-a-number-means-on-the-wire.md):
  three numbers on a fan cost seventy six bytes rather than the twenty they
  looked like, because a float prints at whatever precision round-trips it, and
  0.65 goes on the wire as 0.649999976158142.

Both the buffer and the rounding are fixed, and there are tests that assert a
full board fits and an oversized one does not, so the next occurrence should
arrive as a failing test rather than as a silent board.

## Cues stop landing part way through a show

**It worked for the first few minutes. Then the outputs kept moving but the
cues, the stops and the heartbeats stopped arriving.** Look for a second client.

A node keeps one replay counter for the whole board rather than one per sender,
and refuses any authenticated message whose counter is not above the highest it
has seen. Every client seeds its counter from the wall clock, so a client that
connects later starts millions of counts ahead, and from its first message
every message from the earlier client is refused permanently and in silence.

In practice: **opening the studio's Boards page during a show stops the
conductor being heard by that board** until the conductor reconnects. The
watchdog then drops the board to safe after 300 ms, which is correct behaviour
for the wrong reason.

Three things make it hard to read from either end:

- Curve frames carry no counter, so they keep arriving. The outputs still move
  and only the discrete events vanish, which reads as a scoring problem.
- Cues sent before the other client spoke still landed, so it looks
  intermittent and time-dependent.
- The refusal is counted on the board and logged nowhere the operator sees. The
  status page is the only place the number appears.

Not fixed. `LOGBOOK/notes.md` has the shape of a fix and why it wants an ADR.

## A strip shows the wrong colours

Setting `order = "GRB"` changes nothing. The board announces the field and
`device_apply` never reads it, writing value 0, 1 and 2 as red, green and blue
whatever the configuration says. A strip that is not a plain WS2812 has no way
to be corrected short of swapping the numbers in the score.

Known, not fixed, and in `LOGBOOK/notes.md` with the argument that announcing a
setting which does nothing is worse than not having it.

Worth knowing when checking colour at all: two strips both lit is not evidence.
Two strips lit in *different* colours, then swapping in step, is. Almost every
way of getting the addressing wrong ends with both strips showing the same
thing, and no counter can see that, because from the board's side each frame
was applied perfectly. `hack/poke-together.py` exists for exactly this.

## Nothing at all answers, and the secret looks right

`hello` with the wrong secret and `hello` to a board that is not there produce
the same silence.

The secret is 32 bytes and the file holding it **ends with a newline**. The raw
file contents authenticate nothing; the stripped value does. `hack/cip.py`
strips it, and every tool prints which source it used on every run, precisely
so that these two failures can be told apart without reading any code.

## The studio does not have the change you just made

**You edited something under `web/src`, the typecheck passes, the tests pass,
and the browser shows the old behaviour.**

- If you are looking at the container on the box, it is serving the image CI
  built from `main`. Testing a branch through it says nothing about the branch.
  That has cost a day here: an old binary decoded a new field, did not
  recognise it, and dropped it silently, which looked exactly like a firmware
  bug. Run `npm run dev` against a studio you started yourself instead.
- If you are looking at a locally built binary, rebuild the bundle. Go embeds
  `internal/studio/webdist`, which is committed on purpose so that `go build`
  alone produces a working studio and a Go contributor never needs npm. The
  cost of that bargain is a bundle that can go stale, and neither `tsc` nor
  vitest notices:

  ```sh
  cd web && npm run build     # then commit internal/studio/webdist
  ```

  CI is the only thing that catches it otherwise.

## Something in the studio opens but cannot be seen

A menu or a list that responds to the keyboard, holds focus, and is invisible,
is almost always a stacking context rather than a z-index. An ancestor with
`position: sticky` and a `z-index` of its own caps everything inside it,
however large a number the child asks for.

This is why the film picker and the right-click menu are portalled to the end
of the body: that takes them out of the ancestor's stacking context altogether,
rather than competing inside it. `web/e2e/picker.spec.ts` asserts it by asking
the browser what is painted at the list's own centre, because a z-index
assertion passes on the broken version.

## `docker compose` leaves files nobody can delete

A container running as root against a bind-mounted checkout leaves root-owned
files behind. A later `rm -rf` fails on them, and under `set -e` a script dies
there and silently skips every step after it. Use `sudo rm -rf`, and prefer
running containers as the checkout's owner.

## A script fails with a confusing "not found"

Line endings. CRLF is introduced at the moment a file is written on a Windows
machine, not during sync or checkout, and a plain read of the file shows
nothing wrong:

```sh
grep -lU $'\r' -r .            # find them
sed -i 's/\r$//' <file>        # fix one
hack/check-edits.sh            # and this refuses to let one past
```

## Cues arrive early or late

They are *supposed* to arrive early. Every instrument declares its own latency
and the conductor dispatches each cue ahead by exactly that much: about 20 ms
for a DMX fixture, 800 to 2000 ms for a fan, one to three seconds for a fogger.
Both ends of a span are compensated, so an effect begins and ends where the
score says rather than where the command was sent.

If the compensation is wrong, the declared latency is wrong. It is a
measurement, and for the fan in this repository it is still a guess. If
everything drifts together instead, the clock is the suspect rather than the
latencies: run `componium tune` on that machine with that player, then
`componium doctor` to read the profile back in words.

## Reporting something not listed here

`componium doctor` output, the score and rig that reproduce it, and what the
node's status page says, are between them enough to start from. If it involves
a board, say whether `hack/poke.py hello` gets an answer, because that one line
splits the whole problem space in half.
