#!/usr/bin/env python3
"""Renders the full bin library (every light size at 3/6/9 U, hex and solid, flex and Cullenect, dividers, labels) into
the library layout the server reads. The Docker build runs it with --build-arg FULL_LIBRARY=1; the repository itself
ships a starter set in library/.

  python3 generator/gen_library.py <out dir>     (needs OpenSCAD with Manifold and Gridfinity Extended in $GFX_DIR)
      <out>/bins/flex/print-bin-flex_{hex,solid}-<w>x<d>x<h>.stl, <out>/bins/cullenect/..., <out>/bins/dividers/...,
      <out>/labels/flex/..., <out>/labels/v1/...

Both bin kinds have divider ribs at the joints between cells, a floor ridge and a honeycomb laid out per cell
(scad/rib_bin.scad); flex bins have the flex-label groove, Cullenect bins Gridfinity Extended's Cullenect V2 label socket
on a shelf 0.97 cells wide (the socket stays the standard 36.3 mm; at full width the shelf reaches into the divider).
"""
import json, os, pathlib, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent
GFX = pathlib.Path(os.environ.get("GFX_DIR", "/opt/gfx"))
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "library").resolve()
BASE = {"flex": OUT / ".base/flex", "cullenect": OUT / ".base/cullenect"}
CULLENECT = {"label_style": "cullenect", "label_position": "left", "label_size": "[0.97, 14, 0, 0.6]",
             "label_relief": "[36.3, 0, 0, 0.6]"}
BINS = OUT / "bins"
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


def base_bin(system, k, p):
    base = BASE[system] / f"solid_light-{k}.stl"
    if base.exists():
        return base, None
    preset = ROOT / "presets/solid_light.json"
    if system == "cullenect":
        preset = BASE[system] / f"solid_light-{k}.json"
        preset.parent.mkdir(parents=True, exist_ok=True)
        preset.write_text(json.dumps({"fileFormatVersion": "1", "parameterSets": {k: {**p, **CULLENECT}}}))
    return base, openscad(["-p", str(preset), "-P", k, str(GFX / "gridfinity_basic_cup.scad")], base)


def bin_job(system, hexed, k, p, out):
    base, err = base_bin(system, k, p)
    if err:
        return err
    w, d, h = cells(p["width"]), cells(p["depth"]), int(cells(p["height"]))
    return openscad(["-D", 'part="bin"', "-D", f'bin="{base}"', "-D", f"cells_x={w:g}", "-D", f"cells_y={d:g}",
                     "-D", f"height={h}", "-D", f"pattern={'true' if hexed else 'false'}",
                     "-D", f"flex={'true' if system == 'flex' else 'false'}", "scad/rib_bin.scad"], out)


def main(everything=False):
    jobs = []
    sets = {k: p for k, p in json.loads((ROOT / "presets/solid_light.json").read_text())["parameterSets"].items()
            if not k.endswith("-flat")}
    # the solid base bins are shared by the hex and solid version: render them first, once each
    bases = []
    for system in ("flex", "cullenect"):
        for k, p in sets.items():
            if system == "cullenect" and cells(p["depth"]) == 0.5:
                continue
            bases.append((system, k, p))
            for kind in ("hex", "solid"):
                out = BINS / system / f"print-bin-{system}_{kind}-{k}.stl"
                jobs.append((bin_job, (system, kind == "hex", k, p, out)))
    sizes = {(cells(p["width"]), cells(p["depth"])) for p in sets.values()}
    for d in sorted({d for _, d in sizes}):
        for h in (3, 6, 9):
            div = ["-D", 'part="divider"', "-D", f"cells_y={d:g}", "-D", f"height={h}", "scad/rib_bin.scad"]
            jobs.append((openscad, (div, BINS / "dividers" / f"print-divider-{d:g}x{h}.stl")))
            jobs.append((openscad, (["-D", "tab=true", *div], WIP / "flex" / f"print-divider-tab-{d:g}x{h}.stl")))
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
        for err in ex.map(lambda b: base_bin(*b)[1], bases):
            if err:
                print(err)
        for err in ex.map(lambda j: j[0](*j[1]), todo):
            if err:
                print(err)


if __name__ == "__main__":
    main(everything="--all" in sys.argv)
    print("library in", OUT)
