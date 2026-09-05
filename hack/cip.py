"""Speaking CIP 0.3 to a board, for the small tools in this directory.

One implementation, imported by poke.py and poke-together.py. Two hand written
HMAC clients would drift, and the way a client drifts from its node is silence:
a wrong tag is not an error anybody sees, it is a datagram the board discards
without a word. That is indistinguishable from a board that is off, on another
network, or running firmware that does not speak this at all. Debugging the
difference cost real time once already, which is why there is now one copy.

The protocol, as much of it as these tools need:

  Every datagram carries a 16 byte HMAC-SHA256 prefix over its own body, in
  *both* directions. Forgetting to strip it on the way in leaves sixteen bytes
  of binary in front of valid JSON, and json.loads says only that it is not
  JSON.

  Control messages carry `n`, a counter the node refuses to see repeat. See
  Link.__init__ for why it is microseconds since the epoch and not anything
  else.

  Curve frames are binary, carry no counter, and are still tagged.
"""

import hashlib
import hmac
import json
import os
import socket
import struct
import time

CIP_PORT = 5570
CIP_VERSION = "0.3"
TAG_LEN = 16

# How long the node waits without a heartbeat before driving everything to its
# safe value. Mirrored from CIP_WATCHDOG_MS in the firmware; a tool that holds
# an output has to beat faster than this or it is testing the watchdog instead
# of whatever it meant to test.
WATCHDOG_MS = 300

# Where the secret lives when nobody says otherwise. A board that has one
# ignores unauthenticated traffic completely, so getting this wrong presents as
# a board that is not there.
SECRET_FILE = "~/.componium/node-secret"
SECRET_ENV = "COMPONIUM_CIP_SECRET"


def secret(given=None):
    """The shared secret: what was asked for, then the environment, then the file.

    Stripped, and that is not tidiness. The file is written by an editor or a
    shell and ends with a newline; the node's secret does not include one. A
    secret with a trailing newline hashes to a different tag and every datagram
    is silently discarded, which is the exact failure this whole module exists
    to stop people spending an evening on.

    Returns "" when there is nothing to be found, which is a real answer: a
    board flashed without a secret takes unauthenticated traffic, and passing
    an empty secret is how you talk to one.
    """
    if given is not None:
        return given.strip()
    from_env = os.environ.get(SECRET_ENV)
    if from_env:
        return from_env.strip()
    path = os.path.expanduser(SECRET_FILE)
    try:
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace").strip()
    except OSError:
        return ""


def where_from(given=None):
    """A sentence saying where the secret came from, for a tool to print.

    Worth saying out loud every run. "No answer from the board" and "I used the
    wrong secret" look identical from here, and a person who can see which
    secret was used can tell them apart without reading any code.
    """
    if given is not None:
        return "the command line"
    if os.environ.get(SECRET_ENV):
        return "$" + SECRET_ENV
    path = os.path.expanduser(SECRET_FILE)
    if os.path.exists(path):
        return path
    return "nowhere: talking to the board unauthenticated"


class Link:
    """One authenticated conversation with a node."""

    def __init__(self, host, key=None):
        self.host = host
        self.secret = secret(key).encode()
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Seeded from the clock in microseconds, exactly as the Go client does,
        # and for the same two reasons. It has to beat whatever the node last
        # heard, which a counter starting at 1 does not after the first client
        # of the board's life. And it has to stay under 2^53, because the other
        # end parses it into a double: nanoseconds do not, and two consecutive
        # nanosecond counters land on the same float, so the second message is
        # refused as a replay.
        self.n = int(time.time() * 1e6)
        self.sent_frames = 0
        self.sent_outputs = 0
        self.sent_cues = 0

    def wrap(self, body):
        if not self.secret:
            return body
        tag = hmac.new(self.secret, body, hashlib.sha256).digest()[:TAG_LEN]
        return tag + body

    def unwrap(self, datagram):
        """Verify and strip the tag on the way in.

        The node signs what it sends as well as what it accepts, which is easy
        to forget when writing a client: a reply read without stripping the tag
        is sixteen bytes of binary followed by valid JSON, and json.loads says
        only that it is not JSON. That looked exactly like a board not
        answering, for about ten minutes.
        """
        if not self.secret:
            return datagram
        if len(datagram) < TAG_LEN:
            return None
        body = datagram[TAG_LEN:]
        want = hmac.new(self.secret, body, hashlib.sha256).digest()[:TAG_LEN]
        if not hmac.compare_digest(want, datagram[:TAG_LEN]):
            return None
        return body

    def send(self, message):
        self.n += 1
        message = dict(message, v=CIP_VERSION, n=self.n)
        self.sock.sendto(self.wrap(json.dumps(message).encode()), (self.host, CIP_PORT))

    def send_frame(self, outputs):
        """One curve frame carrying several outputs.

        Binary, and not counted: a frame is superseded 20ms later, so the
        replay guard would cost more than it protects. The tag still applies.
        """
        body = bytearray([ord("C"), ord("F"), 1, len(outputs)])
        for index, values in outputs:
            body.append(index)
            body.append(len(values))
            for v in values:
                body += struct.pack(">f", max(0.0, min(1.0, v)))
        self.sock.sendto(self.wrap(bytes(body)), (self.host, CIP_PORT))
        self.sent_frames += 1
        self.sent_outputs += len(outputs)

    def cue(self, instrument, params, hold_ms=8000):
        self.sent_cues += 1
        self.send({"t": "cue", "seq": self.sent_cues, "instrument": instrument,
                   "params": params, "hold_ms": hold_ms})

    def ask(self, message, wait=2.0):
        self.send(message)
        self.sock.settimeout(wait)
        deadline = time.time() + wait
        while time.time() < deadline:
            try:
                data, _ = self.sock.recvfrom(4096)
            except socket.timeout:
                return None
            body = self.unwrap(data)
            if body is None:
                continue        # not signed with our secret, so not for us
            try:
                return json.loads(body.decode())
            except (UnicodeDecodeError, ValueError):
                continue        # a curve frame, or somebody else's datagram
        return None

    def beat(self):
        self.send({"t": "heartbeat"})

    def safe(self):
        self.send({"t": "safe"})

    def close(self):
        self.sock.close()


def hold(link, seconds, paint=None):
    """Keep the outputs alive for a while, beating as the conductor would.

    The heartbeats are the point of this helper. Without them the node drops
    everything to safe after WATCHDOG_MS, which looks exactly like a cue that
    never landed. `paint` is called with elapsed seconds when a caller wants to
    keep sending frames while it waits.
    """
    start = time.time()
    last_beat = -1.0
    while True:
        t = time.time() - start
        if t >= seconds:
            return
        if t - last_beat > 0.1:
            link.beat()
            last_beat = t
        if paint:
            paint(t)
        time.sleep(0.02)
