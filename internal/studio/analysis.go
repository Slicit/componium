package studio

import (
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

// Settings the analysis reads, kept where the scores are.
//
// The first of them, and the file is shaped for more: every knob in the
// composer that is a judgement about a room rather than a fact about a film
// belongs here eventually. Until now the only way to change one was to edit
// the composer, which meant a person with an opinion about their own fan had
// to have an opinion about Python.
//
// Global rather than per film. The wind gate answers "how much wind do I want
// in this room", which is the same answer for every film in it, and a setting
// that has to be given twenty times is a setting nobody changes.
//
// Beside the scores rather than beside the binary: the scores directory is the
// thing an operator owns and backs up, and a studio pointed at a different one
// is a different room with different answers.
type analysisSettings struct {
	// WindGate is the floor under bare optical expansion.
	//
	// Zero is a real value and means the floor is off, so this is a pointer:
	// a plain float cannot tell "the operator asked for none" from "the file
	// does not mention it", and those want different answers.
	WindGate *float64 `json:"windGate,omitempty"`
}

const analysisFile = "analysis.json"

// DefaultWindGate is what the composer uses when nobody has said otherwise.
//
// Kept in step with composer/wind.py's CARRIED_GATE by a test, because the
// studio passing a number the composer would have chosen anyway is harmless
// and the studio passing a different one silently is not.
const DefaultWindGate = 0.25

func (j *Jobs) analysisPath() string {
	return filepath.Join(j.scores, analysisFile)
}

// WindGate is the floor to analyse with, and the default when none is set.
func (j *Jobs) WindGate() float64 {
	body, err := os.ReadFile(j.analysisPath())
	if err != nil {
		return DefaultWindGate
	}
	var s analysisSettings
	if err := json.Unmarshal(body, &s); err != nil || s.WindGate == nil {
		return DefaultWindGate
	}
	return clampGate(*s.WindGate)
}

// clampGate keeps the number inside the range that means anything.
//
// Above 1.0 the floor is higher than any level expansion can produce, which is
// "expansion contributes nothing at all". That is a coherent thing to want, so
// it is allowed and 1.0 is where it saturates rather than where it is refused.
func clampGate(v float64) float64 {
	if math.IsNaN(v) || v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// SetWindGate records a floor. It is written whole, so a bad write loses a
// setting rather than corrupting a file that other settings will later share.
func (j *Jobs) SetWindGate(v float64) error {
	v = clampGate(v)
	body, err := json.MarshalIndent(analysisSettings{WindGate: &v}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(j.scores, 0o755); err != nil {
		return err
	}
	return os.WriteFile(j.analysisPath(), append(body, '\n'), 0o644)
}

// handleAnalysis reads and writes the settings the analysis uses.
func (s *Server) handleAnalysis(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{
			"windGate":        s.jobs.WindGate(),
			"windGateDefault": DefaultWindGate,
		})
	case http.MethodPost, http.MethodPut:
		body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unreadable"})
			return
		}
		var in struct {
			WindGate *float64 `json:"windGate"`
		}
		if err := json.Unmarshal(body, &in); err != nil || in.WindGate == nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "windGate is required, as a number"})
			return
		}
		if err := s.jobs.SetWindGate(*in.WindGate); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"windGate":        s.jobs.WindGate(),
			"windGateDefault": DefaultWindGate,
			// Said plainly, because the number changing and nothing moving is
			// exactly how a setting gets a reputation for doing nothing. It
			// applies to the next analysis, not to any score already written.
			"note": "applies to the next rebuild; scores already built are unchanged",
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

// formatGate writes the number the way the composer will read it back.
//
// 'g' with no precision so 0.25 stays "0.25" rather than "0.25000000", and
// shared with the test that checks the two languages agree on the default.
func formatGate(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}

// windGateArgs is what a build is told about the floor.
func (j *Jobs) windGateArgs() []string {
	return []string{"--wind-gate", formatGate(j.WindGate())}
}
