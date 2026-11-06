"""Cut the complete Literata into the venue's web cuts, one per script and style.

The sources are the OFL files in the official google/fonts repository, approved by the owner
on 5 November 2026 (docs/typography.md §5.1):

    https://raw.githubusercontent.com/google/fonts/main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf
    https://raw.githubusercontent.com/google/fonts/main/ofl/literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf
    https://raw.githubusercontent.com/google/fonts/main/ofl/literata/OFL.txt

Each cut keeps both variation axes (optical size 7–72, weight 200–900) and every OpenType
feature: the small capitals, the old-style, lining, tabular and proportional figures, the
superiors and the rest that Google's web cuts drop. The cuts' code points are the unicode
ranges src/app/typefaces.css declares for the family 'Literata', so the stylesheet and the
files cannot drift apart. The cuts and the licence are committed under fonts/literata;
`npm run fonts` publishes them. CI never runs this script.

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python scripts/subset-literata.py <directory holding the three downloaded files>
"""

import hashlib
import re
import shutil
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
STYLESHEET = ROOT / "src" / "app" / "typefaces.css"
OUTPUT = ROOT / "fonts" / "literata"

# The approved files, by their published SHA-256, so a cut is only ever made from them.
SOURCES = {
    "roman": (
        "Literata[opsz,wght].ttf",
        "b41138c9373112f32abb589cc22e8674b06ed4048b0c513be922bdd26f274440",
    ),
    "italic": (
        "Literata-Italic[opsz,wght].ttf",
        "d483dfaeba9cbf4ce71d32a52ee65df82f7e35b15fff8d1011cdb242d1fcd465",
    ),
}
LICENCE = ("OFL.txt", "8742963604cd89dc81437811a850018fc03b2bfad686d7422c8235967c87614e")
REQUIRED_FEATURES = {"kern", "liga", "smcp", "c2sc", "onum", "lnum", "pnum", "tnum", "sups"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def declared_cuts(css: str) -> dict:
    """The stylesheet's cuts of 'Literata': (script, style) -> its unicode-range."""
    cuts = {}
    for block in css.split("@font-face")[1:]:
        if not re.search(r"font-family:\s*'Literata'\s*;", block):
            continue
        name = re.search(r"literata-([a-z-]+)-(roman|italic)\.woff2", block)
        ranges = re.search(r"unicode-range:\s*([^;]+);", block)
        cuts[(name.group(1), name.group(2))] = " ".join(ranges.group(1).split())
    return cuts


def code_points(ranges: str) -> list:
    points = []
    for token in ranges.split(","):
        token = token.strip().upper().removeprefix("U+")
        start, _, end = token.partition("-")
        points.extend(range(int(start, 16), int(end or start, 16) + 1))
    return points


def cut(source: Path, points: list, target: Path) -> None:
    options = subset.Options()
    options.layout_features = ["*"]  # every feature: small caps, figure sets, superiors
    options.name_IDs = ["*"]  # copyright, licence and its URL stay in every cut
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.flavor = "woff2"
    font = TTFont(source)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(target)


def features(path: Path) -> set:
    font = TTFont(path)
    return {
        record.FeatureTag
        for table in ("GSUB", "GPOS")
        if table in font
        for record in font[table].table.FeatureList.FeatureRecord
    }


def main(directory: str) -> None:
    folder = Path(directory)
    for name, digest in [*SOURCES.values(), LICENCE]:
        actual = sha256(folder / name)
        if actual != digest:
            sys.exit(f"{name} is not the approved file: sha256 {actual}")
    cuts = declared_cuts(STYLESHEET.read_text())
    if not cuts:
        sys.exit(f"{STYLESHEET} declares no cut of 'Literata'")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for (script, style), ranges in sorted(cuts.items()):
        target = OUTPUT / f"literata-{script}-{style}.woff2"
        cut(folder / SOURCES[style][0], code_points(ranges), target)
        if script == "latin":
            missing = REQUIRED_FEATURES - features(target)
            if missing:
                sys.exit(f"{target.name} lost {', '.join(sorted(missing))}")
        print(f"{target.name}: {target.stat().st_size / 1000:.1f} KB")
    shutil.copyfile(folder / LICENCE[0], OUTPUT / LICENCE[0])
    print(f"{len(cuts)} cuts and {LICENCE[0]} written to {OUTPUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
