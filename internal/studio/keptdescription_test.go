package studio

import (
	"os"
	"path/filepath"
	"testing"
)

// A reuse build has to tell the composer what it is reusing.
//
// The failure this guards is silent in both directions. Without the argument
// the composer still produces a score, still writes a wind track, and still
// looks entirely reasonable; it is simply the pre-2026-09-05 fan, driven by
// optical expansion alone, on for most of the film. Nothing errors and no
// counter moves, which is why it survived two feature-length analyses.
func TestAKeptDescriptionIsPassedToAReuseBuild(t *testing.T) {
	dir := t.TempDir()
	j := &Jobs{scores: dir}
	film := "Wanted.2008.BluRay.mkv"

	if got := j.keptDescription(film, false); got != nil {
		t.Errorf("with no description on disk, wanted nothing, got %v", got)
	}

	seen := j.SeenPath(film)
	if err := os.MkdirAll(filepath.Dir(seen), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(seen, []byte("{\"t\":1.0}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := j.keptDescription(film, false)
	if len(got) != 2 || got[0] != "--seen" || got[1] != seen {
		t.Errorf("a reuse build did not get the description: %v", got)
	}

	// And not while the model is being run: the composer has the real
	// observations in hand, and a file would be the same answer from a worse
	// source, one analysis out of date.
	if got := j.keptDescription(film, true); got != nil {
		t.Errorf("a looking build was handed a file anyway: %v", got)
	}
}
