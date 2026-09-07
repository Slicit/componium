#!/usr/bin/env python3
"""The feature files, checked and indexed.

    python3 hack/logbook.py check     what is wrong with them
    python3 hack/logbook.py index     write LOGBOOK/features/INDEX.md
    python3 hack/logbook.py index --check
                                      fail if that file is out of date

Why this exists at all: LOGBOOK.md has told every agent since 2026-08-29 to
read `LOGBOOK/features/INDEX.md`, and that file had never been written. A
reading order pointing at nothing is worse than no reading order, because it
looks like the map exists and somebody else has it.

The rules below are deliberately few, and each is load-bearing rather than
tidy:

  Intent         What this is for. Without it a file is a list of decisions
                 whose subject you have to reconstruct.
  Decisions      Where the next person appends. LOGBOOK.md instructs agents to
                 append to it, so a file without one has nowhere to put what it
                 learns, and the learning ends up in a commit message instead.
  Verification   What was actually proven, and how. Only demanded of shipped
                 work, because a plan has nothing to verify yet, and demanding
                 it everywhere would produce a section that says "not yet" 22
                 times and means nothing anywhere.
  Links          What this connects to. Cheap, and it is the difference between
                 22 documents and one.

Order is not checked. Presence is. Twenty two files written over a fortnight
have their own shapes and those shapes are usually good; four sections that are
always there is a floor, not a template.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FEATURES = os.path.join(ROOT, "LOGBOOK", "features")
INDEX = os.path.join(FEATURES, "INDEX.md")

STATUSES = ["active", "shipped", "proposed", "draft", "deferred"]

# What each status has to carry. Intent and Links are unconditional.
REQUIRED = {
    "draft": ["Intent", "Links"],
    "proposed": ["Intent", "Links"],
    "deferred": ["Intent", "Links"],
    "active": ["Intent", "Decisions", "Links"],
    "shipped": ["Intent", "Decisions", "Verification", "Links"],
}

FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)
TITLE = re.compile(r"^# (.+)$", re.M)
HEADING = re.compile(r"^## (.+)$", re.M)
LINK = re.compile(r"\[\[([^\]]+)\]\]")


class Feature:
    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)[:-3]
        self.text = open(path, encoding="utf-8").read()
        self.front = {}
        m = FRONT.match(self.text)
        if m:
            for line in m.group(1).split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    self.front[k.strip()] = v.strip()
        t = TITLE.search(self.text)
        self.title = t.group(1).strip() if t else ""
        self.headings = [h.strip() for h in HEADING.findall(self.text)]

    @property
    def status(self):
        return self.front.get("status", "")

    def section(self, name):
        """The body of one `## name` section, or ''."""
        m = re.search(
            r"^## " + re.escape(name) + r"\s*\n(.*?)(?=^## |\Z)",
            self.text,
            re.S | re.M,
        )
        return m.group(1).strip() if m else ""

    @property
    def hook(self):
        """One line for the index: the first sentence of the intent."""
        body = self.section("Intent")
        # Skip a leading status paragraph, which two of these files carry.
        paras = [p for p in body.split("\n\n") if p.strip()]
        for p in paras:
            flat = " ".join(p.split())
            if flat.startswith("Status:"):
                continue
            # First sentence, allowing for abbreviations by requiring a space
            # and a capital or end of string after the stop.
            m = re.search(r"^(.+?[.!?])(?:\s|$)", flat)
            line = m.group(1) if m else flat
            # A wikilink is for the feature files to follow. Here it is
            # just two pairs of brackets a reader has to look past.
            return LINK.sub(lambda x: x.group(1), line)
        return ""


def load():
    out = []
    for name in sorted(os.listdir(FEATURES)):
        if name.endswith(".md") and name != "INDEX.md":
            out.append(Feature(os.path.join(FEATURES, name)))
    return out


def check(features):
    problems = []
    known = {f.name for f in features}

    for f in features:
        where = "LOGBOOK/features/" + f.name + ".md"

        if not f.front:
            problems.append(where + ": no frontmatter. Needs status: and branch:.")
            continue
        if f.status not in STATUSES:
            problems.append(
                where + ": status is " + repr(f.status) + ", want one of "
                + ", ".join(STATUSES)
            )
            continue
        if "branch" not in f.front:
            problems.append(where + ": no branch: in the frontmatter")
        if not f.title:
            problems.append(where + ": no `# ` title")

        for need in REQUIRED[f.status]:
            if need not in f.headings:
                problems.append(
                    where + ": " + f.status + " work needs a `## " + need + "` section"
                )

        for target in LINK.findall(f.text):
            if target not in known:
                problems.append(
                    where + ": [[" + target + "]] does not name a feature file"
                )

        if not f.hook:
            problems.append(where + ": the Intent section is empty, so the index has no line")

    return problems


def render(features):
    by_status = {s: [] for s in STATUSES}
    for f in features:
        by_status.get(f.status, by_status["draft"]).append(f)

    lines = [
        "<!-- Written by hack/logbook.py. Edit the feature files, then run:",
        "         python3 hack/logbook.py index",
        "     CI fails if this file is out of date. -->",
        "",
        "# Features",
        "",
        "Every feature file, newest status first. The line under each name is the",
        "first sentence of its own Intent, so a stale line here means a stale",
        "Intent there rather than a stale index.",
        "",
    ]

    headings = {
        "active": ("Active", "Being worked on now."),
        "shipped": ("Shipped", "Done, and verified in the way each file says."),
        "proposed": ("Proposed", "Argued for, not started."),
        "draft": ("Draft", "Being written."),
        "deferred": ("Deferred", "Deliberately not now, and the reasoning is kept."),
    }

    for status in STATUSES:
        group = by_status[status]
        if not group:
            continue
        name, blurb = headings[status]
        lines.append("## " + name + " (" + str(len(group)) + ")")
        lines.append("")
        lines.append(blurb)
        lines.append("")
        for f in sorted(group, key=lambda x: x.name):
            lines.append("- [" + f.name + "](" + f.name + ".md) · " + f.hook)
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(
        "Total: " + str(len(features)) + " features. `LOGBOOK.md` is the entry point,"
    )
    lines.append("`LOGBOOK/notes.md` holds what generalises past one feature, and")
    lines.append("`LOGBOOK/candidates.md` holds what has been noticed and not yet triaged.")
    return "\n".join(lines) + "\n"


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ("check", "index"):
        print(__doc__)
        return 2

    features = load()

    if args[0] == "check":
        problems = check(features)
        if problems:
            print("the feature files do not hold together:\n")
            for p in problems:
                print("  " + p)
            print("\n" + str(len(problems)) + " problems")
            return 1
        print("logbook: " + str(len(features)) + " features, all in shape")
        return 0

    want = render(features)
    if "--check" in args:
        have = open(INDEX, encoding="utf-8").read() if os.path.exists(INDEX) else ""
        if have != want:
            print("LOGBOOK/features/INDEX.md is out of date. Run:")
            print("    python3 hack/logbook.py index")
            return 1
        print("logbook: the index is current")
        return 0

    with open(INDEX, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(want)
    print("wrote LOGBOOK/features/INDEX.md, " + str(len(features)) + " features")
    return 0


if __name__ == "__main__":
    sys.exit(main())
