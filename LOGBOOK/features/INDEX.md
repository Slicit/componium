<!-- Written by hack/logbook.py. Edit the feature files, then run:
         python3 hack/logbook.py index
     CI fails if this file is out of date. -->

# Features

Every feature file, newest status first. The line under each name is the
first sentence of its own Intent, so a stale line here means a stale
Intent there rather than a stale index.

## Active (4)

Being worked on now.

- [feat-first-real-device](feat-first-real-device.md) · The first hardware in the project.
- [feat-nodes-carry-several-devices](feat-nodes-carry-several-devices.md) · One ESP32 driving one fan is a demonstration, not a rig.
- [feat-score-editing](feat-score-editing.md) · Real editing of the generated score, not just correcting one cue at a time.
- [feat-timeline-v2](feat-timeline-v2.md) · A timeline somebody who edits video for a living would accept.

## Shipped (19)

Done, and verified in the way each file says.

- [feat-analysis-engine](feat-analysis-engine.md) · Turn scenes into events, with four things the earlier composer could not do: recognise calm, estimate camera movement and speed, spot a plunge, and drive light in two layers rather than one.
- [feat-browser-suite](feat-browser-suite.md) · Three pieces of behaviour in the studio had no test, and each of them had a comment saying so.
- [feat-chunked-analysis](feat-chunked-analysis.md) · Analysing a two hour film is a single run of tens of minutes that either finishes or is worth nothing.
- [feat-composer-v0](feat-composer-v0.md) · The cheap half of feat-composer: prove the pipeline end to end with the two signals that cost least and deliver most, before spending anything on semantic detection.
- [feat-composer-v1](feat-composer-v1.md) · The expensive half.
- [feat-effect-parity](feat-effect-parity.md) · Reported as: insert Strobe at the playhead, get one light event with no intensity and no points.
- [feat-esp32-node](feat-esp32-node.md) · Most custom effects are a microcontroller and a driver board.
- [feat-frame-clock](feat-frame-clock.md) · Reported as a strobe that does not line up with the room, with the reasonable guess that the 3D view cannot keep up.
- [feat-motion-and-wet](feat-motion-and-wet.md) · The last milestone, and last for a reason: these are the effects that can hurt someone.
- [feat-ota](feat-ota.md) · A node is a small box on a wall, behind a screen, or in a ceiling.
- [feat-postgres](feat-postgres.md) · The plan for ADR 0006.
- [feat-sacn-light](feat-sacn-light.md) · The first instrument that talks to real hardware.
- [feat-safety](feat-safety.md) · Componium drives water, heaters, high power fans and eventually moving mass.
- [feat-score-format](feat-score-format.md) · A score says what should happen.
- [feat-spans](feat-spans.md) · Scores are generated ahead of time, so nothing needs a high refresh rate at playback.
- [feat-studio](feat-studio.md) · Authoring is the real user experience problem.
- [feat-timing-core](feat-timing-core.md) · Everything in Componium rests on one unverified assumption: that a media player's reported position can be disciplined into a clock good enough to land a cue on a frame.
- [feat-tuning](feat-tuning.md) · The clock spike showed that timing quality depends entirely on what is at the other end: mpv resolves to 41 ms and answers in 53 us, VLC resolves to 247 ms and answers in 21 ms.
- [feat-two-clocks](feat-two-clocks.md) · Three complaints arrived together and turned out to be one shape.

## Proposed (1)

Argued for, not started.

- [feat-rest](feat-rest.md) · Written 2026-08-30 after the observation that there is "way too much shake and motion platform, and/or they seem too brutal too often, even on some absolutely calm scenes".

## Draft (1)

Being written.

- [feat-composer](feat-composer.md) · Authoring a score by hand takes hours per film, so hand authoring alone limits Componium to a handful of titles.

## Deferred (1)

Deliberately not now, and the reasoning is kept.

- [feat-body-haptics](feat-body-haptics.md) · Two effects that act on the body rather than on the room:

---

Total: 26 features. `LOGBOOK.md` is the entry point,
`LOGBOOK/notes.md` holds what generalises past one feature, and
`LOGBOOK/candidates.md` holds what has been noticed and not yet triaged.
