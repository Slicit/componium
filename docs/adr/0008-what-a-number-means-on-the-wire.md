# ADR 0008 — What a number means on the wire

Status: accepted · 2026-09-06

## Context

A board announces itself in `hello`, and everything begins there. A conductor
dials, a studio opens the Boards page, a bench tool asks what is attached: all
of them send `hello` first and can do nothing until one comes back.

`hello` is one UDP datagram, built into a fixed buffer. It was 1024 bytes.

Three numbers were added to a PWM device over the course of a week, all of them
measured on a bench rather than guessed: `min_duty`, the lowest duty a fan will
keep turning at; `start_duty`, the higher duty that breaks it away from rest;
and `kick_ms`, how long to hold the second one after a start. They are separate
because they are separate thresholds, and collapsing them into a single minimum
throws away every speed between the two.

Setting all three on one fan took the board off the network.

The board kept serving its status page, kept its wifi, kept accepting cues, and
was invisible to every conductor and every tool. `send_raw` checked the length
against the buffer, found it did not fit, and returned. No log, no counter, no
trace. From outside it is indistinguishable from a board that is switched off,
and the recovery path is blocked by the same fault, because the studio's update
button dials first and dialling waits for a hello.

The arithmetic is the part nobody would predict from reading the source. The
hello was 936 bytes of body. The three numbers looked like about twenty bytes.
They were seventy six, because cJSON prints a number at whatever precision is
needed to round trip the double it is handed, and these are stored as floats.
The nearest float to 0.65 is not the nearest double to 0.65, so `0.65` goes on
the wire as `0.649999976158142`. Three of those on one device is sixty two
bytes of digits, measured. 936 + 76 = 1012, against a limit of 1008 once the
authentication tag is counted. Four bytes.

## Decision

**A value is announced at the resolution the hardware has, not at the
resolution a float happens to print.**

For anything in 0..1 that is three decimals. The PWM timer is ten bits, so one
step is 1/1024 and roughly 0.001. A fourth decimal describes a duty no output
on this board can produce, and every digit after that describes the gap between
two ways of storing a number rather than anything about a fan.

Rounding happens in double. Rounding in float and dividing in float lands back
on the same unrepresentable value and prints exactly as badly as before.

**One datagram is 1472 bytes.**

That is the largest UDP payload that survives a 1500 byte MTU once the IP and
UDP headers are counted, so nothing fragments. It is a ceiling, not room to
grow into: four devices with everything set fit, five come to about 1640 bytes,
and there is no buffer inside one datagram that holds them.

**A datagram that does not fit is logged.**

The silence was the actual defect. The board is the only thing that knows it
could not answer, and it was the one thing not saying so.

## Consequences

A board with more than about four devices cannot announce itself, and the fix
on that day is to stop repeating the `channels` array for every device, not to
raise the limit past the MTU. Most of a hello is the same channel names and
units written out again, which is compressible without changing what any reader
can learn. The tests in `firmware/esp32/test/main/test_main.c` assert both
halves: that a full board fits, and that a five device board does not, so the
day it matters arrives as a failing test rather than as a silent board.

Three decimals is a wire format decision, not a storage one. The board still
holds a float and still computes with it; only the announcement is rounded. A
studio that writes 0.6543 back gets 0.654 announced, which is what it will
actually do.

Setting the limit back to 1024 fails a test with `Expected 1028 to be less than
or equal to 1024`, which is this incident to the byte.

The trio itself is now measurable rather than guessable. `hack/poke.py find`
walks the level up until a fan starts and back down until it stalls without
releasing the output in between, which is the only way to get both thresholds:
letting the fan stop between readings makes every reading a starting threshold.
It refuses to run when `min` or `kick` are already set, because with a mapping
configured what it would measure is the mapping.
