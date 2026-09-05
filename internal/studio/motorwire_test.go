package studio

import (
	"encoding/json"
	"strings"
	"testing"
)

// The three numbers that describe a motor cross four boundaries between the
// board and the person typing them, and each one is a place they can be
// dropped without anything failing. That is not hypothetical: `order` was
// announced by the firmware and silently discarded by this layer for weeks,
// and the symptom was a strip showing the wrong primary with every counter
// reporting success.
//
// So each hop is asserted rather than assumed. A field added to one struct and
// forgotten in the next is exactly what these catch.

func TestMotorNumbersReachTheBoard(t *testing.T) {
	got := wireDevice{
		ID: "wind.main", Type: "pwm", GPIO: 18,
		MinDuty: 0.4, StartDuty: 0.65, KickMS: 250,
	}.toCIP()

	if got.MinDuty != 0.4 {
		t.Errorf("min duty %v, want 0.4", got.MinDuty)
	}
	if got.StartDuty != 0.65 {
		t.Errorf("start duty %v, want 0.65", got.StartDuty)
	}
	if got.KickMS != 250 {
		t.Errorf("kick %v, want 250", got.KickMS)
	}
}

func TestMotorNumbersReachThePage(t *testing.T) {
	b, err := json.Marshal(wireNodeInstrument{
		ID: "wind.main", MinDuty: 0.4, StartDuty: 0.65, KickMS: 250,
	})
	if err != nil {
		t.Fatal(err)
	}
	// The names matter as much as the values: the page reads these exact
	// keys, and a rename here is a field that arrives as undefined and
	// renders as an empty box somebody then saves over the top of.
	for _, want := range []string{`"minDuty":0.4`, `"startDuty":0.65`, `"kickMs":250`} {
		if !strings.Contains(string(b), want) {
			t.Errorf("missing %s from %s", want, b)
		}
	}
}

func TestThePageCanSendThemBack(t *testing.T) {
	var w wireDevice
	body := `{"id":"wind.main","type":"pwm","gpio":18,
	          "minDuty":0.4,"startDuty":0.65,"kickMs":250}`
	if err := json.Unmarshal([]byte(body), &w); err != nil {
		t.Fatal(err)
	}
	if w.MinDuty != 0.4 || w.StartDuty != 0.65 || w.KickMS != 250 {
		t.Fatalf("read back min %v start %v kick %v, want 0.4 0.65 250",
			w.MinDuty, w.StartDuty, w.KickMS)
	}
}

// Zero has to stay absent rather than becoming a number, because the page
// tells "not configured" from "configured to zero" by whether the key is
// there at all. Writing zeroes would make every unconfigured board look like
// one somebody had deliberately set to nothing.
func TestAnUnsetMotorSaysNothing(t *testing.T) {
	b, err := json.Marshal(wireNodeInstrument{ID: "light.ambient"})
	if err != nil {
		t.Fatal(err)
	}
	for _, gone := range []string{"minDuty", "startDuty", "kickMs"} {
		if strings.Contains(string(b), gone) {
			t.Errorf("%s should be omitted when unset: %s", gone, b)
		}
	}
}
