---
status: shipped
branch: feat-e2e-and-docs
---

# feat-the-record · what this project shows to somebody who is not us

## Intent

Componium and Stream Composer are sibling projects on the same LOGBOOK spec,
written the same fortnight by the same people. Asked to compare them, the
result was not the one expected: Componium is well ahead on decisions, with ten
ADRs against none, and well ahead on enforcement, with `check-edits.sh`, the
layering, house-rule, theme and parity tests, a dependency age gate and oxlint
at two levels.

Where it was behind was everything facing a reader who is not the person who
wrote it. No operator documentation. No troubleshooting. No images of anything.
Twenty six feature files with eighty seven distinct section headings and no
links between them. A `candidates.md` that had been empty since the day it was
created. And an `INDEX.md` that `LOGBOOK.md` had pointed every agent at since
2026-08-29 and which had never existed.

Four milestones, taken together with [[feat-browser-suite]], which was the
fifth and came first because it was the one with a bug behind it.

## Decisions

- **2026-09-07 · The comparison ran both ways, and saying so mattered.** The
  first version of this work was framed as "adopt the better project's
  practices". That was wrong in a way worth recording: Stream Composer has no
  ADRs at all and no enforced house rules, and its architecture rationale is
  scattered through one long document and a dozen Decisions logs. What it has
  is a reader who is not its author, and documents written for that reader.

- **2026-09-07 · Troubleshooting is organised by symptom, notes.md by cause.**
  They cover several of the same failures on purpose and neither restates the
  other. `LOGBOOK/notes.md` is for somebody changing the code and is written
  cause first; `docs/troubleshooting.md` is for somebody whose fan will not
  turn, and starts from what they are looking at. Duplicating the *material*
  while splitting the *audience* is the right trade here, and the links
  between them are what stops it becoming two divergent accounts.

- **2026-09-07 · The feature files keep their shapes; only the floor is
  enforced.** Requiring a fixed template across twenty six files written over a
  fortnight would have flattened prose that is mostly good. What is checked is
  presence, not order, and only four sections: Intent and Links always,
  Decisions once work is active, Verification once it has shipped. Verification
  is deliberately not demanded of a plan, because a rule that produces "not
  yet" twenty two times means nothing anywhere.

- **2026-09-07 · Almost none of the retrofit was new writing.** The lead
  paragraph under each title already was the intent and got the heading it
  deserved; `## Related` already was `## Links`; "What was verified, and how"
  and "What is tested, and what is not" were renamed rather than rewritten.
  Six files genuinely recorded nothing about what proved them, and those now
  say what did or say plainly that nothing does.

- **2026-09-07 · Two statuses were simply wrong, and are corrected in the
  open.** [[feat-timeline-v2]] said "proposed, not started" with phases 0 to 3
  shipped. [[feat-score-editing]] said "deferred, not started" while claiming
  in its body that the studio has no undo. Both are corrected with a dated
  Decisions entry rather than quietly, and both keep their original analysis,
  because that analysis is what shaped the work.

- **2026-09-07 · The exceptions register is the point of the house rules, not
  a softening of them.** A rule with no way to say "not this one, and here is
  why" gets deleted the first time it is inconvenient, and then nothing is
  checked. None of the seven exceptions are new: each was already a bare array
  in `houserules.test.ts`, which is the worst place for a carve-out, because
  one nobody can see is indistinguishable from a rule nobody wrote.

- **2026-09-07 · Screenshots are a Playwright project, not a script.** The
  fixture studio, the dev server and the pinned browser already existed for
  [[feat-browser-suite]]. A second copy would age the way `hack/shoot-studio.sh`
  has, and making each capture an assertion means a page that renders an error
  fails the run rather than being photographed. That is the failure mode of
  every screenshot pipeline and it has already happened here twice.

- **2026-09-07 · The em-dash rule is filed, not enforced.** "No em-dashes" is
  the first convention in `LOGBOOK.md` and there are 726 of them across 171
  tracked files. Enforcing it means a real editing pass, since a blind replace
  garbles sentences; scoping it to prose and dropping it are both defensible.
  Which of those is right is a decision about what the project means by a rule,
  so it went to `candidates.md` rather than being decided by whoever noticed.

## Verification

`hack/logbook.py check` and `index --check` run in `check-edits.sh` and in CI.
Three ways they can fail are mutation-tested rather than assumed: a `[[link]]`
to a file that does not exist, a shipped feature with no Verification section,
and an index that has drifted from the files it indexes. The link check covers
`candidates.md` and `notes.md` too, since an append-only file is where a link
to a renamed feature is most likely to rot.

The exceptions register is read back by `web/src/ui/houserules.test.ts`, and
two failures are mutation-tested: an entry naming a file that no longer exists,
and a file carved out in the test with no line in the register.

The screenshots verify themselves by being taken: nine pages, each waiting on
something real before the shutter, and the room is genuinely rendered rather
than photographed as a black rectangle.

What is not verified is the prose. `docs/troubleshooting.md` is drawn from
failures this project actually survived, and every entry is traceable to a
`notes.md` entry, an ADR or a commit, but nothing checks that it stays true as
the code moves. That is the ordinary cost of documentation and it is worth
naming rather than pretending otherwise.

## Links

- Branch: `feat-e2e-and-docs`
- `docs/running.md`, `docs/troubleshooting.md`, `docs/screenshots/README.md`
- `hack/logbook.py`, `LOGBOOK/features/INDEX.md`, `LOGBOOK/candidates.md`
- Related features: [[feat-browser-suite]] (the fifth milestone, and the one
  with a bug behind it), [[feat-timeline-v2]] and [[feat-score-editing]] (the
  two records that were wrong)
- The sibling this borrows from: Slicit/stream-composer
