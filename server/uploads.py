"""Bins uploaded by users (2026-11-03: a library on the server, shared by everyone using this installation).

Each upload is checked and normalised: the STL is read (binary or ASCII), moved so that its footprint is centred on the
origin and its bottom is at z 0 (as our own bins), and written back as binary STL. The footprint in cells (42 mm, half
cells allowed) and the height in units (7 mm) come from its size; a bin that does not fit the grid gets a warning but is
kept. Stored as UPLOADS/<id>.stl with UPLOADS/<id>.json (name, creator, size, warning).
"""
import json
import re
import struct
import time
import uuid
from pathlib import Path

import bambu3mf

MAX_BYTES = 60_000_000
PITCH, UNIT, CLEARANCE = 42.0, 7.0, 0.5
LIP = 3.74            # a light bin's stacking lip above its height in units (gridfinity-bins/scad/rib_bin.scad: TOP)
TOLERANCE = 1.5       # mm off the grid before it gets a warning


def footprint(dx, dy, dz):
    """size in mm -> (cells x, cells y, units, warning or "")"""
    w = max(0.5, round((dx + CLEARANCE) / PITCH * 2) / 2)
    d = max(0.5, round((dy + CLEARANCE) / PITCH * 2) / 2)
    h = max(1, round((dz - LIP) / UNIT))
    warn = []
    if abs(dx - (w * PITCH - CLEARANCE)) > TOLERANCE or abs(dy - (d * PITCH - CLEARANCE)) > TOLERANCE:
        warn.append(f"footprint {dx:.1f} x {dy:.1f} mm is not a Gridfinity size ({w * PITCH - CLEARANCE:g} x {d * PITCH - CLEARANCE:g} expected)")
    return w, d, h, "; ".join(warn)


def write_stl(verts, faces):
    out = bytearray(80) + struct.pack("<I", len(faces))
    for a, b, c in faces:
        pa, pb, pc = verts[a], verts[b], verts[c]
        u = [pb[i] - pa[i] for i in range(3)]
        v = [pc[i] - pa[i] for i in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        out += struct.pack("<12fH", *n, *pa, *pb, *pc, 0)
    return bytes(out)


def save(root: Path, data: bytes, name: str, creator: str, filename: str):
    if len(data) > MAX_BYTES:
        raise ValueError("file too large (max 60 MB)")
    if len(data) < 84:
        raise ValueError("not an STL file")
    verts, faces = bambu3mf.read_stl(data)
    if len(faces) < 4:
        raise ValueError("no mesh in this STL")
    lo, hi = bambu3mf.bounds(verts)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    verts = [(x - cx, y - cy, z - lo[2]) for x, y, z in verts]
    dx, dy, dz = hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]
    w, d, h, warning = footprint(dx, dy, dz)
    clean = lambda s, n: re.sub(r"[\x00-\x1f<>]", "", (s or "").strip())[:n]   # noqa: E731
    meta = {
        "id": uuid.uuid4().hex[:12],
        "name": clean(name, 60) or clean(Path(filename or "bin").stem, 60) or "bin",
        "creator": clean(creator, 40),
        "filename": clean(filename, 120),
        "w": w, "d": d, "h": h,
        "size": [round(dx, 2), round(dy, 2), round(dz, 2)],
        "triangles": len(faces),
        "warning": warning,
        "created": int(time.time() * 1000),
    }
    root.mkdir(parents=True, exist_ok=True)
    (root / f"{meta['id']}.stl").write_bytes(write_stl(verts, faces))
    (root / f"{meta['id']}.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    return meta


def entries(root: Path):
    """the uploads as library entries (like our bins, system "community")"""
    out = []
    if not root.is_dir():
        return out
    for f in sorted(root.glob("*.json")):
        try:
            m = json.loads(f.read_text())
        except (OSError, ValueError):
            continue
        stl = root / f"{m['id']}.stl"
        if stl.is_file():
            out.append({"file": f"uploads/{m['id']}.stl", "type": "bin", "system": "community", "kind": "custom",
                        "w": m["w"], "d": m["d"], "h": m["h"], "name": m["name"], "creator": m.get("creator", ""),
                        "warning": m.get("warning", ""), "bytes": stl.stat().st_size, "created": m.get("created", 0)})
    return sorted(out, key=lambda e: -e["created"])


def meta(root: Path, upload_id: str):
    if not re.fullmatch(r"[0-9a-f]{12}", upload_id):
        raise ValueError("bad upload id")
    f = root / f"{upload_id}.json"
    return json.loads(f.read_text()) if f.is_file() else None


def delete(root: Path, upload_id: str):
    if not re.fullmatch(r"[0-9a-f]{12}", upload_id):
        raise ValueError("bad upload id")
    for ext in ("stl", "json"):
        (root / f"{upload_id}.{ext}").unlink(missing_ok=True)
