#!/usr/bin/env python3
"""Renders the labels in library/labels: flex labels for each bin width, corner labels with a tab, lip plugs for plain
light bins. The bins, dividers and tab dividers are not shipped: server/catalog.py renders them on demand.

  python3 generator/gen_labels.py [library]      (needs OpenSCAD with Manifold)   --all re-renders
"""
import json, os, pathlib, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "library").resolve()
WIP = OUT / "labels"
FLEX_FITS = (0, 0.2)
PLUG_FITS = (0, 0.1, 0.2)


def cells(v):
    return float(v.strip("[]").split(",")[0])


def openscad(args, out):
    out.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(3):   # a render now and then fails when 30 run at once, and works on its own
        r = subprocess.run([os.environ.get("OPENSCAD") or "openscad", "--backend", "Manifold", "--export-format", "binstl",
                            *args, "-o", str(out)], cwd=ROOT, capture_output=True, text=True)
        if not r.returncode and out.exists() and "import file" not in r.stderr:
            return None
    return f"FAIL {out.name} (rc {r.returncode}): {r.stderr[-300:]}"


def main(everything=False):
    jobs = []
    sets = json.loads((ROOT / "presets/solid_light.json").read_text())["parameterSets"]
    sizes = {(cells(p["width"]), cells(p["depth"])) for k, p in sets.items() if not k.endswith("-flat")}
    for w in sorted({w for w, _ in sizes}):
        for f in FLEX_FITS:
            out = WIP / "flex" / f"print-flex-label-{w:g}_fit{f:g}.stl"
            jobs.append((openscad, (["-D", 'part="label"', "-D", f"cells_x={w:g}", "-D", f"fit={f}", "scad/flex_label.scad"], out)))
    for n, c in ((1, "left"), (2, "right")):
        out = WIP / "flex" / f"print-flex-corner-{n}-{c}_tab.stl"
        jobs.append((openscad, (["-D", 'part="label"', "-D", f"cells_x={n}", "-D", f'corner="{c}"', "-D", "tab=true",
                                 "-D", "fit=0.2", "-D", "bin_x=3", "scad/flex_label.scad"], out)))
    for n in (1, 2):
        for f in PLUG_FITS:
            out = WIP / "v1" / f"print-lip-plug-{n}_fit{f:g}.stl"
            jobs.append((openscad, (["-D", f"cells={n}", "-D", f"fit={f}", "-D", f'txt="{f:g}"'.replace('"0.', '".'),
                                     "scad/lip_plug.scad"], out)))
    todo = [j for j in jobs if everything or not j[1][-1].exists()]
    print(len(todo), "of", len(jobs), "STLs to render")
    with ThreadPoolExecutor(os.cpu_count() or 4) as ex:
        for err in ex.map(lambda j: j[0](*j[1]), todo):
            if err:
                print(err)


if __name__ == "__main__":
    main(everything="--all" in sys.argv)
    print("labels in", WIP)
