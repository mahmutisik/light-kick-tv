"""Print the release notes for a tag (e.g. v1.0.6) from CHANGELOG.md.

Used by the release workflow: the text under "## <tag>" up to the next "## " heading, followed by
the install line from the top of the file. Exits with an error if the tag has no section, so a
release is never published without notes.
Usage: python scripts/release_notes.py v1.0.6
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def notes(tag):
    text = io.open(os.path.join(ROOT, 'CHANGELOG.md'), encoding='utf-8').read()
    m = re.search(r'^## ' + re.escape(tag) + r'\s*$(.*?)(?=^## |\Z)', text, re.M | re.S)
    if not m:
        sys.exit('CHANGELOG.md has no "## %s" section' % tag)
    body = m.group(1).strip()
    install = re.search(r'^Install or update.*?(?=\n\n)', text, re.M | re.S)
    return unwrap(body + ('\n\n' + install.group(0) if install else '')) + '\n'


def unwrap(md):
    """Join hard-wrapped lines: GitHub shows every line break in release notes as a new line."""
    out = []
    for line in md.split('\n'):
        s = line.strip()
        if out and s and out[-1] and not re.match(r'([-*]|\d+\.|#)\s', s):
            out[-1] += ' ' + s
        else:
            out.append(line.rstrip())
    return '\n'.join(out)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.stdout.buffer.write(notes(sys.argv[1]).encode('utf-8'))  # UTF-8 whatever the console uses
