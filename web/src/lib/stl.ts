import * as THREE from "three";

// Binary STL -> triangle positions (x, y, z per vertex, 9 floats per triangle)
export function parseStl(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(256, buffer.byteLength)));
  const n = view.getUint32(80, true);
  if (head.startsWith("solid") && 84 + n * 50 !== buffer.byteLength) return parseAscii(new TextDecoder().decode(buffer));
  const pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) pos[i * 9 + k] = view.getFloat32(o + k * 4, true);
  }
  return pos;
}

function parseAscii(text: string): Float32Array {
  const out: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(+m[1], +m[2], +m[3]);
  return new Float32Array(out);
}

export function geometry(pos: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

export interface Segment {
  pos: Float32Array;
  min: THREE.Vector3;
  max: THREE.Vector3;
  col: number;
  row: number;
  index: number;
}

// Split a mesh into its connected parts (the plate segments GridFlock lays out side by side)
export function splitParts(pos: Float32Array): Segment[] {
  const tris = pos.length / 9;
  const parent = new Int32Array(tris);
  for (let i = 0; i < tris; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const owner = new Map<string, number>();
  for (let t = 0; t < tris; t++) {
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      const key = `${Math.round(pos[o] * 500)},${Math.round(pos[o + 1] * 500)},${Math.round(pos[o + 2] * 500)}`;
      const other = owner.get(key);
      if (other === undefined) owner.set(key, t);
      else {
        const a = find(t), b = find(other);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(t);
  }
  const segs: Segment[] = [];
  for (const g of groups.values()) {
    const p = new Float32Array(g.length * 9);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    g.forEach((t, i) => {
      for (let k = 0; k < 9; k++) {
        const v = (p[i * 9 + k] = pos[t * 9 + k]), a = k % 3;
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
      }
    });
    // GridFlock leaves a few slivers (0.3 x 0.04 mm) at segment edges: not pieces
    if (hi[0] - lo[0] < 1 || hi[1] - lo[1] < 1) continue;
    segs.push({ pos: p, min: new THREE.Vector3(...lo), max: new THREE.Vector3(...hi), col: 0, row: 0, index: 0 });
  }
  // columns: parts whose x ranges overlap; rows: their order in y within a column
  segs.sort((a, b) => a.min.x - b.min.x);
  let col = -1, colMax = -Infinity;
  for (const s of segs) {
    if (s.min.x > colMax - 1) {
      col++;
      colMax = s.max.x;
    } else colMax = Math.max(colMax, s.max.x);
    s.col = col;
  }
  for (let c = 0; c <= col; c++) {
    segs.filter((s) => s.col === c).sort((a, b) => a.min.y - b.min.y).forEach((s, i) => (s.row = i));
  }
  segs.sort((a, b) => a.col - b.col || a.row - b.row).forEach((s, i) => (s.index = i));
  return segs;
}

// The STL of some parts, for downloading one segment
export function toStl(parts: Float32Array[]): Blob {
  const n = parts.reduce((a, p) => a + p.length / 9, 0);
  const buf = new ArrayBuffer(84 + n * 50);
  const view = new DataView(buf);
  view.setUint32(80, n, true);
  let o = 84;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const p of parts) {
    for (let t = 0; t < p.length; t += 9) {
      a.fromArray(p, t); b.fromArray(p, t + 3); c.fromArray(p, t + 6);
      const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      [nrm.x, nrm.y, nrm.z].forEach((v, i) => view.setFloat32(o + i * 4, v, true));
      for (let k = 0; k < 9; k++) view.setFloat32(o + 12 + k * 4, p[t + k], true);
      o += 50;
    }
  }
  return new Blob([buf], { type: "model/stl" });
}
