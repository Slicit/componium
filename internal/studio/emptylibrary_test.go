package studio

import (
	"os"
	"path/filepath"
	"testing"
)

// A studio pointed at an empty library has to open.
//
// This is what every new installation is, and it used to be fatal: the studio
// refused to start because no score was found in the scores directory, which
// is a directory whose whole purpose is to be filled by the page that would
// not open. On a server install the symptom was a container restarting
// forever with a message about a missing file nobody had asked for.
//
// Refusing is still right when a score was named and is not there. That case
// is the test below.
func TestAnEmptyLibraryOpensOnAnEmptyScore(t *testing.T) {
	dir := t.TempDir()
	media := filepath.Join(dir, "media")
	scores := filepath.Join(dir, "scores")
	for _, d := range []string{media, scores} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	s, err := New(Options{Media: media, Scores: scores})
	if err != nil {
		t.Fatalf("a new installation could not start: %v", err)
	}
	if s.sc == nil {
		t.Fatal("started with no score at all, which nothing downstream expects")
	}

	// Written rather than held in memory, because every path that follows
	// expects a score with somewhere to be saved.
	path := filepath.Join(scores, "untitled.componium")
	if _, err := os.Stat(path); err != nil {
		t.Errorf("the empty score was not written: %v", err)
	}

	// The format refuses a score with no tracks, so the empty one carries a
	// single empty track. If that stops being true this fails here rather than
	// as a container restart loop on somebody's server.
	if len(s.sc.Tracks) == 0 {
		t.Error("the empty score has no track, which the format will not save")
	}
}

// The starter track names an instrument this installation actually has.
//
// A placeholder naming hardware nobody owns is worse than useless: the studio
// would offer a track addressed at nothing, and the first thing a person did
// with it would fail for a reason they could not see.
func TestTheEmptyScoreIsAddressedAtTheRig(t *testing.T) {
	dir := t.TempDir()
	media := filepath.Join(dir, "media")
	scores := filepath.Join(dir, "scores")
	for _, d := range []string{media, scores} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	rigPath := filepath.Join(dir, "rig.toml")
	rig := `[rig]
name = "test"

[[instrument]]
id = "light.ambient"
kind = "light"
driver = "virtual"
`
	if err := os.WriteFile(rigPath, []byte(rig), 0o644); err != nil {
		t.Fatal(err)
	}

	s, err := New(Options{Media: media, Scores: scores, Rig: rigPath})
	if err != nil {
		t.Fatalf("could not start: %v", err)
	}
	if got := s.sc.Tracks[0].Instrument; got != "light.ambient" {
		t.Errorf("the empty track is addressed at %q, not at the rig's instrument", got)
	}
}

// Naming a score that is not there is still an error.
//
// The change above must not turn a typo into a silently empty studio: somebody
// who said -score and got an empty timeline would conclude their score was
// corrupt.
func TestANamedScoreThatIsMissingStillRefuses(t *testing.T) {
	dir := t.TempDir()
	if _, err := New(Options{Score: filepath.Join(dir, "nope.componium")}); err == nil {
		t.Error("a score that does not exist was accepted")
	}
}
