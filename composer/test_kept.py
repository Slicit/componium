"""Reading back a description an earlier run wrote.

The interesting half is the clock. A kept description is written in film time
and everything computed inside a chunk counts from that chunk's own start, so a
file read without converting lands every observation at the wrong second, in a
way that looks entirely plausible: the fan still blows, just not when the film
does anything. That is the same shape as the chunk-offset bug that once piled
every chunk's cues into the first chunk-length of the film, and it took a
person watching a film to notice that one.
"""

import json
import os
import tempfile
import unittest

import compose
import span as span_mod


def write(rows):
    fd, path = tempfile.mkstemp(suffix=".seen.jsonl")
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return path


class ReadingAKeptDescription(unittest.TestCase):
    def test_reads_what_was_written(self):
        path = write([
            {"t": 12.5, "labels": ["explosion"], "seen": "A fireball."},
            {"t": 30.0, "labels": [], "seen": "Grass sways in the wind."},
        ])
        try:
            rows = compose.read_observations(path)
        finally:
            os.unlink(path)

        self.assertEqual([r["t"] for r in rows], [12.5, 30.0])
        self.assertEqual(rows[0]["labels"], ["explosion"])
        self.assertIn("wind", rows[1]["seen"])

    def test_nothing_at_all_is_not_an_error(self):
        """A film that was never looked at, and a path that is simply absent.

        Both have to be ordinary. The composer asks for this on every reuse
        build, and a missing file means the model has not run yet, which is a
        state rather than a fault."""
        self.assertEqual(compose.read_observations(None), [])
        self.assertEqual(compose.read_observations("/no/such/file.jsonl"), [])

    def test_a_half_written_line_is_skipped(self):
        """This file is appended a chunk at a time and the writer can be
        interrupted, so the last line may be a fragment. One bad line must not
        cost the other three thousand."""
        fd, path = tempfile.mkstemp(suffix=".seen.jsonl")
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps({"t": 1.0, "seen": "First."}) + "\n")
            f.write('{"t": 2.0, "seen": "Cut off her')
        try:
            rows = compose.read_observations(path)
        finally:
            os.unlink(path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["t"], 1.0)

    def test_comes_back_in_the_chunk_clock(self):
        """The whole point. A chunk starting at 600s must see its own 0."""
        path = write([
            {"t": 100.0, "seen": "Before this chunk."},
            {"t": 605.0, "seen": "Five seconds in."},
            {"t": 700.0, "seen": "A hundred seconds in."},
            {"t": 1300.0, "seen": "After this chunk."},
        ])
        chunk = span_mod.Span(start=600.0, end=1200.0)
        try:
            rows = compose.read_observations(path, chunk)
        finally:
            os.unlink(path)

        self.assertEqual([r["seen"] for r in rows],
                         ["Five seconds in.", "A hundred seconds in."])
        # Not 605 and 700, which is what a reader that forgot the clock gives.
        self.assertAlmostEqual(rows[0]["t"], 5.0, places=6)
        self.assertAlmostEqual(rows[1]["t"], 100.0, places=6)

    def test_the_whole_film_is_not_shifted(self):
        """A span that is the whole film converts nothing, and must not."""
        path = write([{"t": 42.0, "seen": "Somewhere."}])
        whole = span_mod.Span()
        try:
            rows = compose.read_observations(path, whole)
        finally:
            os.unlink(path)
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["t"], 42.0, places=6)


class TheChunkClock(unittest.TestCase):
    def test_is_the_inverse_of_film_time(self):
        chunk = span_mod.Span(start=600.0, end=1200.0, warmup=5.0)
        for t in (0.0, 1.5, 300.0):
            self.assertAlmostEqual(
                chunk.to_chunk_time(chunk.to_film_time(t)), t, places=6)


if __name__ == "__main__":
    unittest.main()
