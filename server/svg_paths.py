"""GridFlock's puzzle.svg -> paths/puzzle.scad, as its extract_paths.py does with svgelements, in plain Python: every
<path> with an id becomes `svg_path_puzzle_svg_<id> = [[x, y], ...];` in user units after the viewBox scale (the
paths use only M/m, L/l, V/v, H/h, Z and degenerate C/c)."""
import re, sys, xml.etree.ElementTree as ET


def points(d):
    tok = re.findall(r"[MmLlHhVvCcZz]|-?[\d.]+(?:e-?\d+)?", d)
    pts, x, y, cmd, i = [], 0.0, 0.0, None, 0
    while i < len(tok):
        if tok[i].isalpha():
            cmd = tok[i]; i += 1
            if cmd in "Zz":
                continue
        n = lambda k: float(tok[i + k])
        if cmd in "Mm" or cmd in "Ll":
            dx, dy = n(0), n(1); i += 2
            x, y = (x + dx, y + dy) if cmd.islower() and pts else (dx, dy) if cmd.isupper() else (x + dx, y + dy)
            if cmd == "m": cmd = "l"
            if cmd == "M": cmd = "L"
        elif cmd in "Hh":
            x = n(0) + (x if cmd == "h" else 0); i += 1
        elif cmd in "Vv":
            y = n(0) + (y if cmd == "v" else 0); i += 1
        elif cmd in "Cc":
            ex, ey = n(4), n(5); i += 6
            x, y = (x + ex, y + ey) if cmd == "c" else (ex, ey)
        else:
            raise ValueError(cmd)
        pts.append((x, y))
    return pts


def main(src, dst):
    root = ET.parse(src).getroot()
    vb = [float(v) for v in root.get("viewBox").split()]
    sx, sy = float(root.get("width")) / vb[2], float(root.get("height")) / vb[3]
    name = src.split("/")[-1].replace(".", "_")
    out = []
    for p in root.iter("{http://www.w3.org/2000/svg}path"):
        pts = points(p.get("d"))
        out.append(f"svg_path_{name}_{p.get('id')} = [" + ",".join(f"[{(x - vb[0]) * sx}, {(y - vb[1]) * sy}]" for x, y in pts) + "];\n")
    open(dst, "w").write("".join(out))


if __name__ == "__main__":
    main(*sys.argv[1:3])
