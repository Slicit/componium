package studio

// Who may do what, and the table that says so.
//
// The studio had no authentication of any kind, which was defensible while it
// was a thing you ran on your own laptop against your own films and stopped
// being defensible the moment it was something you install on a server. It can
// delete films, rewrite rigs, hold the secret for every board in the house and
// drive real hardware in a room with people in it.
//
// # Default deny, from one table
//
// Every route is listed in `access` below with the weakest role that may read
// it and the weakest that may change it. A request whose route is not in the
// table is refused, and a test walks the mux and fails if a registered route
// is missing. That is the only arrangement that survives somebody adding a
// handler in six months: an allow-list you can forget to update is an
// allow-list that is wrong, and here forgetting locks the new route down
// rather than opening it.
//
// The split is read against write rather than method by method because that is
// how these handlers are actually built: one function serving GET to look and
// POST to change. Anything that is not GET or HEAD is a change.
//
// # What is deliberately open
//
// `/firmware/` is fetched by an ESP32 doing an over-the-air update. A board
// cannot sign in, has no cookie jar and no way to be told a password, so
// putting it behind the session would mean no board could ever update itself.
// It serves image files and nothing else; the dangerous half of that feature,
// telling a board to go and fetch one, is an admin route.
//
// `/signin` and `/api/session` are open for the obvious reason.

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/Slicit/componium/internal/users"
)

const (
	sessionCookie = "componium_session"
	// How long a sign-in lasts without being used. Refreshed on every request,
	// so somebody working in the studio is never logged out underneath
	// themselves, and a browser left closed for a fortnight is.
	sessionIdle = 14 * 24 * time.Hour
	// Where the first administrator's password is left. A file on the host
	// rather than a line in a log or a value in the environment: logs get
	// shipped somewhere and environments get printed by every debug page ever
	// written.
	initialPasswordFile = "initial-admin-password.txt"
)

// access is the weakest role that may read a route, and the weakest that may
// change through it.
type access struct {
	read  users.Role
	write users.Role
}

// public is a route that needs no session at all.
var public = access{}

func (a access) open() bool { return a.read == "" && a.write == "" }

// The table. Keys are the patterns registered on the mux, exactly.
var routeAccess = map[string]access{
	// The application itself, and the media it plays. Reading is watching.
	"/":        {users.Viewer, users.Admin},
	"/v2":      {users.Viewer, users.Admin},
	"/v2/":     {users.Viewer, users.Admin},
	"/legacy":  {users.Viewer, users.Admin},
	"/legacy/": {users.Viewer, users.Admin},
	"/media":   {users.Viewer, users.Admin},

	// Looking at a score, a rig, a library. Changing them is authoring.
	"/api/score":        {users.Viewer, users.Operator},
	"/api/score/export": {users.Viewer, users.Operator},
	"/api/rig":          {users.Viewer, users.Admin},
	"/api/rig/options":  {users.Viewer, users.Admin},
	"/api/library":      {users.Viewer, users.Operator},
	"/api/media":        {users.Viewer, users.Operator},
	"/api/jobs":         {users.Viewer, users.Operator},
	"/api/versions":     {users.Viewer, users.Operator},
	"/api/seen":         {users.Viewer, users.Operator},
	"/api/layout":       {users.Viewer, users.Operator},
	"/api/context":      {users.Viewer, users.Operator},

	// Making a score, and unmaking a film. Authoring.
	"/api/build":   {users.Operator, users.Operator},
	"/api/prepare": {users.Operator, users.Operator},
	"/api/upload":  {users.Operator, users.Operator},
	"/api/delete":  {users.Operator, users.Operator},

	// Driving the room. An operator runs shows; a viewer may see that one is
	// running and may not start one.
	"/api/live":      {users.Viewer, users.Operator},
	"/api/live/at":   {users.Viewer, users.Operator},
	"/api/live/trim": {users.Viewer, users.Operator},

	// The hardware and the settings behind it. Admin, all of it: a rig is what
	// the conductor believes is on the end of every wire, the board list is
	// credentials, and the analysis settings change every score built after.
	"/api/rigs":          {users.Viewer, users.Admin},
	"/api/rigs/new":      {users.Admin, users.Admin},
	"/api/rigs/delete":   {users.Admin, users.Admin},
	"/api/rigs/rename":   {users.Admin, users.Admin},
	"/api/rigs/import":   {users.Admin, users.Admin},
	"/api/rigs/export":   {users.Viewer, users.Admin},
	"/api/boards":        {users.Admin, users.Admin},
	"/api/boards/check":  {users.Admin, users.Admin},
	"/api/boards/update": {users.Admin, users.Admin},
	"/api/node":          {users.Admin, users.Admin},
	"/api/firmware":      {users.Admin, users.Admin},
	"/api/analysis":      {users.Viewer, users.Admin},
	"/api/users":         {users.Admin, users.Admin},

	// Open, and each for a reason given at the top of this file.
	"/firmware/":   public,
	"/signin":      public,
	"/api/session": public,
}

// ---------------------------------------------------------------- sessions

type session struct {
	name string
	role users.Role
	seen time.Time
}

type sessions struct {
	mu   sync.Mutex
	live map[string]*session
}

func newSessions() *sessions { return &sessions{live: map[string]*session{}} }

func (s *sessions) start(u users.User) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.live[token] = &session{name: u.Name, role: u.Role, seen: time.Now()}
	return token, nil
}

// get returns the session and marks it used, or nothing when it has expired.
func (s *sessions) get(token string) (session, bool) {
	if token == "" {
		return session{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	live, ok := s.live[token]
	if !ok {
		return session{}, false
	}
	if time.Since(live.seen) > sessionIdle {
		delete(s.live, token)
		return session{}, false
	}
	live.seen = time.Now()
	return *live, true
}

func (s *sessions) end(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.live, token)
}

// forget drops every session belonging to somebody.
//
// Called when a password changes or an account is removed. Without it, taking
// somebody's access away leaves them signed in for a fortnight, which is the
// opposite of what the person doing it believed they had done.
func (s *sessions) forget(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for token, live := range s.live {
		if strings.EqualFold(live.name, name) {
			delete(s.live, token)
		}
	}
}

// ------------------------------------------------------------------- guard

// who returns the signed-in user for a request, if there is one.
func (s *Server) who(r *http.Request) (session, bool) {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return session{}, false
	}
	return s.sessions.get(c.Value)
}

// guard wraps the mux so that nothing is reachable without the role for it.
func (s *Server) guard(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, pattern := mux.Handler(r)

		acc, known := routeAccess[pattern]
		if !known {
			// Either a route nobody classified, or a request matching nothing,
			// which Go answers with its own 404 handler under the empty
			// pattern. Both are refusals here; the test below makes the first
			// one impossible to ship.
			if pattern == "" {
				http.NotFound(w, r)
				return
			}
			writeJSON(w, http.StatusForbidden, map[string]string{
				"error": "this route has no access rule, so it is refused",
			})
			return
		}
		if acc.open() {
			mux.ServeHTTP(w, r)
			return
		}

		need := acc.write
		if r.Method == http.MethodGet || r.Method == http.MethodHead {
			need = acc.read
		}

		live, ok := s.who(r)
		if !ok {
			s.refuse(w, r, http.StatusUnauthorized, "sign in to use this studio")
			return
		}
		if !live.role.AtLeast(need) {
			s.refuse(w, r, http.StatusForbidden,
				fmt.Sprintf("this needs the %s role, and you are a %s", need, live.role))
			return
		}
		mux.ServeHTTP(w, r)
	})
}

// refuse answers in the shape the caller can use.
//
// A browser asking for a page gets sent to the sign-in form; anything else
// gets JSON. Redirecting an API call to an HTML page is how a fetch() ends up
// parsing a login form and reporting a syntax error.
func (s *Server) refuse(w http.ResponseWriter, r *http.Request, code int, why string) {
	wantsPage := r.Method == http.MethodGet &&
		strings.Contains(r.Header.Get("Accept"), "text/html") &&
		!strings.HasPrefix(r.URL.Path, "/api/")
	if wantsPage && code == http.StatusUnauthorized {
		to := "/signin?to=" + urlQueryEscape(r.URL.RequestURI())
		http.Redirect(w, r, to, http.StatusSeeOther)
		return
	}
	writeJSON(w, code, map[string]string{"error": why})
}

func urlQueryEscape(s string) string {
	return strings.NewReplacer("&", "%26", "?", "%3F", "#", "%23", " ", "%20").Replace(s)
}

// ------------------------------------------------------------------ routes

// handleSession is sign in, sign out, and who am I.
func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		live, ok := s.who(r)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"signedIn": false})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"signedIn": true, "name": live.name, "role": live.role,
		})

	case http.MethodPost:
		var in struct{ Name, Password string }
		body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
		if err != nil || json.Unmarshal(body, &in) != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unreadable"})
			return
		}
		u, ok := s.users.Authenticate(in.Name, in.Password)
		if !ok {
			// One message for a wrong name and a wrong password. Telling them
			// apart turns a password guess into a list of who works here.
			writeJSON(w, http.StatusUnauthorized,
				map[string]string{"error": "that name and password do not match"})
			return
		}
		token, err := s.sessions.start(u)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		http.SetCookie(w, s.cookie(r, token, sessionIdle))
		writeJSON(w, http.StatusOK, map[string]any{
			"signedIn": true, "name": u.Name, "role": u.Role,
		})

	case http.MethodDelete:
		if c, err := r.Cookie(sessionCookie); err == nil {
			s.sessions.end(c.Value)
		}
		http.SetCookie(w, s.cookie(r, "", -time.Hour))
		writeJSON(w, http.StatusOK, map[string]any{"signedIn": false})

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) cookie(r *http.Request, value string, age time.Duration) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookie,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		// Lax rather than Strict: Strict would drop the cookie when somebody
		// follows a link to the studio from anywhere else, which reads as being
		// randomly signed out. Lax still withholds it from a cross-site POST,
		// which is the request a forged form would make.
		SameSite: http.SameSiteLaxMode,
		// Only over TLS when the request came over TLS. Setting it
		// unconditionally would make the cookie invisible to a plain-HTTP
		// install, which is most of them, and nobody could sign in at all.
		Secure:  r.TLS != nil,
		MaxAge:  int(age.Seconds()),
		Expires: time.Now().Add(age),
	}
}

// handleUsers is the user list, and changes to it.
func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	type shown struct {
		Name    string     `json:"name"`
		Role    users.Role `json:"role"`
		Created string     `json:"created"`
	}
	list := func() {
		out := []shown{}
		for _, u := range s.users.Sorted() {
			out = append(out, shown{u.Name, u.Role, u.Created.Format(time.RFC3339)})
		}
		live, _ := s.who(r)
		writeJSON(w, http.StatusOK, map[string]any{
			"users": out, "you": live.name, "roles": users.Roles(),
		})
	}

	switch r.Method {
	case http.MethodGet:
		list()

	case http.MethodPost:
		var in struct {
			Action, Name, Password string
			Role                   users.Role
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8192))
		if err != nil || json.Unmarshal(body, &in) != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unreadable"})
			return
		}
		live, _ := s.who(r)

		var problem error
		switch in.Action {
		case "add":
			problem = s.users.Add(in.Name, in.Role, in.Password)
		case "password":
			problem = s.users.SetPassword(in.Name, in.Password)
			if problem == nil && !strings.EqualFold(in.Name, live.name) {
				// Somebody else changed their password, so whatever they were
				// doing with the old one stops now.
				s.sessions.forget(in.Name)
			}
		case "role":
			problem = s.users.SetRole(in.Name, in.Role)
			if problem == nil {
				s.sessions.forget(in.Name)
			}
		case "remove":
			if strings.EqualFold(in.Name, live.name) {
				// Not a rule about safety, a rule about surprise: removing
				// yourself signs you out mid-click and looks like a crash.
				problem = fmt.Errorf("you cannot remove yourself")
			} else {
				problem = s.users.Remove(in.Name)
				if problem == nil {
					s.sessions.forget(in.Name)
				}
			}
		default:
			problem = fmt.Errorf("no such action as %q", in.Action)
		}
		if problem != nil {
			writeJSON(w, http.StatusBadRequest,
				map[string]string{"error": strings.TrimPrefix(problem.Error(), "users: ")})
			return
		}
		list()

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}

// ------------------------------------------------------------- the first one

// ensureFirstAdmin creates an administrator when nobody exists yet.
//
// The password is generated rather than asked for, and written to a file
// beside the board list with 0600 on it. Not printed, not put in the
// environment, and not in the log: the installer reads that file, shows it
// once, and says where it is.
func ensureFirstAdmin(shelf *users.Shelf) (string, error) {
	if !shelf.Empty() {
		return "", nil
	}
	password, err := readablePassword()
	if err != nil {
		return "", err
	}
	if err := shelf.Add("admin", users.Admin, password); err != nil {
		return "", err
	}
	path := filepath.Join(filepath.Dir(shelf.Path()), initialPasswordFile)
	note := "The password for the administrator this installation created.\n" +
		"\n" +
		"Sign in as: admin\n" +
		"Password:   " + password + "\n" +
		"\n" +
		"Change it in the studio under Admin, Users, and then delete this file.\n" +
		"It is written here rather than shown in a log because logs get shipped\n" +
		"somewhere else and this should not go with them.\n"
	if err := writePrivate(path, note); err != nil {
		return "", fmt.Errorf("the administrator was created and %s could not be written: %w", path, err)
	}
	return path, nil
}

func writePrivate(path, body string) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.WriteString(body); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// readablePassword makes one somebody can retype off a screen.
//
// No l, 1, I, O or 0: the whole point is that it gets copied by hand once,
// from a terminal into a browser, and a character pair nobody can tell apart
// turns that into three attempts and a suspicion the system is broken.
func readablePassword() (string, error) {
	const alphabet = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"
	const length = 20
	raw := make([]byte, length)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	out := make([]byte, length)
	for i, b := range raw {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out), nil
}
