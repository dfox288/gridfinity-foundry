"""Gridfinity Foundry server (plain Python, no dependencies): renders GridFlock baseplates with OpenSCAD, lists our bins,
keeps presets, builds print zips, and serves the web app.

  GET  /api/schema                     GridFlock's customizer parameters (OpenSCAD's own --export-format param)
  POST /api/plate      {params}        baseplate STL (all segments, laid out with GridFlock's gaps); cached by parameters
  GET  /api/catalog                    the bins, dividers and tab dividers that can be had (server/catalog.py), compact
  GET  /api/bins                       the labels and the uploaded bins (system "community")
  POST /api/uploads    STL bytes        upload a bin (headers X-Name, X-Creator, X-Filename, URL-encoded) -> its entry
  DELETE /api/uploads/<id>              remove an uploaded bin (its owner or an admin)
  GET  /api/me                         {auth, user, admin, admins}: whether sign-in is on, and who is calling (behind
                                       oauth2-proxy: a plain 401 when signed out)
  GET  /files/bins/<path>              one bin or part STL ("labels/..." for the labels); catalog files are rendered on the
                                       first request and cached (BINS_DIR may hold some of them ready-made)
  GET  /api/presets/<kind>             presets of a kind (plate, layout): [{name, updated}]
  GET|PUT|DELETE /api/presets/<kind>/<name>   (PUT over someone else's preset and DELETE: its owner or an admin)
  POST /api/zip        {name, bins: [{file, count}], parts: [{file, count}], labels: [{w, fit, text, count}], plate: {params} | null,
                        plates: [{params, label}]}
  GET  /api/printers                   Bambu printers (system profiles): [{id, model, nozzle, bed, extruders}]
  POST /api/bambu      {name, printer, bins: [{file, count, filament, color}], parts: [...], labels: [{w, fit, text, count, filament, color}],
                        plate: {params, filament, color} | null,
                        plates: [{params, filament, color, label}] (one per drawer), split}
                       a Bambu Studio project: parts packed on plates, a filament slot per colour (server/bambu3mf.py)
  everything else                      the web app (WEB_DIR, index.html for unknown paths)

Environment: GRIDFLOCK_DIR, BINS_DIR, DATA_DIR (presets), CACHE_DIR (plate STLs), WEB_DIR, OPENSCAD, PORT, RENDER_JOBS,
USER_HEADER, ADMINS.

Sign-in (2026-11-03): the server has no login of its own. With USER_HEADER set (e.g. X-Auth-Request-User,
filled by oauth2-proxy with the GitHub login in front of the write routes), every write needs that header, and uploads
and presets remember their owner: only the owner or one of ADMINS (comma-separated logins) may delete them or overwrite
a preset. Without USER_HEADER (a local install) everything is open as before.
"""
import hashlib, io, json, os, re, subprocess, tempfile, threading, time, zipfile

import bambu3mf
import bbl_profiles
import catalog
import uploads
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

GRIDFLOCK = Path(os.environ.get("GRIDFLOCK_DIR", "/opt/gridflock")).resolve()
BINS = Path(os.environ.get("BINS_DIR", "/bins")).resolve()
LABELS = Path(os.environ.get("LABELS_DIR", "/labels")).resolve()   # gridfinity-bins/out/labels-wip: labels and tab dividers
DATA = Path(os.environ.get("DATA_DIR", "/data")).resolve()
WEB = Path(os.environ.get("WEB_DIR", "/app/web")).resolve()
CACHE = Path(os.environ.get("CACHE_DIR", str(DATA / "cache"))).resolve()
GEN_SCAD = Path(os.environ.get("GENERATOR_SCAD", "/app/generator/scad")).resolve()   # flex_label.scad (engraved labels)
UPLOADS = Path(os.environ.get("UPLOADS_DIR", str(DATA / "uploads"))).resolve()   # bins uploaded by users (server/uploads.py)
OPENSCAD = os.environ.get("OPENSCAD", "openscad")
PORT = int(os.environ.get("PORT", "8080"))
USER_HEADER = os.environ.get("USER_HEADER", "").strip()
ADMINS = {a.strip().lower() for a in os.environ.get("ADMINS", "").split(",") if a.strip()}


class Forbidden(Exception):
    pass


def may_change(user, owner):
    """user may delete or overwrite something owned by owner (None: sign-in is off)"""
    return user is None or user.lower() in ADMINS or (owner or "").lower() == user.lower()
JOBS = threading.Semaphore(int(os.environ.get("RENDER_JOBS", str(os.cpu_count() or 2))))
CACHE_MAX = 400              # plate STLs kept in DATA/cache
KINDS = ("plate", "layout")
# print-bin-<system>_<kind>-<w>x<d>x<h>.stl, print-divider-<d>x<h>.stl (gridfinity-bins/scripts/gen_bins.py)
BIN_NAME = re.compile(r"print-bin-(?P<system>[a-z]+)_(?P<kind>[a-z]+)-(?P<w>[\d.]+)x(?P<d>[\d.]+)x(?P<h>\d+)\.stl$")

# our defaults where they differ from GridFlock's (the schema's `initial` shows these; renders always pass them)
APP_DEFAULTS = {"bed_size": [256.0, 256.0]}   # the author's Bambu P1S (2026-11-03)

_schema = None
_gridflock_initial = {}
_schema_lock = threading.Lock()


def openscad(args, cwd=GRIDFLOCK, timeout=600):
    with JOBS:
        r = subprocess.run([OPENSCAD, "--backend", "Manifold", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError(r.stderr[-2000:])
    return r


def schema():
    global _schema
    with _schema_lock:
        if _schema is None:
            with tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / "params.json"
                openscad(["--export-format", "param", "-o", str(out), "gridflock.scad"])
                params = json.loads(out.read_text())["parameters"]
                for p in params:
                    _gridflock_initial[p["name"]] = p["initial"]
                    if p["name"] in APP_DEFAULTS:
                        p["initial"] = APP_DEFAULTS[p["name"]]
                _schema = params
    return _schema


def scad_value(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(float(v)) if isinstance(v, float) else str(v)
    if isinstance(v, str):
        return json.dumps(v)   # a JSON string is a valid OpenSCAD string literal
    if isinstance(v, list):
        return "[" + ", ".join(scad_value(x) for x in v) + "]"
    raise ValueError(f"unsupported value {v!r}")


def plate_args(params):
    """-D arguments for the parameters that differ from GridFlock's defaults (unknown names are refused)"""
    known = {p["name"]: p for p in schema()}
    extra = {"_segment_gap"}   # internal, but useful
    args = []
    for name, v in sorted({**APP_DEFAULTS, **params}.items()):
        if name not in known and name not in extra:
            raise ValueError(f"unknown parameter {name}")
        if name in known and _gridflock_initial.get(name) == v:
            continue
        args += ["-D", f"{name}={scad_value(v)}"]
    return args


def render_plate(params):
    args = plate_args(params)
    key = hashlib.sha256(json.dumps(args).encode()).hexdigest()[:24]
    cache = CACHE
    cache.mkdir(parents=True, exist_ok=True)
    out = cache / f"{key}.stl"
    if out.exists():
        out.touch()
        return out, True
    tmp = cache / f"{key}.{threading.get_ident()}.tmp.stl"
    openscad(["--export-format", "binstl", *args, "-o", str(tmp), "gridflock.scad"])
    tmp.replace(out)
    files = sorted(cache.glob("*.stl"), key=lambda f: f.stat().st_mtime)
    for f in files[:-CACHE_MAX]:
        f.unlink(missing_ok=True)
    return out, False


# loose parts in gridfinity-bins/out/labels-wip (scripts/gen_bins.py names): category, then fields from the name
PART_NAMES = [
    (re.compile(r"print-divider-tab-(?P<d>[\d.]+)x(?P<h>\d+)\.stl$"), "Tab divider"),
    (re.compile(r"print-flex-label-(?P<w>[\d.]+)_fit(?P<fit>[\d.]+)\.stl$"), "Flex label"),
    (re.compile(r"print-flex-corner-(?P<w>[\d.]+)-(?P<side>left|right)_tab\.stl$"), "Corner label"),
    (re.compile(r"print-lip-plug-(?P<w>[\d.]+)_fit(?P<fit>[\d.]+)\.stl$"), "Lip plug (v1 bins)"),
    (re.compile(r"print-glue-label-(?P<w>[\d.]+)-(?P<side>left|right)\.stl$"), "Glue label (v1 bins)"),
]


def part_entry(rel, f):
    for rx, cat in PART_NAMES:
        if (m := rx.search(f.name)):
            e = {"file": rel, "type": "part", "category": cat, "bytes": f.stat().st_size}
            for k, v in m.groupdict().items():
                e[k] = v if k == "side" else float(v)
            return e
    return {"file": rel, "type": "part", "category": f.parent.name, "name": f.stem, "bytes": f.stat().st_size}


def render_label(w, fit, text):
    """a flex label for a bin w cells wide, pressing fit / 2 on each side wall, with `text` engraved; cached"""
    text = re.sub(r'["\\\x00-\x1f]', "", str(text)).strip()[:30]
    w, fit = float(w), float(fit)
    if not text or not 0.5 <= w <= 8 or not 0 <= fit <= 1:
        raise ValueError("bad label")
    # as large as fits with a margin: the label face is about 42 w - 8 mm wide, DejaVu Sans about 0.62 x the size per
    # character (0.7 here, for the margin)
    size = round(min(6.0, (42 * w - 14) / (0.7 * max(len(text), 1))), 2)
    args = ["-D", 'part="label"', "-D", f"cells_x={w:g}", "-D", f"fit={fit:g}", "-D", f"txt={json.dumps(text)}", "-D", f"txt_size={size}"]
    key = hashlib.sha256(json.dumps(["label", args]).encode()).hexdigest()[:24]
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"label-{key}.stl"
    if not out.exists():
        tmp = CACHE / f"label-{key}.{threading.get_ident()}.tmp.stl"
        openscad(["--export-format", "binstl", *args, "-o", str(tmp), "flex_label.scad"], cwd=GEN_SCAD)
        tmp.replace(out)
    return out, text


def bins():
    """the labels and the uploads; the bins and dividers are in the catalog (/api/catalog)"""
    out = []
    if LABELS.is_dir():
        for f in sorted(LABELS.rglob("*.stl")):
            if not f.name.startswith("print-divider-tab-"):   # catalog
                out.append(part_entry("labels/" + f.relative_to(LABELS).as_posix(), f))
    return out + uploads.entries(UPLOADS)


def safe_name(name):
    name = name.strip()
    if not re.fullmatch(r"[\w .+\-()äöüÄÖÜß]{1,80}", name) or name.startswith("."):
        raise ValueError("invalid preset name")
    return name


def preset_path(kind, name):
    if kind not in KINDS:
        raise ValueError("unknown preset kind")
    return DATA / "presets" / kind / f"{safe_name(name)}.json"


def list_presets(kind):
    if kind not in KINDS:
        raise ValueError("unknown preset kind")
    d = DATA / "presets" / kind
    if not d.is_dir():
        return []
    out = []
    for f in sorted(d.glob("*.json")):
        try:
            p = json.loads(f.read_text())
            out.append({"name": p.get("name", f.stem), "updated": p.get("updated", 0), "owner": p.get("owner", "")})
        except (OSError, ValueError):
            pass
    return sorted(out, key=lambda p: -p["updated"])


def bin_file(rel):
    """a library file: "labels/..." under LABELS, "uploads/..." under UPLOADS, everything else under BINS"""
    root, rest = ((LABELS, rel[len("labels/"):]) if rel.startswith("labels/")
                  else (UPLOADS, rel[len("uploads/"):]) if rel.startswith("uploads/") else (BINS, rel))
    f = (root / rest).resolve()
    if root in f.parents and f.is_file():
        return f
    if root is not UPLOADS and (f := catalog.path(rel, CACHE / "catalog", openscad)):
        return f
    raise ValueError(f"no such file {rel}")


def build_zip(req):
    buf = io.BytesIO()
    lines = [f"# {req.get('name') or 'Gridfinity layout'}", "", "| Count | File |", "|---|---|"]
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for folder in ("bins", "parts"):
            for b in req.get(folder, []):
                f = bin_file(b["file"])
                count = int(b.get("count", 1))
                z.write(f, f"{folder}/{count}x_{f.name}")
                lines.append(f"| {count} | {folder}/{count}x_{f.name} |")
        for lb in req.get("labels", []):
            f, text = render_label(lb["w"], lb.get("fit", 0), lb["text"])
            safe = re.sub(r"[^\w.-]+", "-", text).strip("-") or "label"
            name = f"labels/{int(lb.get('count', 1))}x_flex-label-{float(lb['w']):g}_{safe}.stl"
            z.write(f, name)
            lines.append(f"| {int(lb.get('count', 1))} | {name} |")
        for pl in ([req["plate"]] if req.get("plate") else []) + list(req.get("plates") or []):
            plate, _ = render_plate(pl.get("params", {}))
            label = re.sub(r"[^\w.-]+", "-", pl.get("label") or "").strip("-")
            name = f"baseplate-{label}.stl" if label else "baseplate.stl"
            z.write(plate, name)
            lines.append(f"| 1 | {name} (all pieces; split them in the slicer) |")
        z.writestr("README.md", "\n".join(lines) + "\n")
    return buf.getvalue()


def build_bambu(req):
    printer = req.get("printer") or "Bambu Lab P1S 0.6 nozzle"
    known = {p["id"]: p for p in bbl_profiles.printers()} if bbl_profiles.ROOT.is_dir() else {}
    bed = [float(v) for v in (known[printer]["bed"] if printer in known else req.get("bed") or [256, 256])]
    slots, groups, meshes = {}, {}, {}

    def group(filament, color, label):
        slot = slots.setdefault(filament, (len(slots) + 1, color or "#FFFFFF"))[0]
        return groups.setdefault((slot, label), {"label": label, "filament": filament, "slot": slot, "parts": []})

    def mesh(f):
        if f not in meshes:
            meshes[f] = bambu3mf.read_stl(f.read_bytes())
        return meshes[f]

    for b in req.get("bins", []):
        f = bin_file(b["file"])
        m = BIN_NAME.search(f.name)
        um = uploads.meta(UPLOADS, f.stem) if b["file"].startswith("uploads/") else None
        label = (f"{m['w']}x{m['d']}x{m['h']} {m['system']} {m['kind']}" if m
                 else f"{um['name']} ({um['creator']})" if um and um.get("creator") else um["name"] if um else f.stem)
        g = group(b.get("filament") or "PLA Basic · Jade White", b.get("color"), "bins")
        g["parts"] += [(label, *mesh(f))] * int(b.get("count", 1))
    for b in req.get("parts", []):
        f = bin_file(b["file"])
        g = group(b.get("filament") or "PLA Basic · Jade White", b.get("color"), "parts")
        g["parts"] += [(f.stem.replace("print-", ""), *mesh(f))] * int(b.get("count", 1))
    for lb in req.get("labels", []):
        f, text = render_label(lb["w"], lb.get("fit", 0), lb["text"])
        g = group(lb.get("filament") or "PLA Basic · Jade White", lb.get("color"), "labels")
        g["parts"] += [(f"label {text}", *bambu3mf.read_stl(f.read_bytes()))] * int(lb.get("count", 1))
    # one baseplate ("plate") or several, one per drawer ("plates", each with a label)
    for pl in ([req["plate"]] if req.get("plate") else []) + list(req.get("plates") or []):
        plate, _ = render_plate(pl.get("params", {}))
        pieces = bambu3mf.split_parts(*bambu3mf.read_stl(plate.read_bytes()))
        label = f"baseplate {pl['label']}" if pl.get("label") else "baseplate"
        g = group(pl.get("filament") or "PLA Basic · Gray", pl.get("color") or "#8E9089", label)
        g["parts"] += [(f"{label} piece {i + 1}", v, fc) for i, (v, fc) in enumerate(pieces)]
    if not groups:
        raise ValueError("nothing to export")
    # the material is the filament name's first part ("PLA Matte · Ash Gray" -> PLA Matte)
    fil = [(name.split(" · ")[0], color) for name, (slot, color) in sorted(slots.items(), key=lambda kv: kv[1][0])]
    tpl = bbl_profiles.template_for(printer)
    split = bool(req.get("split"))
    if split and not tpl:
        config = None   # no template: plain single-plate files that open with the slicer's own presets
    elif tpl:
        config = lambda fils: bbl_profiles.template_config(tpl, fils)   # noqa: E731
    elif printer in known:
        config = lambda fils: bbl_profiles.project_config(printer, fils)   # noqa: E731 (untested in Bambu Studio)
    else:
        config = None
    app = f"BambuStudio-{tpl['version']}" if tpl and tpl.get("version") else None
    return bambu3mf.build(req.get("name") or "Gridfinity", list(groups.values()), bed, config, split, fil, app)


class Handler(SimpleHTTPRequestHandler):
    server_version = "GridfinityFoundry/1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, fmt, *args):
        if os.environ.get("QUIET") != "1":
            super().log_message(fmt, *args)

    def end_headers(self):
        # the page itself is checked on every load (a new deploy shows at once); the hashed assets keep the default
        if self.command in ("GET", "HEAD") and not self.path.startswith(("/assets/", "/api/", "/files/")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, body, ctype, extra=None):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n < 2_000_000 else {}

    def user(self):
        """the signed-in user (from USER_HEADER), or None when sign-in is off"""
        if not USER_HEADER:
            return None
        return re.sub(r"[^\w.@-]", "", self.headers.get(USER_HEADER) or "")[:80]

    def route(self, method):
        path = unquote(urlparse(self.path).path)
        try:
            user = self.user()
            write = method in ("PUT", "DELETE") or (method == "POST" and path == "/api/uploads")
            if write and user == "":
                return self.send_json({"error": "sign in to save or upload"}, 401)
            if path == "/api/me" and method == "GET":
                return self.send_json({"auth": bool(USER_HEADER), "user": user or None,
                                       "admin": bool(user) and user.lower() in ADMINS, "admins": sorted(ADMINS)})
            if path == "/api/schema" and method == "GET":
                return self.send_json(schema())
            if path == "/api/plate" and method == "POST":
                t = time.time()
                f, hit = render_plate(self.body().get("params", {}))
                return self.send_bytes(f.read_bytes(), "model/stl",
                                       {"X-Cache": "hit" if hit else "miss", "X-Render-Ms": str(int((time.time() - t) * 1000))})
            if path == "/api/printers" and method == "GET":
                ps = bbl_profiles.printers() if bbl_profiles.ROOT.is_dir() else []
                return self.send_json([{**p, "template": (bbl_profiles.TEMPLATES / f"{p['id']}.json").is_file()} for p in ps])
            if path == "/api/catalog" and method == "GET":
                return self.send_json(catalog.catalog())
            if path == "/api/bins" and method == "GET":
                return self.send_json(bins())
            if path == "/api/uploads" and method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                if n > uploads.MAX_BYTES:
                    return self.send_json({"error": "file too large (max 60 MB)"}, 413)
                data = self.rfile.read(n)
                h = lambda k: unquote(self.headers.get(k) or "")   # noqa: E731
                meta = uploads.save(UPLOADS, data, h("X-Name"), h("X-Creator") or user or "", h("X-Filename"), owner=user or "")
                return self.send_json(next(e for e in uploads.entries(UPLOADS) if e["file"] == f"uploads/{meta['id']}.stl"))
            if (m := re.fullmatch(r"/api/uploads/([0-9a-f]{12})", path)) and method == "DELETE":
                meta = uploads.meta(UPLOADS, m[1])
                if meta and not may_change(user, meta.get("owner")):
                    raise Forbidden("only its owner can delete this bin")
                uploads.delete(UPLOADS, m[1])
                return self.send_json({"ok": True})
            if path.startswith("/files/bins/") and method == "GET":
                try:
                    f = bin_file(path[len("/files/bins/"):])
                except ValueError:
                    return self.send_json({"error": "not found"}, 404)
                return self.send_bytes(f.read_bytes(), "model/stl", {"Cache-Control": "max-age=300"})
            m = re.fullmatch(r"/api/presets/(\w+)(?:/(.+))?", path)
            if m:
                kind, name = m[1], m[2]
                if name is None and method == "GET":
                    return self.send_json(list_presets(kind))
                f = preset_path(kind, name)
                if method == "GET":
                    return self.send_json(json.loads(f.read_text())) if f.exists() else self.send_json({"error": "not found"}, 404)
                old = json.loads(f.read_text()) if f.exists() and method in ("PUT", "DELETE") else None
                if old and not may_change(user, old.get("owner")):
                    raise Forbidden(f"“{old.get('name', name)}” belongs to {old.get('owner')}; save it under another name")
                if method == "PUT":
                    f.parent.mkdir(parents=True, exist_ok=True)
                    tmp = f.with_suffix(".tmp")
                    owner = (old or {}).get("owner") or user or ""
                    tmp.write_text(json.dumps({"name": safe_name(name), "owner": owner, "updated": int(time.time() * 1000),
                                               "data": self.body().get("data")}, indent=1))
                    tmp.replace(f)
                    return self.send_json({"ok": True})
                if method == "DELETE":
                    f.unlink(missing_ok=True)
                    return self.send_json({"ok": True})
            if path == "/api/zip" and method == "POST":
                req = self.body()
                name = re.sub(r"[^\w.-]+", "-", req.get("name") or "layout").strip("-") or "layout"
                return self.send_bytes(build_zip(req), "application/zip",
                                       {"Content-Disposition": f'attachment; filename="{name}.zip"'})
            if path == "/api/bambu" and method == "POST":
                req = self.body()
                name = re.sub(r"[^\w.-]+", "-", req.get("name") or "gridfinity").strip("-") or "gridfinity"
                data, plates = build_bambu(req)
                ext, ctype = ("zip", "application/zip") if req.get("split") else ("3mf", "model/3mf")
                return self.send_bytes(data, ctype, {"Content-Disposition": f'attachment; filename="{name}.{ext}"', "X-Plates": str(plates)})
            if path.startswith("/api/"):
                return self.send_json({"error": "not found"}, 404)
            if method != "GET":
                return self.send_json({"error": "method not allowed"}, 405)
            # the web app; unknown paths get index.html (client-side routes)
            if not (WEB / path.lstrip("/")).is_file():
                self.path = "/index.html"
            return super().do_GET()
        except Forbidden as e:
            return self.send_json({"error": str(e)}, 403)
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        except RuntimeError as e:
            return self.send_json({"error": "OpenSCAD failed", "detail": str(e)}, 500)

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")


def main():
    threading.Thread(target=schema, daemon=True).start()   # warm the schema
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Gridfinity Foundry on :{PORT} (GridFlock {GRIDFLOCK}, bins {BINS}, data {DATA})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
