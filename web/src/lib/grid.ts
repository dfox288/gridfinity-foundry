import type { ParamValue } from "../api";

export const PITCH = 42;

// GridFlock's cell layout along one axis (gridflock.scad compute_global_trace): whole cells from the west/south, then
// filler cells (integer fraction) or one dynamic cell at the east/north end. Sizes in cells.
export function trace(lengthMm: number, filler: number, fraction: number, minimumMm: number): number[] {
  const len = lengthMm / PITCH;
  if (filler === 0) return Array(Math.max(0, Math.floor(len))).fill(1);
  if (filler === 1) {
    const scaled = Math.floor(len * fraction);
    const whole = Math.floor(scaled / fraction);
    return [...Array(whole).fill(1), ...Array(scaled - whole * fraction).fill(1 / fraction)];
  }
  const dyn = len % 1, expand = dyn < minimumMm / PITCH, total = Math.floor(len) + (expand ? 0 : 1);
  return [...Array(Math.max(0, total - 1)).fill(1), dyn + (expand ? 1 : 0)];
}

export interface Grid {
  size: [number, number];      // plate_size, mm
  traceX: number[];
  traceY: number[];
  origin: [number, number];    // the grid's south-west corner from the plate_size rectangle's south-west corner, mm
  cellsX: number;              // usable length in cells (whole + half fillers; a dynamic filler cell is not usable)
  cellsY: number;
}

const num = (v: ParamValue | undefined, i: number, d: number) => (Array.isArray(v) ? v[i] ?? d : typeof v === "number" ? v : d);

export function grid(p: (name: string) => ParamValue | undefined): Grid {
  const size: [number, number] = [num(p("plate_size"), 0, 371), num(p("plate_size"), 1, 254)];
  const fx = num(p("filler_x"), 0, 1), fy = num(p("filler_y"), 0, 1);
  const tx = trace(size[0], fx, num(p("filler_fraction"), 0, 2), num(p("filler_minimum_size"), 0, 15));
  const ty = trace(size[1], fy, num(p("filler_fraction"), 1, 2), num(p("filler_minimum_size"), 1, 15));
  const sum = (t: number[]) => t.reduce((a, b) => a + b, 0);
  const align = [num(p("alignment"), 0, 0.5), num(p("alignment"), 1, 0.5)];
  const pad = [size[0] - sum(tx) * PITCH, size[1] - sum(ty) * PITCH];
  const usable = (t: number[], f: number) => (f === 2 ? Math.floor(sum(t) + 1e-9) : sum(t));
  return {
    size,
    traceX: tx,
    traceY: ty,
    origin: [pad[0] * align[0], pad[1] * align[1]],
    cellsX: Math.floor(usable(tx, fx) * 2 + 1e-9) / 2,
    cellsY: Math.floor(usable(ty, fy) * 2 + 1e-9) / 2,
  };
}
