package studio

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestTheWindGateDefaultsAndPersists(t *testing.T) {
	dir := t.TempDir()
	j := &Jobs{scores: dir}

	if got := j.WindGate(); got != DefaultWindGate {
		t.Errorf("with no file, wanted the default %v, got %v", DefaultWindGate, got)
	}

	if err := j.SetWindGate(0.4); err != nil {
		t.Fatal(err)
	}
	if got := j.WindGate(); got != 0.4 {
		t.Errorf("after setting 0.4, got %v", got)
	}

	// Zero is a real answer and not an absent one: it means the floor is off.
	// A plain float in the file could not tell those apart, which is why the
	// field is a pointer.
	if err := j.SetWindGate(0); err != nil {
		t.Fatal(err)
	}
	if got := j.WindGate(); got != 0 {
		t.Errorf("zero was read back as %v, so it was mistaken for unset", got)
	}
}

func TestAnImpossibleGateIsBroughtBackInsideTheRange(t *testing.T) {
	dir := t.TempDir()
	j := &Jobs{scores: dir}
	for _, c := range []struct {
		in, want float64
	}{
		{-1, 0},
		{2.5, 1},
		{0.25, 0.25},
	} {
		if err := j.SetWindGate(c.in); err != nil {
			t.Fatal(err)
		}
		if got := j.WindGate(); got != c.want {
			t.Errorf("%v was kept as %v, wanted %v", c.in, got, c.want)
		}
	}
}

func TestAnUnreadableSettingsFileFallsBackRatherThanFailing(t *testing.T) {
	// The scores directory is somewhere a person can reach. A file they have
	// broken by hand should cost them their setting, not their analysis.
	dir := t.TempDir()
	j := &Jobs{scores: dir}
	if err := os.WriteFile(filepath.Join(dir, analysisFile), []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := j.WindGate(); got != DefaultWindGate {
		t.Errorf("a broken file gave %v rather than the default", got)
	}
}

func TestEveryBuildIsToldTheGate(t *testing.T) {
	dir := t.TempDir()
	j := &Jobs{scores: dir}
	if err := j.SetWindGate(0.4); err != nil {
		t.Fatal(err)
	}
	args := j.windGateArgs()
	if len(args) != 2 || args[0] != "--wind-gate" || args[1] != "0.4" {
		t.Errorf("the build was told %v", args)
	}
}

// The studio and the composer have to mean the same number by "default".
//
// They are two files in two languages and nothing else connects them, so this
// reads the constant out of wind.py. The failure it guards is quiet in the
// worst way: the studio would pass a number that is perfectly valid, every
// score would be built with it, and the only symptom would be that the fan
// does not behave the way the composer's own documentation says it does.
func TestTheDefaultMatchesTheComposer(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(root, "composer", "wind.py"))
	if err != nil {
		t.Skipf("composer not beside this checkout: %v", err)
	}
	m := regexp.MustCompile(`(?m)^CARRIED_GATE\s*=\s*([0-9.]+)`).FindSubmatch(body)
	if m == nil {
		t.Fatal("wind.py no longer defines CARRIED_GATE")
	}
	want := strings.TrimRight(strings.TrimRight(string(m[1]), "0"), ".")
	got := strings.TrimRight(strings.TrimRight(formatGate(DefaultWindGate), "0"), ".")
	if want != got {
		t.Errorf("wind.py says CARRIED_GATE is %s, the studio defaults to %s", want, got)
	}
}
