package users

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func shelf(t *testing.T) *Shelf {
	t.Helper()
	s, err := Load(filepath.Join(t.TempDir(), "users.toml"))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestAPasswordIsNeverStored(t *testing.T) {
	// The one property this file exists to have. Written out because a
	// refactor that starts keeping the password would still pass every other
	// test in here: sign-in would work perfectly.
	const secret = "correct horse battery staple"
	s := shelf(t)
	if err := s.Add("ada", Admin, secret); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(s.Path())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), secret) {
		t.Fatal("the password is in the file")
	}
	if !strings.Contains(string(body), scheme) {
		t.Errorf("the file does not name the scheme it used:\n%s", body)
	}
}

func TestTheRightPasswordAndOnlyTheRightOne(t *testing.T) {
	s := shelf(t)
	if err := s.Add("ada", Operator, "a-long-enough-password"); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Authenticate("ada", "a-long-enough-password"); !ok {
		t.Error("the right password was refused")
	}
	if _, ok := s.Authenticate("ada", "a-long-enough-passwore"); ok {
		t.Error("one character wrong was accepted")
	}
	if _, ok := s.Authenticate("ada", ""); ok {
		t.Error("an empty password was accepted")
	}
	if _, ok := s.Authenticate("nobody", "a-long-enough-password"); ok {
		t.Error("a person who does not exist was accepted")
	}
	// Case-insensitive, because nobody remembers how they capitalised their
	// own name a year ago.
	if _, ok := s.Authenticate("ADA", "a-long-enough-password"); !ok {
		t.Error("the name had to be capitalised the same way")
	}
}

func TestTwoPeopleWithTheSamePasswordGetDifferentHashes(t *testing.T) {
	// A shared salt would mean one cracked password is two, and it would show
	// in the file: identical hashes side by side.
	s := shelf(t)
	if err := s.Add("ada", Operator, "the same password"); err != nil {
		t.Fatal(err)
	}
	if err := s.Add("grace", Operator, "the same password"); err != nil {
		t.Fatal(err)
	}
	if s.Users[0].Hash == s.Users[1].Hash {
		t.Error("two people with one password share a hash, so the salt is not per user")
	}
}

func TestAHashSurvivesTheCostBeingRaised(t *testing.T) {
	// The encoded form carries its own iteration count, so an old hash keeps
	// verifying after the constant changes. Without this, raising the cost
	// locks every existing user out and the symptom is "nobody can sign in".
	cheap := "pbkdf2-sha256$1000$" + "AAAAAAAAAAAAAAAAAAAAAA" + "$"
	key, err := Hash("whatever this is")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(key, "$")
	if parts[1] != "600000" {
		t.Errorf("the cost is %s, not the 600000 the comment claims", parts[1])
	}
	if Matches(cheap, "whatever this is") {
		t.Error("a truncated hash verified")
	}
}

func TestRubbishNeverVerifies(t *testing.T) {
	for _, bad := range []string{
		"", "not-a-hash", "pbkdf2-sha256$$$", "pbkdf2-sha256$0$AA$AA",
		"md5$600000$AA$AA", "pbkdf2-sha256$600000$!!!$AA",
	} {
		if Matches(bad, "anything") {
			t.Errorf("%q verified", bad)
		}
	}
}

func TestAnUnknownRoleIsPowerless(t *testing.T) {
	// A typo in a hand-edited file must lock that person out rather than
	// promote them, which is why rank is a map and not an ordering of strings.
	var typo Role = "adminn"
	if typo.Valid() {
		t.Error("a misspelled role is valid")
	}
	if typo.AtLeast(Viewer) {
		t.Error("a misspelled role outranks a viewer")
	}
	if Admin.AtLeast(typo) {
		t.Error("a real role compares against a misspelled one")
	}
}

func TestRolesInclude(t *testing.T) {
	for _, c := range []struct {
		have, need Role
		want       bool
	}{
		{Admin, Admin, true}, {Admin, Operator, true}, {Admin, Viewer, true},
		{Operator, Admin, false}, {Operator, Operator, true}, {Operator, Viewer, true},
		{Viewer, Operator, false}, {Viewer, Viewer, true},
	} {
		if got := c.have.AtLeast(c.need); got != c.want {
			t.Errorf("%s at least %s = %v", c.have, c.need, got)
		}
	}
}

func TestTheLastAdministratorCannotBeRemovedOrDemoted(t *testing.T) {
	// A studio with nobody who can add a user has one way back: editing TOML
	// over SSH. The person who would have to do that is the person who just
	// locked themselves out.
	s := shelf(t)
	if err := s.Add("ada", Admin, "a-long-enough-password"); err != nil {
		t.Fatal(err)
	}
	if err := s.Remove("ada"); err == nil {
		t.Error("the only administrator was removed")
	}
	if err := s.SetRole("ada", Viewer); err == nil {
		t.Error("the only administrator was demoted")
	}

	// With a second one, both are allowed.
	if err := s.Add("grace", Admin, "another-long-password"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetRole("ada", Viewer); err != nil {
		t.Errorf("with two administrators, demoting one was refused: %v", err)
	}
	if err := s.Remove("ada"); err != nil {
		t.Errorf("removing a non-administrator was refused: %v", err)
	}
}

func TestWhatIsRefused(t *testing.T) {
	s := shelf(t)
	if err := s.Add("", Admin, "a-long-enough-password"); err == nil {
		t.Error("a nameless user was created")
	}
	if err := s.Add("ada", "wizard", "a-long-enough-password"); err == nil {
		t.Error("an invented role was accepted")
	}
	if err := s.Add("ada", Admin, "short"); err == nil {
		t.Error("a short password was accepted")
	}
	if err := s.Add("ada\nroot", Admin, "a-long-enough-password"); err == nil {
		t.Error("a name with a newline in it was accepted")
	}
	if err := s.Add("ada", Admin, "a-long-enough-password"); err != nil {
		t.Fatal(err)
	}
	if err := s.Add("ADA", Operator, "a-long-enough-password"); err == nil {
		t.Error("the same name in different case was accepted twice")
	}
}

func TestItSurvivesBeingReadBack(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "users.toml")
	first, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Empty() {
		t.Error("a missing file did not read as nobody, which is every first run")
	}
	if err := first.Add("ada", Admin, "a-long-enough-password"); err != nil {
		t.Fatal(err)
	}

	again, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if again.Empty() {
		t.Fatal("nothing came back")
	}
	if _, ok := again.Authenticate("ada", "a-long-enough-password"); !ok {
		t.Error("the password did not verify after a round trip through the file")
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	// Credentials, like the board list beside it.
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("the file is %o, not 0600", perm)
	}
}

func TestChangingAPasswordTakesEffect(t *testing.T) {
	s := shelf(t)
	if err := s.Add("ada", Admin, "the-first-password"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetPassword("ada", "the-second-password"); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Authenticate("ada", "the-first-password"); ok {
		t.Error("the old password still works")
	}
	if _, ok := s.Authenticate("ada", "the-second-password"); !ok {
		t.Error("the new password does not")
	}
	if err := s.SetPassword("ada", "short"); err == nil {
		t.Error("a short password was accepted on a change")
	}
}
