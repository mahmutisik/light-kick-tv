"""Package app/ as a Tizen widget: dist/LightKickTV.wgt.

The package is unsigned. Apps2Samsung ("Custom WGT File") signs it for your TV during install.
Usage: python scripts/build.py
"""
import hashlib
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "LightKickTV.wgt")


def main():
    config = open(os.path.join(APP, "config.xml"), encoding="utf-8").read()
    version = re.search(r'<widget[^>]*\bversion="([^"]+)"', config).group(1)
    os.makedirs(DIST, exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    files = []
    for base, _, names in os.walk(APP):
        for name in sorted(names):
            full = os.path.join(base, name)
            files.append((full, os.path.relpath(full, APP).replace(os.sep, "/")))
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for full, rel in sorted(files, key=lambda f: f[1]):
            z.write(full, rel)
    digest = hashlib.sha256(open(OUT, "rb").read()).hexdigest()
    with open(OUT + ".sha256", "w", encoding="utf-8") as f:
        f.write(f"{digest}  LightKickTV.wgt\n")
    print(f"Light Kick TV {version}: {OUT}")
    print(f"{len(files)} files, {os.path.getsize(OUT) // 1024} KB, sha256 {digest}")


if __name__ == "__main__":
    sys.exit(main())
