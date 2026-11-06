"""Volume of an STL mesh (mm^3), for the filament estimate in the print list.

The signed volume of a closed mesh: the sum over its triangles of the tetrahedra they span with the origin. Pure Python
(no numpy in the image); cached by path, size and modification time, so each file is measured once.
"""
import re, struct, threading
from pathlib import Path

_cache: dict[tuple[str, int, int], float] = {}
_lock = threading.Lock()
_VERTEX = re.compile(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)")


def _binary(data: bytes) -> float:
    n = struct.unpack_from("<I", data, 80)[0]
    total = 0.0
    for t in struct.iter_unpack("<12x9f2x", data[84:84 + n * 50]):
        ax, ay, az, bx, by, bz, cx, cy, cz = t
        total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    return total / 6


def _ascii(data: bytes) -> float:
    v = [tuple(map(float, m.groups())) for m in _VERTEX.finditer(data)]
    total = 0.0
    for i in range(0, len(v) - 2, 3):
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = v[i], v[i + 1], v[i + 2]
        total += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
    return total / 6


def of_bytes(data: bytes) -> float:
    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + n * 50 == len(data):
            return abs(_binary(data))
    return abs(_ascii(data))


def of_file(path: Path) -> float:
    st = path.stat()
    key = (str(path), st.st_size, st.st_mtime_ns)
    with _lock:
        if key in _cache:
            return _cache[key]
    v = of_bytes(path.read_bytes())
    with _lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[key] = v
    return v


if __name__ == "__main__":
    import sys
    for a in sys.argv[1:]:
        print(f"{of_file(Path(a)) / 1000:.2f} cm3  {a}")
