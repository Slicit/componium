package studio

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/Slicit/componium/internal/users"
)

// Every route this studio serves is classified, or it is refused.
//
// This is the test the whole arrangement rests on. An allow-list somebody can
// forget to update is an allow-list that is wrong, and the failure is silent
// and the wrong way round: a new handler that nobody classified would be
// reachable by anybody. Reading the registrations out of the source rather
// than out of the mux, because the mux cannot be asked what patterns it holds.
func TestEveryRouteHasAnAccessRule(t *testing.T) {
	body, err := os.ReadFile("studio.go")
	if err != nil {
		t.Fatal(err)
	}
	registered := map[string]bool{}
	for _, m := range regexp.MustCompile(`mux\.(?:HandleFunc|Handle)\("([^"]+)"`).FindAllSubmatch(body, -1) {
		registered[string(m[1])] = true
	}
	if len(registered) < 20 {
		t.Fatalf("only found %d routes, so the scan is broken rather than the table", len(registered))
	}

	var missing []string
	for pattern := range registered {
		if _, ok := routeAccess[pattern]; !ok {
			missing = append(missing, pattern)
		}
	}
	if len(missing) > 0 {
		t.Errorf("these routes have no rule in auth.go, so they are refused to everybody:\n  %s",
			strings.Join(missing, "\n  "))
	}

	// And the other direction: a rule for a route that no longer exists is
	// dead weight that reads as protection.
	var stale []string
	for pattern := range routeAccess {
		if !registered[pattern] {
			stale = append(stale, pattern)
		}
	}
	if len(stale) > 0 {
		t.Errorf("these rules name routes that are not registered:\n  %s",
			strings.Join(stale, "\n  "))
	}
}

// The three things that must be open, and nothing else.
func TestOnlyTheseRoutesAreOpen(t *testing.T) {
	var open []string
	for pattern, acc := range routeAccess {
		if acc.open() {
			open = append(open, pattern)
		}
	}
	want := map[string]string{
		"/firmware/":   "a board doing an over-the-air update cannot sign in",
		"/signin":      "the way in",
		"/api/session": "the way in",
	}
	for _, pattern := range open {
		if _, ok := want[pattern]; !ok {
			t.Errorf("%s is open to anybody, and nothing says why", pattern)
		}
	}
	if len(open) != len(want) {
		t.Errorf("expected %d open routes, found %d: %v", len(want), len(open), open)
	}
}

// ---------------------------------------------------------------- a studio

func signedInStudio(t *testing.T) (*Server, http.Handler, string) {
	t.Helper()
	dir := t.TempDir()
	media := filepath.Join(dir, "media")
	scores := filepath.Join(dir, "scores")
	for _, d := range []string{media, scores} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	s, err := New(Options{Media: media, Scores: scores, Users: filepath.Join(dir, "users.toml")})
	if err != nil {
		t.Fatal(err)
	}
	return s, s.Handler(), dir
}

func sessionFor(t *testing.T, s *Server, role users.Role) *http.Cookie {
	t.Helper()
	name := string(role) + "-person"
	if err := s.users.Add(name, role, "a-long-enough-password"); err != nil {
		t.Fatal(err)
	}
	u, ok := s.users.Find(name)
	if !ok {
		t.Fatal("the user just added is not there")
	}
	token, err := s.sessions.start(u)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: sessionCookie, Value: token}
}

func statusOf(h http.Handler, method, path string, c *http.Cookie) int {
	r := httptest.NewRequest(method, path, strings.NewReader("{}"))
	if c != nil {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}

func TestNothingIsReachableWithoutSigningIn(t *testing.T) {
	_, h, _ := signedInStudio(t)
	for _, path := range []string{
		"/", "/api/score", "/api/library", "/api/media", "/api/rigs",
		"/api/boards", "/api/users", "/api/live", "/media",
	} {
		if got := statusOf(h, "GET", path, nil); got != http.StatusUnauthorized {
			t.Errorf("GET %s without a session answered %d, not 401", path, got)
		}
	}
	// And a write is not a way around it.
	if got := statusOf(h, "POST", "/api/delete", nil); got != http.StatusUnauthorized {
		t.Errorf("POST /api/delete without a session answered %d, not 401", got)
	}
}

func TestABoardCanStillFetchItsFirmware(t *testing.T) {
	// The one route that must work with no cookie, because the thing asking is
	// an ESP32. 404 is the right answer for a file that is not there; 401
	// would mean no board could ever update itself again.
	_, h, _ := signedInStudio(t)
	if got := statusOf(h, "GET", "/firmware/whatever.bin", nil); got == http.StatusUnauthorized {
		t.Error("a board was asked to sign in, which it cannot do")
	}
}

func TestAViewerMayLookAndNotTouch(t *testing.T) {
	s, h, _ := signedInStudio(t)
	c := sessionFor(t, s, users.Viewer)

	if got := statusOf(h, "GET", "/api/score", c); got == http.StatusForbidden {
		t.Error("a viewer could not read a score")
	}
	for _, c2 := range []struct{ method, path string }{
		{"POST", "/api/score"},
		{"POST", "/api/delete"},
		{"POST", "/api/build"},
		{"POST", "/api/live"},
	} {
		if got := statusOf(h, c2.method, c2.path, c); got != http.StatusForbidden {
			t.Errorf("a viewer got %d from %s %s, not 403", got, c2.method, c2.path)
		}
	}
}

func TestAnOperatorRunsShowsButOwnsNoHardware(t *testing.T) {
	s, h, _ := signedInStudio(t)
	c := sessionFor(t, s, users.Operator)

	if got := statusOf(h, "POST", "/api/live", c); got == http.StatusForbidden {
		t.Error("an operator could not go live, which is what an operator is for")
	}
	for _, path := range []string{"/api/boards", "/api/users", "/api/rigs/new"} {
		if got := statusOf(h, "GET", path, c); got != http.StatusForbidden {
			t.Errorf("an operator got %d from GET %s, not 403", got, path)
		}
	}
}

func TestAnAdminReachesTheAdminThings(t *testing.T) {
	s, h, _ := signedInStudio(t)
	c := sessionFor(t, s, users.Admin)
	for _, path := range []string{"/api/boards", "/api/users", "/api/rig"} {
		if got := statusOf(h, "GET", path, c); got == http.StatusForbidden || got == http.StatusUnauthorized {
			t.Errorf("an administrator got %d from GET %s", got, path)
		}
	}
}

// --------------------------------------------------------------- first run

func TestTheFirstAdministratorIsCreatedAndTheirPasswordIsOnDisk(t *testing.T) {
	s, _, dir := signedInStudio(t)

	// Somebody exists, and they are an administrator.
	if s.users.Empty() {
		t.Fatal("a new installation has nobody in it, so nobody can sign in")
	}
	u, ok := s.users.Find("admin")
	if !ok || u.Role != users.Admin {
		t.Fatalf("the first user is %+v, not an administrator called admin", u)
	}

	// The password is on the host, in a file only its owner can read, and not
	// in the log and not in the environment.
	path := filepath.Join(dir, initialPasswordFile)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("the first password was not written down: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("the password file is %o, not 0600", perm)
	}

	// And it is the password that actually works.
	password := passwordFrom(t, path)
	if _, ok := s.users.Authenticate("admin", password); !ok {
		t.Error("the password written down is not the one that signs in")
	}
	if len(password) < 16 {
		t.Errorf("the generated password is %d characters", len(password))
	}
}

func passwordFrom(t *testing.T, path string) string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	scan := bufio.NewScanner(f)
	for scan.Scan() {
		if rest, ok := strings.CutPrefix(scan.Text(), "Password:"); ok {
			return strings.TrimSpace(rest)
		}
	}
	t.Fatalf("no password line in %s", path)
	return ""
}

func TestARestartDoesNotMakeASecondAdministrator(t *testing.T) {
	dir := t.TempDir()
	media := filepath.Join(dir, "media")
	scores := filepath.Join(dir, "scores")
	for _, d := range []string{media, scores} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	opts := Options{Media: media, Scores: scores, Users: filepath.Join(dir, "users.toml")}

	first, err := New(opts)
	if err != nil {
		t.Fatal(err)
	}
	before := len(first.users.Users)

	again, err := New(opts)
	if err != nil {
		t.Fatal(err)
	}
	if len(again.users.Users) != before {
		t.Errorf("a restart went from %d users to %d", before, len(again.users.Users))
	}
	if again.firstRunNote != "" {
		t.Error("a restart claimed it had created the first administrator again")
	}
}

// ----------------------------------------------------------------- signing

func TestSigningInAndOut(t *testing.T) {
	s, h, dir := signedInStudio(t)
	password := passwordFrom(t, filepath.Join(dir, initialPasswordFile))

	post := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/session", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}

	if w := post(`{"name":"admin","password":"wrong"}`); w.Code != http.StatusUnauthorized {
		t.Errorf("a wrong password answered %d", w.Code)
	}
	// A name that does not exist and a password that is wrong must answer the
	// same, or this becomes a way to learn who works here.
	wrongName := post(`{"name":"nobody","password":"wrong"}`)
	wrongPass := post(`{"name":"admin","password":"wrong"}`)
	if wrongName.Body.String() != wrongPass.Body.String() {
		t.Errorf("a missing name and a wrong password answer differently:\n  %s\n  %s",
			wrongName.Body.String(), wrongPass.Body.String())
	}

	w := post(`{"name":"admin","password":"` + password + `"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("the right password answered %d: %s", w.Code, w.Body)
	}
	var said struct {
		SignedIn bool   `json:"signedIn"`
		Role     string `json:"role"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &said); err != nil {
		t.Fatal(err)
	}
	if !said.SignedIn || said.Role != "admin" {
		t.Errorf("signing in said %+v", said)
	}

	var cookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == sessionCookie {
			cookie = c
		}
	}
	if cookie == nil {
		t.Fatal("no session cookie was set")
	}
	if !cookie.HttpOnly {
		t.Error("the session cookie is readable by script")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Error("the session cookie is not SameSite=Lax, so a cross-site form could use it")
	}

	if got := statusOf(h, "GET", "/api/library", cookie); got == http.StatusUnauthorized {
		t.Error("the cookie did not work")
	}

	r := httptest.NewRequest("DELETE", "/api/session", nil)
	r.AddCookie(cookie)
	out := httptest.NewRecorder()
	h.ServeHTTP(out, r)
	if got := statusOf(h, "GET", "/api/library", cookie); got != http.StatusUnauthorized {
		t.Errorf("the session still worked after signing out: %d", got)
	}
	_ = s
}

func TestTakingSomebodysAccessAwaySignsThemOut(t *testing.T) {
	// Otherwise removing an account leaves them working for a fortnight, which
	// is the opposite of what the person doing it believed they had done.
	s, h, _ := signedInStudio(t)
	c := sessionFor(t, s, users.Operator)
	if got := statusOf(h, "GET", "/api/library", c); got == http.StatusUnauthorized {
		t.Fatal("the session did not work to begin with")
	}
	if err := s.users.Remove("operator-person"); err != nil {
		t.Fatal(err)
	}
	s.sessions.forget("operator-person")
	if got := statusOf(h, "GET", "/api/library", c); got != http.StatusUnauthorized {
		t.Errorf("a removed user was still signed in: %d", got)
	}
}

// signedIn is a studio's handler with an administrator's session on every
// request.
//
// Every test in this package predates there being such a thing as signing in,
// and each of them is about something else: whether a board keeps its secret,
// whether a layout survives a round trip. Rewriting all of them to authenticate
// would bury what they are actually asserting under four lines of ceremony
// each, so the ceremony lives here once.
//
// The administrator is the one New creates on a first run, so this costs a
// session and not a password hash.
func signedIn(t *testing.T, s *Server) http.Handler {
	t.Helper()
	u, ok := s.users.Find("admin")
	if !ok {
		t.Fatal("this studio has no administrator, so New did not create one")
	}
	token, err := s.sessions.start(u)
	if err != nil {
		t.Fatal(err)
	}
	inner := s.Handler()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
		inner.ServeHTTP(w, r)
	})
}

// A browser asking for a page is sent to the form; a fetch is told in JSON.
//
// Not checkable in the browser suite: those specs run against the vite dev
// server, which serves `/` itself and proxies only the routes the studio owns,
// so the redirect the real binary performs never happens in front of them.
//
// The distinction matters. Redirecting an API call to an HTML page is how a
// fetch ends up parsing a login form and reporting a syntax error, which is a
// bug report about JSON rather than about being signed out.
func TestAPageGoesToTheFormAndAFetchGetsJSON(t *testing.T) {
	_, h, _ := signedInStudio(t)

	page := httptest.NewRequest("GET", "/", nil)
	page.Header.Set("Accept", "text/html,application/xhtml+xml")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, page)
	if w.Code != http.StatusSeeOther {
		t.Errorf("a browser asking for the studio got %d, not a redirect", w.Code)
	}
	if to := w.Header().Get("Location"); !strings.HasPrefix(to, "/signin") {
		t.Errorf("it was sent to %q rather than the sign-in page", to)
	}

	call := httptest.NewRequest("GET", "/api/library", nil)
	call.Header.Set("Accept", "application/json")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, call)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("a fetch got %d, not 401", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "json") {
		t.Errorf("a fetch was answered with %q", ct)
	}

	// An API path asked for by something claiming to want HTML is still not
	// redirected: /api is data whoever is asking.
	odd := httptest.NewRequest("GET", "/api/library", nil)
	odd.Header.Set("Accept", "text/html")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, odd)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("an API path with an HTML Accept header got %d", w.Code)
	}
}

// Signing in cannot be used to send somebody somewhere else.
//
// `to` comes off a query string, so it is whatever a link said it was. An open
// redirect on a sign-in page is how somebody ends up at a convincing copy of
// it that keeps what they type.
func TestSignInWillNotForwardYouOffThisStudio(t *testing.T) {
	s, _, dir := signedInStudio(t)
	password := passwordFrom(t, filepath.Join(dir, initialPasswordFile))

	for _, to := range []string{"https://example.com/", "//example.com/", "javascript:alert(1)"} {
		form := strings.NewReader("name=admin&password=" + password + "&to=" + to)
		r := httptest.NewRequest("POST", "/signin", form)
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		if got := w.Header().Get("Location"); got != "/" {
			t.Errorf("to=%q sent the browser to %q", to, got)
		}
	}
}
