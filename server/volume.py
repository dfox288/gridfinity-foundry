"""Volume (mm^3) and height (mm) of an STL mesh: the filament estimate in the print list, the drawer height check.

The signed volume of a closed mesh: the sum over its triangles of the tetrahedra they span with the origin. Pure Python
(no numpy in the image); cached by path, size and modification time, so each file is measured once.
"""
import re, struct, threading
from pathlib import Path

_cache: dict[tuple[str, int, int], tuple[float, float]] = {}
_lock = threading.Lock()
_VERTEX = re.compile(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)")


def _binary(data: bytes) -> tuple[float, float]:
    n = struct.unpack_from("<I", data, 80)[0]
    total, lo, hi = 0.0, float("inf"), float("-inf")
    for t in struct.iter_unpack("<12x9f2x", data[84:84 + n * 50]):
        ax, ay, az, bx, by, bz, cx, cy, cz = t
        total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
        lo = min(lo, az, bz, cz)
        hi = max(hi, az, bz, cz)
    return total / 6, (hi - lo if n else 0.0)


def _ascii(data: bytes) -> tuple[float, float]:
    v = [tuple(map(float, m.groups())) for m in _VERTEX.finditer(data)]
    total = 0.0
    zs = [p[2] for p in v]
    for i in range(0, len(v) - 2, 3):
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = v[i], v[i + 1], v[i + 2]
        total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    return total / 6, (max(zs) - min(zs) if zs else 0.0)


def measure(data: bytes) -> tuple[float, float]:
    """(volume mm^3, height mm)"""
    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + n * 50 == len(data):
            v, h = _binary(data)
            return abs(v), h
    v, h = _ascii(data)
    return abs(v), h


def of_bytes(data: bytes) -> float:
    return measure(data)[0]


def of_file(path: Path) -> float:
    return measure_file(path)[0]


def measure_file(path: Path) -> tuple[float, float]:
    st = path.stat()
    key = (str(path), st.st_size, st.st_mtime_ns)
    with _lock:
        if key in _cache:
            return _cache[key]
    v = measure(path.read_bytes())
    with _lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[key] = v
    return v


if __name__ == "__main__":
    import sys
    for a in sys.argv[1:]:
        v, h = measure_file(Path(a))
        print(f"{v / 1000:.2f} cm3  {h:.2f} mm  {a}")
