"""Bambu Lab system profiles (Bambu Studio's resources/profiles/BBL, fetched at build time): the printers with their bed
sizes, and a project config for the Bambu project 3MF made from the printer's system presets, so Bambu Studio opens the
file as a project (with its plates) and selects the same system profiles by name.

A preset's settings are its own keys over those of the preset it `inherits`, recursively; `include` pulls in template
files (G-code). The project config is the printer + process + filament settings, every per-filament setting (the keys of
the filament presets) repeated once per filament, plus the bookkeeping keys Bambu Studio writes for N filaments.
"""
import json
import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(os.environ.get("BBL_PROFILES", "/opt/bbl-profiles")).resolve()
SKIP = {"inherits", "include", "instantiation", "from", "type", "setting_id", "name", "version", "description",
        "renamed_from", "compatible_printers", "compatible_printers_condition", "compatible_prints",
        "compatible_prints_condition", "filament_id"}
FLUSH = "280"   # purge volume between two filaments (Bambu Studio's PLA default)


@lru_cache(maxsize=1)
def index():
    out = {}
    for kind in ("machine", "process", "filament"):
        for f in (ROOT / kind).rglob("*.json"):
            try:
                d = json.loads(f.read_text())
            except (OSError, ValueError):
                continue
            if "name" in d:
                out[(kind, d["name"])] = d
    return out


def resolve(kind, name, _depth=0):
    """the full settings of a preset: parents first, then includes, then its own keys"""
    d = index().get((kind, name))
    if d is None or _depth > 20:
        raise KeyError(f"no {kind} profile {name!r}")
    out = {}
    if d.get("inherits"):
        out.update(resolve(kind, d["inherits"], _depth + 1))
    for inc in d.get("include", []):
        out.update({k: v for k, v in resolve(kind, inc, _depth + 1).items()})
    out.update({k: v for k, v in d.items() if k not in ("inherits", "include")})
    return out


def bed(printable_area):
    pts = [tuple(float(v) for v in p.split("x")) for p in printable_area]
    return [round(max(p[0] for p in pts) - min(p[0] for p in pts), 1), round(max(p[1] for p in pts) - min(p[1] for p in pts), 1)]


@lru_cache(maxsize=1)
def printers():
    """every printer with a nozzle size: [{id, model, nozzle, bed, extruders}], P1S/A1/X1 first"""
    out = []
    for (kind, name), d in index().items():
        if kind != "machine" or d.get("instantiation") != "true" or "nozzle" not in name:
            continue
        try:
            r = resolve("machine", name)
        except KeyError:
            continue
        if "printable_area" not in r:
            continue
        out.append({"id": name, "model": r.get("printer_model", name), "nozzle": r.get("printer_variant", ""),
                    "bed": bed(r["printable_area"]), "extruders": len(r.get("nozzle_diameter", ["0.4"]))})
    return sorted(out, key=lambda p: (p["model"], float(p["nozzle"] or 0)))


def filament_preset(machine, material):
    """the system filament preset for `material` (e.g. "PLA Matte") on this printer, else the printer's default"""
    want = f"Bambu {material} @"
    cands = []
    for (kind, name), d in index().items():
        if kind == "filament" and d.get("instantiation") == "true" and name.startswith(want):
            if machine in (d.get("compatible_printers") or []):
                cands.append(name)
    if cands:
        return sorted(cands, key=len)[0]
    return resolve("machine", machine)["default_filament_profile"][0]


def project_config(machine, filaments):
    """filaments: [(material, "#RRGGBB")] in slot order -> the Metadata/project_settings.config dict"""
    m = resolve("machine", machine)
    process = m["default_print_profile"]
    p = resolve("process", process)
    n = len(filaments)
    fil_names = [filament_preset(machine, mat) for mat, _ in filaments]
    fils = [resolve("filament", f) for f in fil_names]
    cfg = {}
    cfg.update({k: v for k, v in p.items() if k not in SKIP})
    cfg.update({k: v for k, v in m.items() if k not in SKIP})
    # per-filament settings: each filament's list, one after the other
    keys = sorted({k for f in fils for k in f if k not in SKIP})
    for k in keys:
        vals = []
        for f in fils:
            v = f.get(k, fils[0].get(k))
            vals += v if isinstance(v, list) else [v]
        cfg[k] = vals if any(isinstance(f.get(k), list) for f in fils) else vals[0]
    flush = [["0" if i == j else FLUSH for j in range(n)] for i in range(n)]
    cfg.update({
        "name": "project_settings",
        "from": "project",
        # Bambu Studio parses this as a version; the preset files often have none
        "version": resolve("machine", machine).get("version") or "02.08.02.61",
        "print_settings_id": process,
        "printer_settings_id": machine,
        "filament_settings_id": fil_names,
        "filament_colour": [c.upper() for _, c in filaments],
        "filament_self_index": [str(i + 1) for i in range(n)],
        "filament_map": ["1"] * n,
        "filament_nozzle_map": ["1"] * n,
        "filament_volume_map": ["0"] * n,
        "flush_volumes_matrix": [v for row in flush for v in row],
        "flush_volumes_vector": ["140"] * (2 * n),
        "different_settings_to_system": [""] * (n + 2),
        "inherits_group": [""] * (n + 2),
        "filament_ids": [index()[("filament", f)].get("filament_id", "") for f in fil_names],
    })
    return cfg


# --- project settings from a real Bambu Studio project (templates/<printer>.json, 2026-11-03) ---------------------
# Settings generated from the profile files were refused ("Invalid configuration file"), so a project saved by Bambu
# Studio is the template: its printer and process stay as they are, and the per-filament settings (every list whose length
# is a multiple of the template's filament count: one, two (extruder variants), four or eight entries per filament) are
# rebuilt for our filaments, each copied from the template filament of the same material (else its first PLA Basic).
TEMPLATES = Path(os.environ.get("BAMBU_TEMPLATES", "/app/templates")).resolve()


def template_for(printer):
    f = TEMPLATES / f"{printer}.json"
    return json.loads(f.read_text()) if f.is_file() else None


def template_config(tpl, filaments):
    """tpl: a project_settings.config; filaments: [(material, "#RRGGBB")] in slot order"""
    ids = tpl["filament_settings_id"]
    F, n = len(ids), len(filaments)

    def source(material):
        for i, name in enumerate(ids):
            if name.startswith(f"Bambu {material} @"):
                return i
        for i, name in enumerate(ids):
            if "PLA Basic" in name:
                return i
        return 0

    src = [source(mat) for mat, _ in filaments]
    cfg = dict(tpl)
    for k, v in tpl.items():
        if not isinstance(v, list) or not v or len(v) % F or k == "flush_volumes_matrix":
            continue
        chunk = len(v) // F
        cfg[k] = [x for s in src for x in v[s * chunk:(s + 1) * chunk]]
    old = tpl.get("flush_volumes_matrix", [])
    if len(old) == F * F:
        # between two of our filaments made from the same template filament the template has no value: its median flush
        nonzero = sorted(float(x) for x in old if float(x) > 0)
        typical = f"{nonzero[len(nonzero) // 2]:g}" if nonzero else FLUSH

        def flush(i, j):
            if i == j:
                return "0"
            v = old[src[i] * F + src[j]]
            return v if float(v) > 0 else typical

        cfg["flush_volumes_matrix"] = [flush(i, j) for i in range(n) for j in range(n)]
    chunk = len(tpl.get("filament_self_index", [])) // F or 1
    cfg["filament_self_index"] = [str(i + 1) for i in range(n) for _ in range(chunk)]
    cfg["filament_colour"] = [c.upper() for _, c in filaments]
    return cfg
