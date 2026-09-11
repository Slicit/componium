package score_test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/Slicit/componium/internal/score"
)

// The score in the README is a score this build can read.
//
// It was not. For months it showed a cue written as
//
//	{ t = "...", action = "gust", intensity = 0.8, duration = "4s" }
//
// with the intensity beside the action rather than inside `params`. That is
// not a parse error: TOML ignores a key the struct does not have, so the file
// validated, printed a clean summary, and loaded with an empty parameter map.
// A fan told to gust at nothing. The only symptom is silence, in a feature
// whose whole job is to make something happen.
//
// It also wrote colours as 0 to 255 while every real score in the repository
// writes 0 to 1.
//
// So the README's own block is extracted and loaded here rather than copied
// into a fixture, because a fixture is a second thing that can agree with the
// code while the documentation quietly stops doing so.
func TestTheScoreInTheReadmeLoads(t *testing.T) {
	root := filepath.Join("..", "..")
	body, err := os.ReadFile(filepath.Join(root, "README.md"))
	if err != nil {
		t.Fatal(err)
	}

	// Three backticks, written as escapes rather than as themselves.
	//
	// check-edits.sh greps Go files for two adjacent backticks, because that
	// is what a shell leaves behind when it has eaten the contents of a raw
	// string or a struct tag, and both of those have shipped here. A markdown
	// fence written literally contains exactly that pattern, so this file
	// broke the check the day it was added: a test about the README made the
	// tool that guards every edit report a mangled file.
	fence := "\x60\x60\x60"
	found := regexp.MustCompile("(?s)" + fence + "toml\n(.*?)" + fence).FindSubmatch(body)
	if found == nil {
		t.Fatal("the README no longer shows a score; if that is deliberate, delete this test")
	}

	path := filepath.Join(t.TempDir(), "readme.componium")
	if err := os.WriteFile(path, found[1], 0o644); err != nil {
		t.Fatal(err)
	}

	sc, err := score.Load(path)
	if err != nil {
		t.Fatalf("the score in the README does not load: %v", err)
	}

	// Loading is not enough, which is the whole point: the broken version
	// loaded. Every cue has to arrive carrying what it was written with.
	cues := 0
	for _, track := range sc.Tracks {
		for _, c := range track.Cues {
			cues++
			if len(c.Params) == 0 {
				t.Errorf("the %s cue at %s arrives with no parameters, so whatever the "+
					"README shows is being dropped on the way in", track.Instrument, c.T)
			}
		}
		for _, p := range track.Points {
			for channel, v := range p.Value {
				if v < 0 || v > 1 {
					t.Errorf("%s writes %s as %v; channels run 0 to 1", track.Instrument, channel, v)
				}
			}
		}
	}
	if cues == 0 {
		t.Error("the README's score has no cue in it, so this checks nothing")
	}
}
