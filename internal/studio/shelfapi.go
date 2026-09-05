package studio

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"

	"github.com/Slicit/componium/internal/rig"
)

// Choosing which rig is in use.
//
// A bench with a board on it, the room as it actually stands, and the
// demonstration that needs no hardware are three different rigs, and switching
// between them by editing a flag and restarting a container is how people end
// up with one file that is none of them.
//
// The choice is a file on the shelf rather than a setting in the studio, and
// that is deliberate. `-rig` takes a directory as well as a file, so the
// conductor pointed at the same shelf plays whatever was chosen in the browser.
// A selection only the studio knew about would be a selection the thing holding
// the mains does not.

// handleRigs lists the shelf, or moves it.
func (s *Server) handleRigs(w http.ResponseWriter, r *http.Request) {
	/* Changing the rig while the room is being driven puts the room away first.
	 *
	 * An armed session holds the instruments it built when it was armed, so a
	 * switch on its own would leave the show driving the rig nobody is looking
	 * at any more: the old boards still moving, the new ones silent, and the
	 * page reporting that everything is live. Disarming takes the old rig to
	 * safe on the way out, which is the only version of this that ends with
	 * nothing running that nobody asked for.
	 *
	 * Not re-armed afterwards. Going live is a deliberate act with a red button,
	 * and starting a different rig on somebody's behalf because they changed a
	 * dropdown is not the same decision they made a minute ago.
	 *
	 * Done before the lock rather than under it: disarming waits for the show
	 * loop to finish, and holding the studio's lock while waiting on another
	 * goroutine is how a deadlock gets written.
	 */
	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		if changing, name := s.rigIsChanging(r); changing {
			s.disarmLive()
			s.liveMu.Lock()
			s.liveProblem = "the rig changed to " + name + ", so the room was put " +
				"away. Go live again to drive it."
			s.liveMu.Unlock()
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.rigDir == "" {
		// Started with one file, or with none. Answering with the single rig
		// rather than an error keeps the page's one code path.
		writeJSON(w, http.StatusOK, map[string]any{
			"shelf":   false,
			"current": filepath.Base(s.rigPath),
			"rigs":    []string{},
		})
		return
	}

	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		var want struct {
			Rig string `json:"rig"`
		}
		if err := json.NewDecoder(r.Body).Decode(&want); err != nil {
			http.Error(w, "could not read that: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := rig.Select(s.rigDir, want.Rig); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := s.openChosenRig(); err != nil {
			// The choice is recorded and the file will not load. Say both, or
			// the next person wonders why the studio came up on a rig nobody
			// picked.
			http.Error(w, "chose "+want.Rig+", but it will not load: "+err.Error(),
				http.StatusBadRequest)
			return
		}
	}

	files, err := rig.Files(s.rigDir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"shelf":   true,
		"current": filepath.Base(s.rigPath),
		"rigs":    files,
	})
}

// openChosenRig points the studio at whatever the shelf now says. The caller
// holds the lock.
func (s *Server) openChosenRig() error {
	path, err := rig.Resolve(s.rigDir)
	if err != nil {
		return err
	}
	cfg, err := rig.Load(path)
	if err != nil {
		return err
	}
	s.rigPath = path
	s.rig = cfg
	return nil
}

// rigIsChanging reports whether this request picks a different rig, and reads
// the body in a way that leaves it readable again.
//
// Asked before anything is disarmed, because a page re-selecting the rig it is
// already on should not stop a show. That happens: the shelf redraws, a radio
// reports a change, and nothing about it was meant as an instruction.
func (s *Server) rigIsChanging(r *http.Request) (bool, string) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	r.Body = io.NopCloser(bytes.NewReader(body))
	if err != nil {
		return false, ""
	}
	var want struct {
		Rig string `json:"rig"`
	}
	if json.Unmarshal(body, &want) != nil || want.Rig == "" {
		return false, ""
	}

	s.mu.Lock()
	same := filepath.Base(s.rigPath) == want.Rig
	s.mu.Unlock()
	if same {
		return false, ""
	}

	s.liveMu.Lock()
	armed := s.live != nil
	s.liveMu.Unlock()
	return armed, want.Rig
}
