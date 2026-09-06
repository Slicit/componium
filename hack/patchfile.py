"""Changing a file in this repo without quietly breaking it.

Every mangled file in this repo came from one of two habits, and both are easy
to fall back into because both usually work.

The first is putting a program inside an ssh argument. A heredoc or a quoted
command travels through the local shell before it is anything else, and the
local shell eats backticks, apostrophes and backslashes on the way. It has
emptied TypeScript template literals, turned Go struct tags into nothing, and
in each case produced a file that still parsed. Write the program to a file,
copy the file, run the file.

The second is a replace that matches more or less than intended. `sed -i` and
`str.replace` are happy to change nothing at all, or to change five places when
you meant one, and both are silent. A patch that no longer matches after gofmt
has reformatted its target looks exactly like a patch that worked.

So every edit here states how many times it expects to match, and fails
otherwise. That single habit has caught more mistakes than any test: a count
that is wrong means the file is not what the patch thinks it is, which is worth
knowing before the change lands rather than after.

Usage:

    import sys
    sys.path.insert(0, "hack")
    from patchfile import edit, insert_after

    edit("internal/cip/messages.go", [
        ("old text", "new text"),
    ])
"""

import io
import os

NL = chr(10)


def read(path):
    """The file exactly as it is, with no newline translation.

    newline="" matters: without it Python turns CRLF into LF on the way in, the
    patch matches, and the file is written back with the line endings silently
    changed. The repo has a CI job about that.
    """
    with io.open(path, encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path, text):
    """Write with LF endings, whatever platform this is running on."""
    with io.open(path, "w", encoding="utf-8", newline=NL) as fh:
        fh.write(text)


def edit(path, pairs, count=1, quiet=False):
    """Replace each old with each new, insisting on how many times it matches.

    `count` is how many occurrences each `old` must have. It is 1 by default
    because that is the honest case: a replacement that matches twice is
    usually a patch about to change the wrong one of them.

    Raises before touching the file if any expectation fails, so a patch that
    is half right leaves nothing half changed.
    """
    text = read(path)
    for old, new in pairs:
        found = text.count(old)
        if found != count:
            raise AssertionError(
                "%s: expected %d occurrence(s) of %r, found %d"
                % (path, count, _short(old), found))
        text = text.replace(old, new, count)

    if text == read(path):
        raise AssertionError("%s: the patch changed nothing" % path)
    write(path, text)
    if not quiet:
        print("  patched %s" % path)


def insert_after(path, anchor, block, quiet=False):
    """Put block immediately after anchor, which must appear exactly once."""
    edit(path, [(anchor, anchor + block)], quiet=quiet)


def replace_all(path, old, new, expect, quiet=False):
    """Replace every occurrence, saying up front how many there should be.

    For the genuinely repetitive case, where the count is the check.
    """
    text = read(path)
    found = text.count(old)
    if found != expect:
        raise AssertionError(
            "%s: expected %d occurrence(s) of %r, found %d"
            % (path, expect, _short(old), found))
    write(path, text.replace(old, new))
    if not quiet:
        print("  patched %s (%d places)" % (path, found))


def strip_cr(path, quiet=False):
    """Remove carriage returns, for a file that came from a Windows editor."""
    text = read(path)
    if "\r" not in text:
        return False
    write(path, text.replace("\r" + NL, NL).replace("\r", NL))
    if not quiet:
        print("  stripped carriage returns from %s" % path)
    return True


def _short(text):
    one = text.strip().split(NL)[0]
    return one[:60] + ("..." if len(text) > 60 else "")


def relative_to_repo(path):
    """Resolve a path against the repo root, so a patch runs from anywhere."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(root, path)
