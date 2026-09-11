// Package users remembers who may open this studio.
//
// A file, not the database. The studio runs without Postgres and always has:
// scores and rigs are files, and derived data is the only thing that goes into
// a database (ADR 0006). Sign-in has to work on the installations that have no
// database at all, so the people who may sign in live beside the board list,
// which is the other file here that is credentials.
//
// # What is stored
//
// A name, a role, and a hash. Never a password. The hash is PBKDF2-HMAC-SHA256
// from the standard library, which is why this package adds no dependency: a
// project that pulls in a crypto library for one function then owns that
// library's release schedule forever.
//
// PBKDF2 rather than argon2 or scrypt for the same reason, and it is a real
// trade rather than a free one: argon2id resists a GPU better because it is
// memory-hard, and PBKDF2 is not. What makes it defensible here is the shape
// of the threat. This file sits on a machine in somebody's house behind a
// front door they already control, the iteration count is at the OWASP figure,
// and the alternative is a dependency on x/crypto for a studio that currently
// depends on two libraries in total. If this ever grows accounts that matter
// to somebody other than their owner, revisit it: Upgrade below exists so that
// changing the scheme does not lock anybody out.
//
// # The consequence
//
// This file is credentials, like boards.toml beside it. It is written 0600, it
// belongs outside the repository, and anybody who can read it can spend a GPU
// on it offline.
package users

import (
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
)

// Role is what somebody is allowed to do.
//
// Three, and the middle one is the interesting one. A viewer can watch a score
// and never change it; an operator authors and runs shows; an admin also owns
// the things that are dangerous to get wrong, which is the hardware, the
// credentials for it, and who else may sign in.
type Role string

const (
	Viewer   Role = "viewer"
	Operator Role = "operator"
	Admin    Role = "admin"
)

// rank orders the roles so a guard can ask for "at least this".
//
// A map rather than an iota, because the strings are what is written in the
// file and an unknown one must not accidentally rank above anything: a typo in
// a hand-edited users.toml should lock that person out, not promote them.
var rank = map[Role]int{Viewer: 1, Operator: 2, Admin: 3}

// AtLeast reports whether this role includes another's powers.
func (r Role) AtLeast(other Role) bool {
	mine, ok := rank[r]
	if !ok {
		return false
	}
	theirs, ok := rank[other]
	if !ok {
		return false
	}
	return mine >= theirs
}

// Valid reports whether this is a role at all.
func (r Role) Valid() bool { _, ok := rank[r]; return ok }

// Roles is every role, weakest first, for a page that offers them.
func Roles() []Role { return []Role{Viewer, Operator, Admin} }

// A User is somebody who may sign in.
type User struct {
	Name string `toml:"name"`
	Role Role   `toml:"role"`
	// Hash is the encoded password verifier. Never the password.
	Hash    string    `toml:"hash"`
	Created time.Time `toml:"created"`
}

// Shelf is everybody, and where they are kept.
type Shelf struct {
	path  string
	Users []User `toml:"user"`
}

// hashing parameters.
//
// 600,000 is the OWASP recommendation for PBKDF2-HMAC-SHA256. It costs about a
// tenth of a second here, which is the point: it is paid once per sign-in and
// six hundred thousand times per guess.
const (
	iterations = 600_000
	saltLen    = 16
	keyLen     = 32
	scheme     = "pbkdf2-sha256"
)

// Hash turns a password into something that can be stored.
//
// The encoded form carries its own parameters, so a stored hash stays readable
// after the cost is raised. Without that, changing the iteration count would
// silently invalidate every existing password.
func Hash(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("users: no randomness: %w", err)
	}
	key, err := pbkdf2.Key(sha256.New, password, salt, iterations, keyLen)
	if err != nil {
		return "", fmt.Errorf("users: %w", err)
	}
	return fmt.Sprintf("%s$%d$%s$%s", scheme, iterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// Matches reports whether a password produces a stored hash.
//
// Constant time, and it returns the same false for a malformed hash as for a
// wrong password: a caller that could tell those apart would leak whether an
// account exists.
func Matches(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != scheme {
		return false
	}
	var iter int
	if _, err := fmt.Sscanf(parts[1], "%d", &iter); err != nil || iter <= 0 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, password, salt, iter, len(want))
	if err != nil {
		return false
	}
	return hmac.Equal(got, want)
}

// Load reads the shelf, or returns an empty one.
//
// A missing file is the normal first-run state and not an error: the studio
// creates the first administrator from it.
func Load(path string) (*Shelf, error) {
	s := &Shelf{path: path}
	body, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, fmt.Errorf("users: %s: %w", path, err)
	}
	if err := toml.Unmarshal(body, s); err != nil {
		return nil, fmt.Errorf("users: %s: %w", path, err)
	}
	for i := range s.Users {
		s.Users[i].Name = strings.TrimSpace(s.Users[i].Name)
	}
	return s, nil
}

// Path is where this shelf is kept.
func (s *Shelf) Path() string { return s.path }

// Find returns somebody by name, case-insensitively.
//
// Case-insensitive because a person typing their own name into a sign-in box
// should not have to remember how they capitalised it a year ago, and because
// two accounts differing only in case is a trap rather than a feature.
func (s *Shelf) Find(name string) (User, bool) {
	for _, u := range s.Users {
		if strings.EqualFold(u.Name, name) {
			return u, true
		}
	}
	return User{}, false
}

// Authenticate returns the user when the password is theirs.
//
// A missing user still costs a hash. Answering instantly for a name that does
// not exist and slowly for one that does tells an attacker which names are
// worth guessing passwords for.
func (s *Shelf) Authenticate(name, password string) (User, bool) {
	u, ok := s.Find(name)
	if !ok {
		// Deliberate work against a throwaway hash, so the timing says nothing.
		Matches("pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password)
		return User{}, false
	}
	if !Matches(u.Hash, password) {
		return User{}, false
	}
	return u, true
}

// Add creates somebody. The name must be new.
func (s *Shelf) Add(name string, role Role, password string) error {
	name = strings.TrimSpace(name)
	if err := checkName(name); err != nil {
		return err
	}
	if !role.Valid() {
		return fmt.Errorf("users: %q is not a role", role)
	}
	if err := CheckPassword(password); err != nil {
		return err
	}
	if _, exists := s.Find(name); exists {
		return fmt.Errorf("users: %q is taken", name)
	}
	hash, err := Hash(password)
	if err != nil {
		return err
	}
	s.Users = append(s.Users, User{
		Name: name, Role: role, Hash: hash, Created: time.Now().UTC().Truncate(time.Second),
	})
	return s.save()
}

// SetPassword changes somebody's password.
func (s *Shelf) SetPassword(name, password string) error {
	if err := CheckPassword(password); err != nil {
		return err
	}
	for i := range s.Users {
		if !strings.EqualFold(s.Users[i].Name, name) {
			continue
		}
		hash, err := Hash(password)
		if err != nil {
			return err
		}
		s.Users[i].Hash = hash
		return s.save()
	}
	return fmt.Errorf("users: no such person as %q", name)
}

// SetRole changes what somebody may do.
//
// Refuses to remove the last administrator. A studio with nobody who can add a
// user is one whose only way back is editing a TOML file over SSH, and the
// person who would need to do that is the person who just locked themselves
// out of it.
func (s *Shelf) SetRole(name string, role Role) error {
	if !role.Valid() {
		return fmt.Errorf("users: %q is not a role", role)
	}
	for i := range s.Users {
		if !strings.EqualFold(s.Users[i].Name, name) {
			continue
		}
		if s.Users[i].Role == Admin && role != Admin && s.admins() == 1 {
			return fmt.Errorf("users: %q is the only administrator", s.Users[i].Name)
		}
		s.Users[i].Role = role
		return s.save()
	}
	return fmt.Errorf("users: no such person as %q", name)
}

// Remove deletes somebody, unless they are the last administrator.
func (s *Shelf) Remove(name string) error {
	for i := range s.Users {
		if !strings.EqualFold(s.Users[i].Name, name) {
			continue
		}
		if s.Users[i].Role == Admin && s.admins() == 1 {
			return fmt.Errorf("users: %q is the only administrator", s.Users[i].Name)
		}
		s.Users = append(s.Users[:i], s.Users[i+1:]...)
		return s.save()
	}
	return fmt.Errorf("users: no such person as %q", name)
}

func (s *Shelf) admins() int {
	n := 0
	for _, u := range s.Users {
		if u.Role == Admin {
			n++
		}
	}
	return n
}

// Empty reports whether anybody exists yet.
func (s *Shelf) Empty() bool { return len(s.Users) == 0 }

// Sorted returns everybody, admins first, then by name.
func (s *Shelf) Sorted() []User {
	out := append([]User(nil), s.Users...)
	sort.SliceStable(out, func(a, b int) bool {
		if out[a].Role != out[b].Role {
			return rank[out[a].Role] > rank[out[b].Role]
		}
		return strings.ToLower(out[a].Name) < strings.ToLower(out[b].Name)
	})
	return out
}

// CheckPassword refuses what should not be accepted.
//
// Length only, deliberately. Composition rules ("one capital, one digit") push
// people towards Passw0rd! and are worse than a length floor; twelve characters
// of anything beats eight of a pattern a cracker already knows.
func CheckPassword(password string) error {
	if len([]rune(password)) < 12 {
		return fmt.Errorf("users: a password needs at least 12 characters")
	}
	if len(password) > 1024 {
		// Not a policy, a guard: the hash cost is paid on every attempt and a
		// megabyte password is a way to make somebody else's CPU do the work.
		return fmt.Errorf("users: that password is unreasonably long")
	}
	return nil
}

func checkName(name string) error {
	if name == "" {
		return fmt.Errorf("users: a name is required")
	}
	if len(name) > 64 {
		return fmt.Errorf("users: that name is too long")
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return fmt.Errorf("users: a name cannot contain control characters")
		}
	}
	return nil
}

// save writes the shelf, replacing it atomically.
//
// 0600 and a rename, the same as the board list: a half-written file of
// password hashes is a studio nobody can sign in to.
func (s *Shelf) save() error {
	if s.path == "" {
		return fmt.Errorf("users: no path to save to")
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	tmp := s.path + ".part"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	header := "# Who may open this studio.\n" +
		"#\n" +
		"# Passwords are not here: each line carries a verifier that a password\n" +
		"# reproduces and which cannot be turned back into one. Manage these from\n" +
		"# Admin, Users. Editing by hand works and a typo in a role locks that\n" +
		"# person out rather than promoting them.\n\n"
	if _, err := f.WriteString(header); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := toml.NewEncoder(f).Encode(s); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, s.path)
}
