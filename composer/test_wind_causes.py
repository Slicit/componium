"""What the fan is told, and why.

Every case here came from measuring the old model or the first version of this
one against big-buck-bunny, so each is a thing that actually happened rather
than a thing that could.
"""

import sys
import unittest

sys.path.insert(0, "composer")

import wind


FPS = 4.0
FRAMES = int(120 * FPS)


def seen(at, said, labels=()):
    return {"t": at, "seen": said, "labels": list(labels)}


def at(series, when):
    return series[int(when * FPS)]


class PushInIsNotWind(unittest.TestCase):
    """The fault that started this.

    The four moments the old model blew hardest were a tranquil garden, a bird
    perched singing, a rabbit standing still and a squirrel hanging from a
    branch. Expansion cannot tell moving through air from looking closer at a
    thing, because those make the same picture.
    """

    def test_a_push_in_on_a_still_scene_is_capped(self):
        expansion = [1.0] * FRAMES
        got = wind.series(expansion, [seen(10, "A tranquil garden with a stream.")],
                          FPS, FRAMES)
        self.assertLessEqual(at(got, 10), wind.CARRIED_CAP)

    def test_travelling_lifts_the_cap(self):
        """A forward dolly is real evidence when something agrees with it."""
        expansion = [1.0] * FRAMES
        got = wind.series(
            expansion,
            [seen(10, "A squirrel glides through the forest canopy.", ["scene-active"])],
            FPS, FRAMES)
        self.assertGreater(at(got, 10), wind.CARRIED_CAP)


class SmallThingsDoingWindyVerbs(unittest.TestCase):
    """The fault the first version of this introduced.

    Prose about a film is full of butterflies fluttering and rain falling, and
    a list of words is read as an invitation to find them. Measured: 0.55 for
    "a purple butterfly fluttering nearby", 0.70 for "a butterfly flies past",
    0.70 for "rain visibly falling".
    """

    def test_a_butterfly_is_not_weather(self):
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "A white dog lies on grass, looking up at a "
                                    "purple butterfly fluttering nearby.")],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), 0.0)

    def test_a_butterfly_is_not_flight(self):
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "A rabbit and a squirrel stand near a tree, "
                                    "with a butterfly flying nearby.")],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), 0.0)

    def test_rain_falling_is_not_the_viewer_falling(self):
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "Rain visibly falling against a blue background.",
                                ["water"])],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), 0.0)


class WeatherNeedsNoCorroboration(unittest.TestCase):
    """Air itself is the subject, and there is no small thing that is a gale.

    This is the case expansion is structurally blind to: the camera is still
    and the world is moving.
    """

    def test_a_breeze_blows_with_the_camera_still(self):
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "A field of tall grass sways gently in the "
                                    "breeze under a clear sky.")],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), wind.WEATHER_LEVEL)

    def test_a_gale_does_not_wait_to_be_agreed_with(self):
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "Trees bend in the howling wind.")], FPS, FRAMES)
        self.assertEqual(at(got, 10), wind.WEATHER_LEVEL)

    def test_swaying_alone_does(self):
        """Without the word wind in it, a character swaying is a character."""
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "A figure sways on their feet, dazed.")],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), 0.0)


class ABlastIsAShape(unittest.TestCase):
    """An explosion is the clearest wind event a film has, and the old model
    was told nothing about it: the label already existed and went to the
    fogger alone."""

    def test_an_explosion_gusts_and_decays(self):
        got = wind.series([0.0] * FRAMES, [seen(10, "A fireball erupts.", ["explosion"])],
                          FPS, FRAMES)
        peak = max(got[int(9 * FPS):int(13 * FPS)])
        self.assertAlmostEqual(peak, wind.BLAST_LEVEL, places=2)
        # Gone a few seconds later, because a shockwave is an event and a fan
        # left at full is a fan nobody notices when the next one lands.
        self.assertLess(at(got, 14), 0.2)

    def test_a_blast_beats_whatever_it_lands_on(self):
        got = wind.series([0.3] * FRAMES,
                          [seen(10, "An explosion tears through the trees.", ["explosion"]),
                           seen(10, "Trees bend in the wind.")],
                          FPS, FRAMES)
        self.assertGreater(max(got[int(10 * FPS):int(11 * FPS)]), wind.WEATHER_LEVEL)


class NoVisionMeansNoChange(unittest.TestCase):
    def test_a_film_analysed_without_vision_behaves_as_it_did(self):
        """Most people run this without a GPU.

        The cap exists to stop the motion signal contradicting the picture. With
        no picture there is nothing to contradict, and quietly halving the wind
        of everybody who cannot run a model would be a poor trade.
        """
        expansion = [0.9] * FRAMES
        self.assertEqual(wind.series(expansion, [], FPS, FRAMES), [0.9] * FRAMES)
        self.assertEqual(wind.series(expansion, None, FPS, FRAMES), [0.9] * FRAMES)


class ItSaysWhy(unittest.TestCase):
    def test_each_moment_names_its_cause(self):
        """A track nobody can explain is a track nobody trusts."""
        got = wind.explain([0.0] * FRAMES,
                           [seen(10, "A field of grass sways in the breeze."),
                            seen(40, "A fireball erupts.", ["explosion"])],
                           FPS, FRAMES)
        self.assertEqual(got[int(10 * FPS)][1], "weather")
        self.assertEqual(got[int(40 * FPS)][1], "blast")
        self.assertEqual(got[int(80 * FPS)][1], "still")


class ADirectAnswerBeatsAGuess(unittest.TestCase):
    """The prompt now asks about wind and about being carried.

    Only a film analysed since will carry the labels, which is why the word
    matching stays. When a label is there it is believed without corroboration:
    it is an answer to the question rather than an inference from a sentence
    about something else, and `carried` asks about the camera, which is the
    exact ambiguity the words cannot resolve.
    """

    def test_a_wind_label_needs_no_agreement(self):
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "A quiet street.", ["wind"])], FPS, FRAMES)
        self.assertEqual(at(got, 10), wind.WEATHER_LEVEL)

    def test_carried_is_about_the_camera(self):
        """The sentence can be about anything; the label is about the view."""
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "Treetops rush past below.", ["carried"])],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), wind.RIDE_LEVEL)

    def test_a_bird_in_shot_is_still_not_carried(self):
        """Without the label, and without the picture agreeing, a creature
        flying across a still frame is scenery."""
        got = wind.series([0.0] * FRAMES,
                          [seen(10, "A purple bird flies above a bat hanging "
                                    "upside down against a blue sky.")],
                          FPS, FRAMES)
        self.assertEqual(at(got, 10), 0.0)


if __name__ == "__main__":
    unittest.main()
