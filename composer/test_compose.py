"""Tests for the pure parts of the composer.

Extraction needs ffmpeg and a real file, so it is exercised by running the
composer against a clip. Everything that turns signals into a score is pure,
and is tested here.
"""

import array
import unittest

import compose


class TestTimecode(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(compose.timecode(0), "00:00:00.000")
        self.assertEqual(compose.timecode(3661.5), "01:01:01.500")

    def test_rounds_without_producing_1000ms(self):
        self.assertEqual(compose.timecode(59.9995), "00:01:00.000")

    def test_negative_clamps(self):
        self.assertEqual(compose.timecode(-5), "00:00:00.000")


class TestRMS(unittest.TestCase):
    def test_normalises_to_peak(self):
        samples = array.array("h", [0] * 10 + [10000] * 10)
        out = compose.rms_windows(samples, 10)
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(out[0], 0.0)
        self.assertAlmostEqual(out[1], 1.0)

    def test_silence_does_not_divide_by_zero(self):
        out = compose.rms_windows(array.array("h", [0] * 100), 10)
        self.assertEqual(set(out), {0.0})


class TestCompress(unittest.TestCase):
    def test_drops_points_within_threshold(self):
        points = [(i * 0.25, (0.5,)) for i in range(100)]
        out = compose.compress(points, 0.02)
        self.assertEqual(len(out), 2)

    def test_keeps_real_changes(self):
        points = [(0.0, (0.0,)), (1.0, (0.0,)), (2.0, (1.0,)), (3.0, (1.0,))]
        out = compose.compress(points, 0.02)
        self.assertIn((2.0, (1.0,)), out)

    def test_always_keeps_the_ends(self):
        points = [(0.0, (0.0,)), (1.0, (0.001,)), (2.0, (0.002,))]
        out = compose.compress(points, 0.5)
        self.assertEqual(out[0], points[0])
        self.assertEqual(out[-1], points[-1])

    def test_short_input_is_returned_whole(self):
        self.assertEqual(len(compose.compress([(0.0, (0.0,))], 0.1)), 1)


def read_back(kept, at):
    """What a reader interpolating between the survivors actually sees.

    Every test above asks which points were kept. None of them asked what the
    line through those points looks like, which is the only thing a fan ever
    experiences, and that is how a four second gust came to blow for ninety
    four seconds without a single test noticing.
    """
    for i in range(len(kept) - 1):
        (t0, v0), (t1, v1) = kept[i], kept[i + 1]
        if t0 <= at <= t1:
            if t1 == t0:
                return v0[0]
            return v0[0] + (v1[0] - v0[0]) * (at - t0) / (t1 - t0)
    return kept[-1][1][0]


class TestCompressKeepsTheShape(unittest.TestCase):
    """What the curve says when it is read back, which is the point of it."""

    def test_a_step_stays_a_step(self):
        fps = 4
        series = [0.0] * (100 * fps) + [0.55] * (4 * fps) + [0.0] * (20 * fps)
        points = [(i / fps, (v,)) for i, v in enumerate(series)]
        kept = compose.compress(points, 0.02)

        # Silent for the whole hundred seconds, not ramping through them.
        for at in (10, 50, 90, 99):
            self.assertAlmostEqual(read_back(kept, at), 0.0, places=6,
                                   msg="the fan was already running at %ds" % at)
        # And the gust is there, at full, when it should be.
        self.assertAlmostEqual(read_back(kept, 101), 0.55, places=6)
        self.assertAlmostEqual(read_back(kept, 110), 0.0, places=6)

    def test_a_ramp_is_not_padded(self):
        """The fix costs nothing where there was nothing wrong: a curve that
        genuinely rises has its own frame before every kept point already."""
        fps = 4
        series = [i / 100.0 for i in range(100)]
        points = [(i / fps, (v,)) for i, v in enumerate(series)]
        kept = compose.compress(points, 0.02)
        plain = [p for p in points if p in kept]
        self.assertEqual(len(kept), len(plain))
        for at in (5, 12, 20):
            self.assertAlmostEqual(read_back(kept, at), at * fps / 100.0, places=2)

    def test_it_still_compresses(self):
        """A holding point per change, not a point per frame. The whole reason
        this function exists is that a score has to stay openable."""
        fps = 4
        series = ([0.0] * (30 * fps) + [0.8] * (2 * fps)) * 10
        points = [(i / fps, (v,)) for i, v in enumerate(series)]
        kept = compose.compress(points, 0.02)
        self.assertLess(len(kept), len(points) / 20)

    def test_the_worst_case_is_bounded(self):
        """Alternating every frame is the shape that cannot be compressed. It
        must not come out longer than it went in."""
        fps = 4
        series = [0.0 if i % 2 else 1.0 for i in range(200)]
        points = [(i / fps, (v,)) for i, v in enumerate(series)]
        kept = compose.compress(points, 0.02)
        self.assertLessEqual(len(kept), len(points))


class TestRender(unittest.TestCase):
    def setUp(self):
        self.meta = {"title": "Dune", "duration": 9312.0,
                     "hash": "sha256:abc", "fps": 24.0}
        self.tracks = [{"instrument": "light.ambient",
                        "points": [(0.0, {"r": 0.0, "g": 0.0, "b": 0.0}),
                                   (10.0, {"r": 1.0, "g": 0.5, "b": 0.25})]}]

    def test_renders_the_expected_fields(self):
        out = compose.render(self.meta, self.tracks)
        self.assertIn('componium = "0.1"', out)
        self.assertIn('title = "Dune"', out)
        self.assertIn('duration = "02:35:12.000"', out)
        self.assertIn('instrument = "light.ambient"', out)
        self.assertIn('t = "00:00:10.000"', out)

    def test_warns_that_output_is_a_proposal(self):
        # The header is a safety control, not decoration: a generated score
        # has not been checked against what a rig can survive.
        out = compose.render(self.meta, self.tracks)
        self.assertIn("proposal", out.lower())

    def test_omits_hash_when_absent(self):
        meta = dict(self.meta, hash="")
        self.assertNotIn("hash =", compose.render(meta, self.tracks))


class TestSourceSurvivesRendering(unittest.TestCase):
    """What a cue says about where it came from, written whole.

    The source is the only trace of why a cue exists. It is read by a person
    reviewing a score and asking whether the machine was right, so it has to
    come out the way it went in. It once came out as
    " v i s i o n :   d u s t " because a replace() lost its escape and replaced
    the empty string instead of a backslash.
    """

    def render_source(self, said):
        meta = {"title": "T", "duration": 10, "fps": 24, "hash": ""}
        track = {
            "instrument": "fog.left",
            "type": "cue",
            "cues": [{"t": 1.0, "action": "burst",
                      "params": {"output": 0.7}, "duration": 3.0,
                      "source": said}],
        }
        for line in compose.render(meta, [track]).splitlines():
            if "source =" in line:
                return line.split("source = ")[1].strip().rstrip(" },").strip('"')
        return None

    def test_a_vision_source_reads_as_written(self):
        self.assertEqual(self.render_source("vision: dust"), "vision: dust")

    def test_every_character_is_not_spaced_out(self):
        # The exact fault: replacing the empty string puts a space between
        # every character, so the length gives it away on its own.
        said = "vision: dust"
        self.assertEqual(len(self.render_source(said)), len(said))

    def test_a_backslash_cannot_end_the_string_early(self):
        # What the replace is actually for. A trailing backslash would escape
        # the closing quote and make the score unparseable.
        out = self.render_source("vision: dust\\")
        self.assertNotIn(chr(92), out)  # no backslash survives
        self.assertTrue(out.startswith("vision: dust"))

    def test_a_quote_cannot_end_the_string_early(self):
        out = self.render_source('he said "go"')
        self.assertNotIn(chr(34), out)  # no quote survives


if __name__ == "__main__":
    unittest.main()


class CueTracksDeclareTheirColourSpace(unittest.TestCase):
    """Flashes are written in hue, and every light driver reads red.

    The conversion between them is turned on by the track saying which space it
    is in. Curves said so and cues did not, so every flash reached its fixture
    carrying three parameters no driver reads and none of the three it does. The
    light stayed dark and the cue was acknowledged, counted and logged.
    """

    def test_a_flash_track_says_it_is_hsi(self):
        track = compose._cue_track("light.event", [
            {"t": "00:00:47.708", "action": "flash", "duration": "200ms",
             "params": {"h": 0.2178, "s": 0.3624, "i": 1.0}},
        ])
        self.assertEqual("hsi", track.get("space"))

    def test_an_rgb_track_says_so_too(self):
        track = compose._cue_track("light.ambient", [
            {"t": "00:00:12.100", "action": "flash",
             "params": {"r": 1.0, "g": 1.0, "b": 1.0}},
        ])
        self.assertEqual("rgb", track.get("space"))

    def test_a_track_that_is_not_a_colour_declares_nothing(self):
        # A gust is an intensity and a spray is an output. Neither is a colour,
        # and claiming a space for them would be a lie the reader acts on.
        track = compose._cue_track("wind.main", [
            {"t": "00:00:10.000", "action": "gust", "params": {"intensity": 0.8}},
        ])
        self.assertIsNone(track.get("space"))

    def test_the_space_survives_being_written_out(self):
        # The declaration is only worth anything if it reaches the file.
        track = compose._cue_track("light.event", [
            {"t": 1.0, "action": "flash", "duration": 0.2,
             "params": {"h": 0.5, "s": 1.0, "i": 1.0}},
        ])
        text = compose.render({"title": "t", "duration": 1.0, "fps": 24.0}, [track])
        self.assertIn('space = "hsi"', text)
