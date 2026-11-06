// Where bins may go on a drawer's grid: footprints, the collision test and snapping a pointer position to the grid.
// Positions are in cells from the grid's south-west corner (half steps); a bin with whole-cell feet sits on whole cells.
import type { BinFile } from "../api";
import type { Placed } from "../store";
import { PITCH, type Grid } from "./grid";

export type Cand = { file: string; x: number; y: number; rot: 0 | 1 };
type Cells = Pick<Grid, "cellsX" | "cellsY">;
type Size = Pick<BinFile, "w" | "d">;

// footprint [w, d] in cells as placed
export const fp = (b: Size, rot: 0 | 1) => (rot ? [b.d, b.w] : [b.w, b.d]);
export const whole = (b: Size) => Number.isInteger(b.w) && Number.isInteger(b.d);

// does candidate c fit: inside the grid, on whole cells if it must be, overlapping no other bin (but `ignore`)
export function fits(c: Cand, info: Size, g: Cells, bins: Placed[], lib: Map<string, Size>, ignore?: string) {
  const [w, d] = fp(info, c.rot);
  const e = 1e-6;
  if (c.x < -e || c.y < -e || c.x + w > g.cellsX + e || c.y + d > g.cellsY + e) return false;
  if (whole(info) && (!Number.isInteger(c.x) || !Number.isInteger(c.y))) return false;   // full-pitch feet sit on whole cells
  for (const o of bins) {
    if (o.id === ignore) continue;
    const oi = lib.get(o.file);
    if (!oi) continue;
    const [ow, od] = fp(oi, o.rot);
    if (c.x < o.x + ow - e && o.x < c.x + w - e && c.y < o.y + od - e && o.y < c.y + d - e) return false;
  }
  return true;
}

// the grid position for a bin centred under the pointer (px, py in mm), kept inside the grid
export function snap(px: number, py: number, info: Size, rot: 0 | 1, g: Cells): [number, number] {
  const [w, d] = fp(info, rot);
  const step = whole(info) ? 1 : 2;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  return [
    clamp(Math.round((px / PITCH - w / 2) * step) / step, Math.floor((g.cellsX - w) * step) / step),
    clamp(Math.round((py / PITCH - d / 2) * step) / step, Math.floor((g.cellsY - d) * step) / step),
  ];
}

// where a copy of bin b goes: right beside it (right, behind, left, in front), else the first free spot from the
// front left; null if there is none
export function copySpot(b: Placed, info: Size, g: Cells, bins: Placed[], lib: Map<string, Size>): Cand | null {
  const [w, d] = fp(info, b.rot);
  const at = (x: number, y: number): Cand => ({ file: b.file, x, y, rot: b.rot });
  for (const [dx, dy] of [[w, 0], [0, d], [-w, 0], [0, -d]]) if (fits(at(b.x + dx, b.y + dy), info, g, bins, lib)) return at(b.x + dx, b.y + dy);
  const st = whole(info) ? 1 : 0.5;
  for (let y = 0; y <= g.cellsY; y += st) for (let x = 0; x <= g.cellsX; x += st) if (fits(at(x, y), info, g, bins, lib)) return at(x, y);
  return null;
}
