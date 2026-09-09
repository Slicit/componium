# Candidates

<!-- Agent surfaced candidates. Append only. Triage promotes entries to ideas.md or a feature file. -->

Each entry says what was noticed, what it would take, and what triggered it:
`deferred` (real and put off), `alternative` (a road not taken), `out-of-scope`
(noticed while doing something else), `out-of-band` (found by accident, usually
by something failing).

## 2026-09-09

- **Expansion is capped, never gated, and that is what "too much wind on camera
  moves" actually is.** `wind.series` takes `max(carried, weather, flight, ride,
  blast)` and limits bare expansion to `CARRIED_CAP = 0.45` when nothing
  corroborates travel. A cap changes how loud a camera move is and not whether
  it blows at all, so a pan that reads 0.30 still reads 0.30. Measured on the
  fifteen minute Rebel Moon cut: 62 per cent of the running time sits between
  0.05 and 0.45 with no cause behind it, and letting the composer read the kept
  description (this branch) moved that figure by 0.2 points while nearly
  doubling the strong wind. The change that would answer the complaint is a
  floor rather than a cap: below some expansion level, with nothing agreeing,
  wind is zero. Deliberately not decided here, because the threshold changes
  the feel of every score ever built and wants a person watching a film, not a
  percentage. (trigger: out-of-band, source: the --seen work, agent:
  claude-code)

- **Nothing has ever been analysed with the `wind` and `carried` labels.** The
  prompt in `hack/vlm-label.py` gained them on 2026-09-05 in the same commit as
  `composer/wind.py`, and every description on the box predates it, so the only
  path that has ever run is the keyword-over-prose stopgap `wind.py` calls a
  stopgap in its own docstring. Worth one film's re-analysis to find out
  whether the labels fire at all before assuming they are better. (trigger:
  deferred, source: the --seen work, agent: claude-code)

- **A boat in the ocean has no cause.** Sustained sea motion is neither a wind
  noun in the prose nor forward expansion in the picture, so none of the four
  causes reaches it. It looks like a job for the scene pass (a place plus
  activity, held for the length of the scene) rather than the frame pass, which
  is the same shape as the argument stage 2 of [[feat-two-clocks]] already
  makes for context. (trigger: out-of-scope, source: user report 2026-09-09,
  agent: claude-code)

## 2026-09-07

Backfilled in one pass. This file had been empty since it was created on
2026-08-29, which did not mean nothing was being deferred: it meant deferrals
were living in conversation and dying with it. Everything below was already
known to somebody and written down nowhere it would survive.

### The record disagrees with the project

- **README.md and the LOGBOOK milestone table both say no physical device has
  ever been driven.** That stopped being true with the fan: an ESP32, a
  MOSFET, a 12 V fan, and start and stall thresholds measured with `poke find`
  rather than guessed. `docs/running.md` says what has actually run. Both
  stale claims are load-bearing for how a reader judges the whole project, and
  neither can be corrected by an agent alone: LOGBOOK.md may not be edited
  without the owner seeing the change first. (trigger: out-of-band, source:
  writing docs/running.md, agent: claude-code)

- **`LOGBOOK/features/feat-first-real-device.md`'s "Where this stands" table
  is behind the work too.** It lists measured fan latency as "not yet" and the
  firmware's 1.2 s as a guess, which is still true, but the rows around it
  predate the fan actually running. Wants a pass by whoever ran it. (trigger:
  out-of-band, source: [[feat-browser-suite]] work, agent: claude-code)

### Rules that are written and not kept

- **"No em-dashes" is the first convention in LOGBOOK.md and there are 726 of
  them across 171 tracked files**, including README.md, most feature files and
  a lot of source comments. Three honest options: enforce it with a check and
  do the rewrite (mechanical, but a blind replace garbles sentences, so it is a
  real editing pass); scope it to prose files only; or drop the rule. Deliberately
  not decided here, because "which rules do we actually mean" is the owner's
  call and this is the largest example in the repository of the thing the
  house-rules tests exist to prevent. (trigger: out-of-band, source: writing
  docs/troubleshooting.md, agent: claude-code)

- **94 oxlint warnings, all real, none blocking.** `web/.oxlintrc.json` carries
  the count beside each rule so the backlog is a number that can be watched
  going down. Promoting one rule at a time from warn to error is the intended
  path and nobody has taken the first step. `react(set-state-in-effect)` is the
  biggest group. (trigger: deferred, source: the shadcn migration, agent:
  claude-code)

### Known and not fixed

- **A node keeps one replay counter for the whole board rather than one per
  sender**, so a second client silences the first permanently and in silence.
  Written up in `LOGBOOK/notes.md` and now in `docs/troubleshooting.md` under
  the symptom. The fix is a protocol change and wants an ADR; the smaller
  version, having a client keep seeding from the clock rather than incrementing,
  is one line in `internal/cip/client.go` and does not help a client that is
  not ours. (trigger: deferred, source: notes.md 2026-09-05, agent: claude-code)

- **A ws28xx device announces an `order` field that `device_apply` never
  reads.** Setting `order = "GRB"` does nothing. Either honour it or stop
  announcing it: a setting the studio offers and the board ignores is worse
  than no setting. (trigger: deferred, source: notes.md 2026-09-05, agent:
  claude-code)

- **`web/src/ui/frameClock.ts` has no test.** `requestVideoFrameCallback` is
  not implemented in the test environment, so the animation-frame fallback is
  the only path ever exercised, and the path that matters is the other one. It
  is the strongest candidate for the next spec in
  [[feat-browser-suite]], where a real browser can take it. (trigger:
  out-of-scope, source: [[feat-frame-clock]] verification pass, agent:
  claude-code)

### Noticed in passing

- **`deploy/rigs/` is tracked, and the running studio writes to it.** A live
  demonstration stack has deleted `demo-rig.toml` from the working tree and
  written `esp32-rig.toml`, `virtual-rig.toml` and `.chosen` beside it, so
  `git status` is permanently dirty on any machine running the demo.
  `deploy/scores/*` is already gitignored with a `.gitkeep`, so the asymmetry
  looks like an oversight rather than a decision. Either match it, or point the
  studio's writable rig directory somewhere outside the checkout. (trigger:
  out-of-band, source: staging the browser-suite commit, agent: claude-code)

- **Node 22 was installed on claude-machine-02 by hand.** `engines` has said
  `>=22.12.0` for weeks; the box was on 20.19.2, where jsdom 30 cannot start
  and the suite reports a confident green summary over 22 files that never
  ran. Fixed by installing 22.23.2 into `/usr/local`, and nothing in the
  repository records how to rebuild that box. A short provisioning note, or a
  container for the toolchain, would mean the next machine does not repeat it.
  (trigger: out-of-scope, source: [[feat-browser-suite]], agent: claude-code)

- **`hack/shoot-studio.sh` drives google-chrome directly and greps for
  `room3d.js`, which is the legacy studio's asset.** Playwright and a pinned
  Chromium are installed now for [[feat-browser-suite]], which is a better
  basis for the same job: pinned by the lockfile, and already able to sign in
  and drive a page rather than only load one. Two screenshot mechanisms is one
  too many, and the older one should go once whatever still depends on it has
  been checked. (trigger: out-of-scope, source: [[feat-browser-suite]], agent:
  claude-code)

- **The right-click menu stops at its last item rather than wrapping.** That is
  Radix's default and it is deliberate for now, asserted in
  `web/e2e/menu.spec.ts`. Turning it on is one prop. Worth a decision rather
  than a default, since native menus differ by platform. (trigger: alternative,
  source: [[feat-browser-suite]], agent: claude-code)

- **Reopening the film picker within a few milliseconds of Escape loses the
  search box's focus** to the previous close's focus restoration finishing. No
  person can click that fast and a test can, so the spec waits. If the picker
  ever gains a keyboard shortcut that closes and reopens it, this becomes
  reachable. (trigger: out-of-band, source: [[feat-browser-suite]], agent:
  claude-code)

- **Five CSS custom properties are still used with a hardcoded fallback**
  (`--dim`, `--fg`, `--panel`), which means those colours render and ignore the
  theme. `web/src/core/theme.test.ts` lists them deliberately rather than
  failing on them, because fixing one means choosing which token it should have
  been and accepting that the colour moves. (trigger: deferred, source: ADR
  0010 stage one, agent: claude-code)
