// Fill the free cells of a drawer: scan the grid from the south-west corner in half-cell steps and put the biggest bin
// (one that fits inside a size limit, either way round) that fits at each free spot. Whole-cell bins only on whole cells, as when placing by hand.
import type { BinFile } from "../api";

export interface FillBin {
  file: string;
  x: number;
  y: number;
  rot: 0 | 1;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

const E = 1e-6;
const whole = (b: BinFile) => Number.isInteger(b.w) && Number.isInteger(b.d);

export function fill(cellsX: number, cellsY: number, taken: Rect[], candidates: BinFile[], max: [number, number] = [Infinity, Infinity]): FillBin[] {
  const out: FillBin[] = [];
  const rects = [...taken];
  // biggest first; among equals the squarer one (a 2x2 before a 4x1)
  const cands = candidates
    .filter((b) => (b.w <= max[0] + E && b.d <= max[1] + E) || (b.w <= max[1] + E && b.d <= max[0] + E))
    .sort((a, b) => b.w * b.d - a.w * a.d || Math.abs(a.w - a.d) - Math.abs(b.w - b.d));
  if (!cands.length) return out;
  const free = (r: Rect) => {
    if (r.x < -E || r.y < -E || r.x + r.w > cellsX + E || r.y + r.d > cellsY + E) return false;
    return !rects.some((o) => r.x < o.x + o.w - E && o.x < r.x + r.w - E && r.y < o.y + o.d - E && o.y < r.y + r.d - E);
  };
  for (let y = 0; y < cellsY - E; y += 0.5)
    for (let x = 0; x < cellsX - E; x += 0.5) {
      if (!free({ x, y, w: 0.5, d: 0.5 })) continue;
      for (const b of cands) {
        if (whole(b) && (!Number.isInteger(x) || !Number.isInteger(y))) continue;
        // the orientation that keeps the long side along the drawer's width first
        const rots: (0 | 1)[] = b.w === b.d ? [0] : [0, 1];
        const hit = rots.find((rot) => free({ x, y, w: rot ? b.d : b.w, d: rot ? b.w : b.d }));
        if (hit === undefined) continue;
        const r = { x, y, w: hit ? b.d : b.w, d: hit ? b.w : b.d };
        rects.push(r);
        out.push({ file: b.file, x, y, rot: hit });
        break;
      }
    }
  return out;
}
