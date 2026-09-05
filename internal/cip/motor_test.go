package cip

import "testing"

// toAnnouncement is the hop from what a board holds to what it tells the
// conductor, and its own comment says a field added to one side and forgotten
// on the other is a field that silently stops crossing the wire. That comment
// was true and untested. This is the test.
func TestAMotorsNumbersAreAnnounced(t *testing.T) {
	got := Manifest{
		ID: "wind.main", Kind: "wind", Type: "pwm", GPIO: 18, FreqHz: 25000,
		MinDuty: 0.4, StartDuty: 0.65, KickMS: 250,
	}.toAnnouncement(0)

	if got.MinDuty != 0.4 {
		t.Errorf("min duty %v, want 0.4", got.MinDuty)
	}
	if got.StartDuty != 0.65 {
		t.Errorf("start duty %v, want 0.65", got.StartDuty)
	}
	if got.KickMS != 250 {
		t.Errorf("kick %v, want 250", got.KickMS)
	}
	if got.FreqHz != 25000 || got.GPIO != 18 {
		t.Errorf("the wiring beside them was lost: %+v", got)
	}
}
