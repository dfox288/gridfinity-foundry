"""Bambu Studio project 3MF: the parts packed onto build plates, one filament slot per colour.

The file is what Bambu Studio itself writes (src/libslic3r/Format/bbs_3mf.cpp), cut down: 3D/3dmodel.model marked
"Application: BambuStudio-..." (so it opens as a project with its plates), one object file per mesh under 3D/Objects/,
Metadata/model_settings.config with each object's filament ("extruder") and the plates, and
Metadata/project_settings.config from the chosen printer's system presets (server/bbl_profiles.py). Without that config
Bambu Studio loads the geometry only and drops the plates (Plater.cpp: plates load only together with the config;
2026-11-03: "i only get one plate"). The filament each slot stands for is also in the plate and object names.

Plates are laid out as Bambu Studio does (PartPlate.cpp): plate i at column i % cols, row i // cols, with
cols = ceil-ish sqrt(count) and a stride of 1.2 x the bed.
"""
import io, json, math, re, struct, uuid, zipfile
from xml.sax.saxutils import escape, quoteattr

APP = "BambuStudio-02.08.02.61"   # the release the bundled system profiles come from (Dockerfile)
GAP = 1 / 5          # LOGICAL_PART_PLATE_GAP
SPACING = 4.0        # between parts on a plate
MARGIN = 1.0         # to the bed edge

NS = ('xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
      'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" '
      'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"')
CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
</Types>
"""
REL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"


def read_stl(data: bytes):
    """binary (or ASCII) STL -> (vertices [(x, y, z)], triangles [(a, b, c)]) with shared vertices"""
    tris = []
    n = struct.unpack_from("<I", data, 80)[0] if len(data) >= 84 else 0
    if data[:5] == b"solid" and 84 + 50 * n != len(data):
        v = [tuple(map(float, m)) for m in re.findall(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)", data)]
        tris = [v[i:i + 3] for i in range(0, len(v) - 2, 3)]
    else:
        for i in range(n):
            f = struct.unpack_from("<12f", data, 84 + 50 * i)
            tris.append((f[3:6], f[6:9], f[9:12]))
    index, verts, faces = {}, [], []
    for t in tris:
        face = []
        for p in t:
            k = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
            if k not in index:
                index[k] = len(verts)
                verts.append(k)
            face.append(index[k])
        if face[0] != face[1] and face[1] != face[2] and face[0] != face[2]:
            faces.append(tuple(face))
    return verts, faces


def split_parts(verts, faces, min_size=1.0):
    """connected parts of a mesh (the plate pieces), each (verts, faces); slivers under min_size mm dropped"""
    parent = list(range(len(verts)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b, c in faces:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = ra
    groups = {}
    for f in faces:
        groups.setdefault(find(f[0]), []).append(f)
    parts = []
    for fs in groups.values():
        remap, vs = {}, []
        out = []
        for f in fs:
            nf = []
            for i in f:
                if i not in remap:
                    remap[i] = len(vs)
                    vs.append(verts[i])
                nf.append(remap[i])
            out.append(tuple(nf))
        xs, ys = [v[0] for v in vs], [v[1] for v in vs]
        if max(xs) - min(xs) >= min_size and max(ys) - min(ys) >= min_size:
            parts.append((vs, out))
    parts.sort(key=lambda p: (min(v[0] for v in p[0]), min(v[1] for v in p[0])))
    return parts


def bounds(verts):
    return [min(v[i] for v in verts) for i in range(3)], [max(v[i] for v in verts) for i in range(3)]


def pack(items, bed):
    """items: [(key, w, d)] in placement order -> plates [[(key, x, y, rotated)]] (x, y: the part's min corner on the
    bed). Shelf packing per plate; a part turns by 90 deg when only that way fits."""
    W, D = bed[0] - 2 * MARGIN, bed[1] - 2 * MARGIN
    plates, cur = [], None

    def new_plate():
        return {"items": [], "x": 0.0, "y": 0.0, "row": 0.0}

    def try_place(p, w, d):
        # in the current shelf, else a new shelf above it
        if p["x"] + w <= W + 1e-6 and p["y"] + d <= D + 1e-6:
            return p["x"], p["y"], False
        y2 = p["y"] + p["row"] + SPACING
        if w <= W + 1e-6 and y2 + d <= D + 1e-6:
            return 0.0, y2, True
        return None

    for key, w, d in items:
        placed = False
        while not placed:
            if cur is None:
                cur = new_plate()
                plates.append(cur)
            for rot, (ww, dd) in ((False, (w, d)), (True, (d, w))):
                r = try_place(cur, ww, dd)
                if r is None:
                    continue
                x, y, newrow = r
                if newrow:
                    cur["y"], cur["row"] = y, 0.0
                cur["items"].append((key, MARGIN + x, MARGIN + y, rot, ww, dd))
                cur["x"] = x + ww + SPACING
                cur["row"] = max(cur["row"], dd)
                placed = True
                break
            if not placed:
                if not cur["items"]:   # too big for an empty plate: put it there anyway, centred
                    cur["items"].append((key, (bed[0] - w) / 2, (bed[1] - d) / 2, False, w, d))
                    cur = None
                    placed = True
                else:
                    cur = None
    return [p["items"] for p in plates]


def cols_for(count):
    v = math.sqrt(count)
    r = round(v)
    return r + 1 if v > r else r


def plan(groups, bed):
    """groups: [{"label", "filament", "slot", "parts": [(part_name, verts, faces)]}]; slot = the filament number (1-based).
    Each group goes on its own plates. Returns (meshes {key: (name, slot, verts, faces)}, plates [(name, [(key, m)])])."""
    meshes, plates = {}, []
    for g in groups:
        slot = g["slot"]
        items = []
        for part_name, verts, faces in g["parts"]:
            key = (id(verts), slot)
            meshes.setdefault(key, (part_name, slot, verts, faces))
            lo, hi = bounds(verts)
            items.append(((key, lo), hi[0] - lo[0], hi[1] - lo[1]))
        items.sort(key=lambda it: -(it[1] * it[2]))
        for p_i, plate in enumerate(pack(items, bed)):
            entries = []
            for (key, lo), x, y, rot, ww, dd in plate:
                # transform: mesh min corner to (x, y, 0) on the plate, turned by 90 deg if `rot`
                if rot:   # x' = -y, y' = x: the min corner (lo.x, hi.y) goes to (x, y)
                    m = (0, 1, 0, -1, 0, 0, 0, 0, 1, x + lo[1] + ww, y - lo[0], -lo[2])
                else:
                    m = (1, 0, 0, 0, 1, 0, 0, 0, 1, x - lo[0], y - lo[1], -lo[2])
                entries.append((key, m))
            plates.append((f"F{slot} {g['filament']} · {g['label']}" + (f" ({p_i + 1})" if p_i else ""), entries))
    return meshes, plates


def build(name, groups, bed, config=None, split=False, filaments=(), app=None):
    """the project (3MF bytes, plate count); with `split` a zip with one single-plate 3MF per plate instead.
    config: None, or a function [(material, colour)] -> project_settings for those filaments (slot order)"""
    meshes, plates = plan(groups, bed)
    if not split:
        return write(name, meshes, plates, bed, config(list(filaments)) if config else None, app), len(plates)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for i, plate in enumerate(plates):
            safe = re.sub(r"[^A-Za-z0-9]+", "-", plate[0].replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")).strip("-")
            # one colour per plate: everything on filament 1
            slot = meshes[plate[1][0][0]][1] if plate[1] else 1
            single = {k: (v[0], 1, v[2], v[3]) for k, v in meshes.items()}
            cfg = config([filaments[slot - 1]]) if config and filaments else None
            z.writestr(f"plate-{i + 1:02d}_{safe}.3mf", write(f"{name} {i + 1}", single, [plate], bed, cfg, app))
    return buf.getvalue(), len(plates)


def write(name, meshes, plates, bed, config, app=None):
    used = list(dict.fromkeys(key for _, entries in plates for key, _ in entries))
    sub_of = {key: i + 1 for i, key in enumerate(used)}
    n = len(used)
    cols = cols_for(len(plates))
    stride = (bed[0] * (1 + GAP), bed[1] * (1 + GAP))
    instances = {}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", rels(["/3D/3dmodel.model"]))
        z.writestr("3D/_rels/3dmodel.model.rels", rels([f"/3D/Objects/object_{sub_of[k]}.model" for k in used]))
        res, build_items, settings_objs, settings_plates = [], [], [], []
        for key in used:
            sub, main = sub_of[key], n + sub_of[key]
            pname, slot, verts, faces = meshes[key]
            z.writestr(f"3D/Objects/object_{sub}.model", object_model(sub, verts, faces))
            res.append(f'  <object id="{main}" p:UUID="{uuid.uuid4()}" type="model">\n   <components>\n'
                       f'    <component p:path="/3D/Objects/object_{sub}.model" objectid="{sub}" p:UUID="{uuid.uuid4()}" '
                       f'transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n   </components>\n  </object>')
            settings_objs.append(
                f'  <object id="{main}">\n    <metadata key="name" value={quoteattr(pname)}/>\n'
                f'    <metadata key="extruder" value="{slot}"/>\n    <metadata face_count="{len(faces)}"/>\n'
                f'    <part id="{sub}" subtype="normal_part">\n      <metadata key="name" value={quoteattr(pname)}/>\n'
                f'      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n    </part>\n  </object>')
        identify = 0
        for i, (pname, entries) in enumerate(plates):
            ox, oy = (i % cols) * stride[0], -(i // cols) * stride[1]
            inst_xml = []
            for key, m in entries:
                main = n + sub_of[key]
                inst = instances.get(main, 0)
                instances[main] = inst + 1
                identify += 1
                t = list(m)
                t[9] += ox
                t[10] += oy
                build_items.append(f'  <item objectid="{main}" p:UUID="{uuid.uuid4()}" transform="{" ".join(fmt(v) for v in t)}" printable="1"/>')
                inst_xml.append(f'    <model_instance>\n      <metadata key="object_id" value="{main}"/>\n'
                                f'      <metadata key="instance_id" value="{inst}"/>\n      <metadata key="identify_id" value="{identify}"/>\n    </model_instance>')
            settings_plates.append(f'  <plate>\n    <metadata key="plater_id" value="{i + 1}"/>\n'
                                   f'    <metadata key="plater_name" value={quoteattr(pname)}/>\n    <metadata key="locked" value="false"/>\n'
                                   + "\n".join(inst_xml) + "\n  </plate>")
        z.writestr("3D/3dmodel.model",
                   f'<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" {NS}>\n'
                   f' <metadata name="Application">{app or APP}</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n'
                   f' <metadata name="Title">{escape(name)}</metadata>\n <metadata name="Designer">Gridfinity Foundry</metadata>\n'
                   f' <resources>\n' + "\n".join(res) + f'\n </resources>\n <build p:UUID="{uuid.uuid4()}">\n'
                   + "\n".join(build_items) + "\n </build>\n</model>\n")
        if config:
            z.writestr("Metadata/project_settings.config", json.dumps(config, indent=4))
        z.writestr("Metadata/model_settings.config",
                   '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + "\n".join(settings_objs) + "\n"
                   + "\n".join(settings_plates) + "\n</config>\n")
    return buf.getvalue()


def fmt(v):
    return f"{v:.6g}" if isinstance(v, float) else str(v)


def rels(targets):
    body = "".join(f' <Relationship Target="{t}" Id="rel-{i + 1}" Type="{REL}"/>\n' for i, t in enumerate(targets))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
            + body + "</Relationships>\n")


def object_model(sub, verts, faces):
    out = [f'<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" {NS}>\n'
           f' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n'
           f'  <object id="{sub}" p:UUID="{uuid.uuid4()}" type="model">\n   <mesh>\n    <vertices>\n']
    out += [f'     <vertex x="{x:g}" y="{y:g}" z="{z:g}"/>\n' for x, y, z in verts]
    out.append("    </vertices>\n    <triangles>\n")
    out += [f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>\n' for a, b, c in faces]
    out.append("    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build/>\n</model>\n")
    return "".join(out)
