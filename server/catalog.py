"""The bin catalog, rendered on demand: every light size (generator/presets/solid_light.json) at every height in HEIGHTS,
groove and click (the two label holders), hex and solid, plus the dividers and tab dividers for each depth and height. Nothing is shipped
pre-rendered: a file is made the first time it is asked for (about a second) and kept in CACHE/catalog.

  catalog()        what exists, compact: {heights, systems: {groove: {kinds, sizes}, ...}, divider_depths}
  path(rel)        the STL for a catalog file name (rendered if needed), or None if rel is not a catalog name
      <system>/print-bin-<system>_<kind>-<w>x<d>x<h>.stl   (groove, click; the old names flex, cullenect still work)
      dividers/print-divider-<d>x<h>.stl
      labels/flex/print-divider-tab-<d>x<h>.stl

A bin is a plain solid light bin from Gridfinity Extended (GFX_DIR), cut by generator/scad/rib_bin.scad (ribs, floor
ridge, per-cell honeycomb). Groove: the flex-label groove all round the lip. Click: Gridfinity Extended's Cullenect V2
label socket on a shelf in one corner (labels from MakerWorld 446624).
"""
import json, os, re, subprocess, threading
from pathlib import Path

GEN = Path(os.environ.get("GENERATOR_DIR", "/app/generator")).resolve()
GFX = Path(os.environ.get("GFX_DIR", "/opt/gfx")).resolve()
HEIGHTS = list(range(3, 19))
SYSTEMS = {"groove": ["hex", "solid"], "click": ["hex", "solid"]}
OLD = re.compile(r"(flex|cullenect)/print-bin-\1_")   # the names before 2026-11-04
RENAMED = {"flex": "groove", "cullenect": "click"}
CULLENECT = {"label_style": "cullenect", "label_position": "left", "label_size": "[0.97, 14, 0, 0.6]",
             "label_relief": "[36.3, 0, 0, 0.6]"}
CACHE_MAX = int(os.environ.get("CACHE_MAX_MB", "2000")) * 1_000_000

BIN = re.compile(r"(?P<system>[a-z]+)/print-bin-(?P=system)_(?P<kind>[a-z]+)-(?P<w>[\d.]+)x(?P<d>[\d.]+)x(?P<h>\d+)\.stl")
DIVIDER = re.compile(r"dividers/print-divider-(?P<d>[\d.]+)x(?P<h>\d+)\.stl")
TAB = re.compile(r"labels/flex/print-divider-tab-(?P<d>[\d.]+)x(?P<h>\d+)\.stl")

_locks, _locks_lock = {}, threading.Lock()


def cells(v):
    return float(str(v).strip("[]").split(",")[0])


def _presets():
    sets = json.loads((GEN / "presets/solid_light.json").read_text())["parameterSets"]
    out = {}
    for k, p in sets.items():   # one preset per footprint; the height is set per render
        if not k.endswith("-flat"):
            out.setdefault((cells(p["width"]), cells(p["depth"])), p)
    return out


PRESETS = _presets()


def sizes(system):
    return sorted((w, d) for w, d in PRESETS if not (system == "click" and d == 0.5))   # no half-deep click bins (the shelf fills them)


def catalog():
    return {"heights": HEIGHTS,
            "systems": {s: {"kinds": k, "sizes": [[w, d] for w, d in sizes(s)]} for s, k in SYSTEMS.items()},
            "divider_depths": sorted({d for _, d in PRESETS})}


def _lock(key):
    with _locks_lock:
        return _locks.setdefault(key, threading.Lock())


def _prune(root):
    files = sorted((f for f in root.rglob("*.stl")), key=lambda f: f.stat().st_atime)
    total = sum(f.stat().st_size for f in files)
    for f in files:
        if total <= CACHE_MAX:
            break
        total -= f.stat().st_size
        f.unlink(missing_ok=True)


def _render(openscad, args, out, cwd):
    """openscad: the server's runner (shares its job limit); writes out atomically"""
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp.stl")
    openscad(["--export-format", "binstl", *args, "-o", str(tmp)], cwd=cwd)
    tmp.replace(out)


def _base(openscad, root, system, w, d, h):
    out = root / ".base" / system / f"solid_light-{w:g}x{d:g}x{h}.stl"
    with _lock(out):
        if not out.exists():
            p = {**PRESETS[(w, d)], "height": f"[{h}, 0]", **(CULLENECT if system == "click" else {})}
            preset = out.with_suffix(".json")
            preset.parent.mkdir(parents=True, exist_ok=True)
            preset.write_text(json.dumps({"fileFormatVersion": "1", "parameterSets": {"bin": p}}))
            _render(openscad, ["-p", str(preset), "-P", "bin", str(GFX / "gridfinity_basic_cup.scad")], out, GFX)
    return out


def rendered(rel, root):
    """True if a catalog name is already in the cache under root, False if it would have to be rendered, None if rel is
    not a catalog name at all"""
    rel = OLD.sub(lambda m: f"{RENAMED[m[1]]}/print-bin-{RENAMED[m[1]]}_", rel)
    if not (BIN.fullmatch(rel) or DIVIDER.fullmatch(rel) or TAB.fullmatch(rel)):
        return None
    return (root / rel).exists()


def path(rel, root, openscad):
    """the file for a catalog name under root (the cache), rendered if missing; None if rel is not in the catalog"""
    rel = OLD.sub(lambda m: f"{RENAMED[m[1]]}/print-bin-{RENAMED[m[1]]}_", rel)
    if (m := BIN.fullmatch(rel)):
        system, kind, w, d, h = m["system"], m["kind"], float(m["w"]), float(m["d"]), int(m["h"])
        if kind not in SYSTEMS.get(system, []) or (w, d) not in sizes(system) or h not in HEIGHTS:
            return None
        def make(out):
            base = _base(openscad, root, system, w, d, h)
            _render(openscad, ["-D", 'part="bin"', "-D", f'bin="{base}"', "-D", f"cells_x={w:g}", "-D", f"cells_y={d:g}",
                               "-D", f"height={h}", "-D", f"pattern={'true' if kind == 'hex' else 'false'}",
                               "-D", f"flex={'true' if system == 'groove' else 'false'}", "scad/rib_bin.scad"], out, GEN)
    elif (m := DIVIDER.fullmatch(rel) or TAB.fullmatch(rel)):
        d, h, tab = float(m["d"]), int(m["h"]), rel.startswith("labels/")
        if d not in {d for _, d in PRESETS} or h not in HEIGHTS:
            return None
        def make(out):
            _render(openscad, [*(["-D", "tab=true"] if tab else []), "-D", 'part="divider"', "-D", f"cells_y={d:g}",
                               "-D", f"height={h}", "scad/rib_bin.scad"], out, GEN)
    else:
        return None
    out = root / rel
    with _lock(out):
        if not out.exists():
            make(out)
            threading.Thread(target=_prune, args=(root,), daemon=True).start()
    os.utime(out)   # last use, for _prune
    return out
