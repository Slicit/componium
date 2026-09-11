package studio

// The sign-in page.
//
// Served by Go rather than by the application, and that is the point: the
// application is a bundle that has to be fetched, and fetching it is the thing
// you are not allowed to do yet. A page that depends on the thing it is
// guarding cannot be the way past the guard.
//
// So it is one file with no assets: no script, no stylesheet, no font, nothing
// that is a second request. It uses the same colours as the studio by writing
// them out, which is duplication, and the alternative is a stylesheet fetch
// that has to be excepted from the session rule for every install forever.

import (
	"html/template"
	"net/http"
	"strings"
)

var signinPage = template.Must(template.New("signin").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in &middot; Componium</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0d1015; color: #e4e9f0;
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  form {
    width: min(22rem, calc(100vw - 3rem));
    background: #141920; border: 1px solid #232b35; border-radius: 6px;
    padding: 1.6rem 1.5rem;
  }
  h1 { margin: 0 0 .2rem; font-size: 1rem; letter-spacing: -.01em; }
  h1 span { color: #d8a24a; }
  p.hint { margin: 0 0 1.4rem; color: #8c96a5; font-size: .8rem; }
  label { display: block; margin-bottom: .9rem; }
  label span { display: block; margin-bottom: .3rem; font-size: .8rem; color: #8c96a5; }
  input {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
    color: #e4e9f0; background: #0d1015; border: 1px solid #232b35;
    border-radius: 4px; padding: .5rem .6rem;
  }
  input:focus { outline: none; border-color: #d8a24a; }
  button {
    width: 100%; font: inherit; font-size: 13px; margin-top: .4rem;
    color: #0d1015; background: #d8a24a; border: 0; border-radius: 4px;
    padding: .55rem .6rem; cursor: pointer;
  }
  button:hover { background: #e3b163; }
  .bad {
    margin: 0 0 1rem; padding: .5rem .6rem; border-radius: 4px;
    background: #2a1c1a; color: #f0b8b2; font-size: .82rem;
  }
  footer { margin-top: 1.2rem; color: #8c96a5; font-size: .75rem; line-height: 1.5; }
</style>
</head>
<body>
<form method="post" action="/signin">
  <h1>Componium <span>Studio</span></h1>
  <p class="hint">This installation is private.</p>
  {{if .Problem}}<p class="bad">{{.Problem}}</p>{{end}}
  <input type="hidden" name="to" value="{{.To}}">
  <label>
    <span>Name</span>
    <input name="name" autocomplete="username" autofocus required>
  </label>
  <label>
    <span>Password</span>
    <input name="password" type="password" autocomplete="current-password" required>
  </label>
  <button type="submit">Sign in</button>
  {{if .FirstRun}}
  <footer>
    Nobody has signed in yet. The installer left the first password in
    <code>{{.FirstRun}}</code> on the machine running this.
  </footer>
  {{end}}
</form>
</body>
</html>
`))

// handleSignin shows the form and takes what it posts.
//
// A form post rather than fetch(), so that a browser with no JavaScript, and a
// password manager, both work the way their owners expect.
func (s *Server) handleSignin(w http.ResponseWriter, r *http.Request) {
	to := r.FormValue("to")
	// Only ever back into this studio. An open redirect on a sign-in page is
	// how somebody gets sent to a copy of it that keeps what they type.
	if !strings.HasPrefix(to, "/") || strings.HasPrefix(to, "//") {
		to = "/"
	}

	show := func(code int, problem string) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(code)
		_ = signinPage.Execute(w, map[string]any{
			"Problem": problem, "To": to, "FirstRun": s.firstRunNote,
		})
	}

	switch r.Method {
	case http.MethodGet:
		if _, ok := s.who(r); ok {
			http.Redirect(w, r, to, http.StatusSeeOther)
			return
		}
		show(http.StatusOK, "")

	case http.MethodPost:
		u, ok := s.users.Authenticate(r.FormValue("name"), r.FormValue("password"))
		if !ok {
			// One message for both, so this cannot be used to find out who
			// has an account here.
			show(http.StatusUnauthorized, "That name and password do not match.")
			return
		}
		token, err := s.sessions.start(u)
		if err != nil {
			show(http.StatusInternalServerError, "Could not start a session.")
			return
		}
		http.SetCookie(w, s.cookie(r, token, sessionIdle))
		http.Redirect(w, r, to, http.StatusSeeOther)

	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
