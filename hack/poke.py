"""Talk to a node directly, without a score, a conductor or a studio.

For the ten minutes after a board first joins a network, or after somebody
rewires a fan, when the question is not "does the show work" but "is anything
on the end of this wire at all".

    python3 poke.py 192.168.1.75 hello          # who are you
    python3 poke.py 192.168.1.75 fan            # ramp the PWM output
    python3 poke.py 192.168.1.75 hold           # pin it at full until Ctrl-C
    python3 poke.py 192.168.1.75 hold 0.4       # or at some other level
    python3 poke.py 192.168.1.75 light          # a colour sequence, over sACN

The secret is found rather than typed: $COMPONIUM_CIP_SECRET if it is set,
otherwise ~/.componium/node-secret. Pass --secret to override. Which one was
used is printed every run, because "no answer from the board" and "wrong
secret" are the same silence and a person who can see the source can tell them
apart without reading any code.

Both protocols are spoken here exactly as the conductor speaks them, so an
effect that works from this and not from a show is a scoring problem, and an
effect that works from neither is a wiring problem. That is the whole point of
having it.

`hold` is the one to reach for with a multimeter in the other hand. It pins one
output at a fixed level and keeps it there, beating as a conductor would, until
you stop it. Nothing else in the system needs to be running.
"""

import os
import socket
import struct
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cip import CIP_PORT, Link, WATCHDOG_MS, where_from   # noqa: E402

SACN_PORT = 5568


# --- sACN ------------------------------------------------------------------

def e131(universe, slots, sequence, source="componium poke"):
    """One E1.31 packet carrying a full universe of 512 slots."""
    p = bytearray(638)
    struct.pack_into(">HH", p, 0, 0x0010, 0x0000)          # preamble, postamble
    p[4:16] = b"ASC-E1.17\x00\x00\x00"                      # ACN identifier
    struct.pack_into(">H", p, 16, 0x7000 | (638 - 16))      # root flags/length
    struct.pack_into(">I", p, 18, 0x00000004)               # root vector
    p[22:38] = bytes(range(16))                             # CID, any 16 bytes
    struct.pack_into(">H", p, 38, 0x7000 | (638 - 38))      # framing flags
    struct.pack_into(">I", p, 40, 0x00000002)               # framing vector
    name = source.encode()[:63]
    p[44:44 + len(name)] = name
    p[108] = 100                                            # priority
    struct.pack_into(">H", p, 111, universe)
    p[113] = sequence
    struct.pack_into(">H", p, 115, 0x7000 | (638 - 115))    # dmp flags/length
    p[117] = 0x02                                           # dmp vector
    p[118] = 0xA1                                           # address type
    struct.pack_into(">HHH", p, 119, 0x0000, 0x0001, 513)
    p[125] = 0                                              # start code
    p[126:126 + 512] = bytes(slots)
    return bytes(p)


def light(host, universe=1, start=1, seconds=1.5):
    """A colour sequence over sACN, which is a different protocol and unsigned.

    Kept alongside the CIP movements on purpose. A strip that answers this and
    not a curve frame is a strip whose problem is CIP rather than wiring, and
    that is a distinction worth twenty seconds.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    steps = [
        ("red", (255, 0, 0)),
        ("green", (0, 255, 0)),
        ("blue", (0, 0, 255)),
        ("white", (255, 255, 255)),
        ("off", (0, 0, 0)),
    ]
    seq = 0
    for name, rgb in steps:
        slots = [0] * 512
        # Start addresses are 1 based, as every lighting desk numbers them.
        slots[start - 1:start - 1 + 3] = list(rgb)
        print("  %-11s rgb%s" % (name, rgb), flush=True)
        # Sent repeatedly, because a receiver that misses one datagram should
        # not sit on the previous colour for the whole step.
        until = time.time() + seconds
        while time.time() < until:
            seq = (seq + 1) & 0xFF
            sock.sendto(e131(universe, slots, seq), (host, SACN_PORT))
            time.sleep(0.04)
    sock.close()


# --- what is on the board --------------------------------------------------

def reachable(host, timeout=2):
    """Whether the host answers at all, as distinct from answering CIP.

    The distinction this whole file exists to draw. A board that is off, asleep,
    or on the wrong network looks exactly like a board with broken firmware if
    nobody asks the cheaper question first.
    """
    try:
        socket.gethostbyname(host)
    except socket.gaierror:
        return None          # not even a name we can resolve
    try:
        done = subprocess.run(
            ["ping", "-c", "1", "-W", str(timeout), host],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout + 2)
        return done.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return None          # no ping to run, so we genuinely do not know


def explain_silence(host, link):
    """Say what silence could mean, having just failed to get a hello.

    Three different faults share one symptom here, and the third is new in 0.3:
    a board with a secret discards a datagram signed with the wrong one without
    a word, which is byte for byte the same experience as a board that is
    switched off.
    """
    print("  no answer on udp/%d" % CIP_PORT)
    up = reachable(host)
    if up is None:
        print("  and no way to tell whether %s is up from here" % host)
    elif up:
        print("  but %s answers ping, so the board is on the network." % host)
        print("  Either it is not running this firmware, or the secret is")
        print("  wrong. A board with a secret discards a datagram signed with")
        print("  the wrong one silently, which is exactly what you are seeing.")
        if not link.secret:
            print("  This run had no secret at all.")
    else:
        print("  and %s does not answer ping either, so the board is off," % host)
        print("  asleep, or on a different network. Nothing to do with CIP")


def announced(link):
    reply = link.ask({"t": "hello"})
    if reply is None:
        return None
    return reply.get("instruments") or []


def channels_of(inst):
    return len(inst.get("channels") or [])


def a_level(instruments, wanted=None):
    """The single channel device to drive, by name or the first one found.

    By channel count rather than by kind, because a fan, a shaker and a mist
    machine are all one number, and the id belongs to whoever set the board up.
    """
    levels = [i for i in instruments if channels_of(i) == 1]
    if wanted:
        for i in levels:
            if i.get("id") == wanted:
                return i
        return None
    return levels[0] if levels else None


def describe(instruments):
    for i in instruments:
        extra = ""
        if i.get("type") == "pwm":
            extra = "  %d Hz" % i.get("freq_hz", 0)
            if i.get("min_duty"):
                extra += ", min %.2f" % i["min_duty"]
            if i.get("kick_ms"):
                extra += ", kick %dms" % i["kick_ms"]
        print("  %d  %-16s %-7s %-7s gpio %-3s %d channel(s)%s" % (
            i.get("index", -1), i.get("id", "?"), i.get("kind", "?"),
            i.get("type", "?"), i.get("gpio", "?"), channels_of(i), extra))


# --- movements -------------------------------------------------------------

def hello(host, key=None):
    link = Link(host, key)
    print("  secret from %s" % where_from(key))
    # One hello, read twice. Asking again for the node block would spend
    # another counter and another round trip to learn what the first answer
    # already carried.
    reply = link.ask({"t": "hello"})
    if reply is None:
        explain_silence(host, link)
        link.close()
        return False
    node = reply.get("node", {})
    print("  %s, firmware %s, on %s" % (
        node.get("name", "?"), node.get("firmware", "?"), node.get("chip", "?")))
    print()
    describe(reply.get("instruments") or [])
    link.close()
    return True


def fan(host, seconds=2.0, key=None):
    """Ramp the output, holding it with heartbeats the whole way.

    The heartbeats are not optional and not a formality: the node drops its
    output to safe after WATCHDOG_MS without one. A ramp that stops mid way is
    the watchdog working, which is the single most important thing on the board.
    """
    link = Link(host, key)
    print("  secret from %s" % where_from(key))
    found = announced(link)
    if found is None:
        explain_silence(host, link)
        link.close()
        return False
    device = a_level(found)
    if device is None:
        print("  this board has no single channel output to ramp.")
        describe(found)
        link.close()
        return False

    print("  driving %s on gpio %s" % (device["id"], device.get("gpio", "?")))
    for level in (0.3, 0.5, 0.7, 1.0, 0.5, 0.0):
        print("  intensity %.1f" % level, flush=True)
        link.cue(device["id"], {"intensity": level},
                 hold_ms=int(seconds * 1000) + 500)
        beat_for(link, seconds)
    link.safe()
    print("  safe")
    link.close()
    return True


def steady(host, level=1.0, key=None, wanted=None):
    """Pin one output at a level and keep it there until interrupted.

    The bench movement. A cue carries its own expiry so that a conductor which
    crashes cannot leave a fan running, which means holding one output still
    is not a single message: it is a cue repeated before its hold runs out,
    over a heartbeat fast enough to keep the watchdog quiet. Both of those are
    the safety machinery working, and neither can be turned off, so the honest
    way to hold an output is to keep asking.
    """
    link = Link(host, key)
    print("  secret from %s" % where_from(key))
    found = announced(link)
    if found is None:
        explain_silence(host, link)
        link.close()
        return False
    device = a_level(found, wanted)
    if device is None:
        print("  no such single channel output on this board.")
        describe(found)
        link.close()
        return False

    print("  %s on gpio %s, holding at %d%%" % (
        device["id"], device.get("gpio", "?"), round(level * 100)))
    if 0 < level < 1 and device.get("type") == "pwm":
        print("  a meter on the gate reads the average of a %d Hz square wave,"
              % device.get("freq_hz", 25000))
        print("  so expect about %.2f V there rather than 3.3. Measure at 100%%"
              % (3.3 * level))
        print("  if you want a number that is not a duty cycle in disguise.")
    print("  Ctrl-C to stop.")

    reply = link.ask({"t": "cue", "seq": 1, "instrument": device["id"],
                      "params": {"intensity": level}, "hold_ms": 3000})
    if reply is None or reply.get("t") != "ack":
        print("  the board did not acknowledge the cue, so it did not apply it.")
        link.close()
        return False
    print("  acknowledged, output is live", flush=True)

    try:
        last_cue = time.time()
        while True:
            # Re-cued well inside its own hold, so a lost datagram costs a
            # flicker rather than the whole run.
            if time.time() - last_cue > 1.0:
                link.cue(device["id"], {"intensity": level}, hold_ms=3000)
                last_cue = time.time()
            link.beat()
            time.sleep(WATCHDOG_MS / 3000.0)
    except KeyboardInterrupt:
        print()
    finally:
        link.safe()
        print("  safe")
        link.close()
    return True


def beat_for(link, seconds):
    until = time.time() + seconds
    while time.time() < until:
        link.beat()
        time.sleep(0.1)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    key = None
    if "--secret" in args:
        at = args.index("--secret")
        key = args[at + 1]
        del args[at:at + 2]
    if len(args) < 2:
        raise SystemExit(__doc__)

    where, what = args[0], args[1]
    rest = args[2:]

    if what == "hello":
        raise SystemExit(0 if hello(where, key) else 1)
    elif what == "light":
        light(where, universe=int(rest[0]) if rest else 1)
    elif what == "fan":
        raise SystemExit(0 if fan(where, key=key) else 1)
    elif what == "hold":
        amount = float(rest[0]) if rest else 1.0
        name = rest[1] if len(rest) > 1 else None
        raise SystemExit(0 if steady(where, amount, key, name) else 1)
    else:
        raise SystemExit(__doc__)
