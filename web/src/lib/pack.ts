// Packing a list of bins into a drawer: the longest and biggest first, each at the first free spot scanning from the
// front left (rows front to back), turned if only that fits; whole-cell bins on whole cells. What does not fit is
// handed back, for the next drawer.

export interface Footprint {
  w: number;   // cells, long side first
  d: number;
}

export interface Packed {
  index: number;   // into the list given
  x: number;
  y: number;
  rot: 0 | 1;
}

const E = 1e-6;
type Rect = { x: number; y: number; w: number; d: number };

export function pack(cellsX: number, cellsY: number, taken: Rect[], items: Footprint[]): { placed: Packed[]; left: number[] } {
  const rects = [...taken];
  const free = (r: Rect) =>
    r.x >= -E && r.y >= -E && r.x + r.w <= cellsX + E && r.y + r.d <= cellsY + E &&
    !rects.some((o) => r.x < o.x + o.w - E && o.x < r.x + r.w - E && r.y < o.y + o.d - E && o.y < r.y + r.d - E);
  const order = items.map((_, i) => i).sort((a, b) => Math.max(items[b].w, items[b].d) - Math.max(items[a].w, items[a].d) || items[b].w * items[b].d - items[a].w * items[a].d || a - b);
  const placed: Packed[] = [];
  const left: number[] = [];
  for (const i of order) {
    const it = items[i];
    const whole = Number.isInteger(it.w) && Number.isInteger(it.d);
    const step = whole ? 1 : 0.5;
    let hit: Packed | null = null;
    for (let y = 0; !hit && y < cellsY - E; y += step)
      for (let x = 0; !hit && x < cellsX - E; x += step)
        for (const rot of (it.w === it.d ? [0] : [0, 1]) as (0 | 1)[]) {
          const r = { x, y, w: rot ? it.d : it.w, d: rot ? it.w : it.d };
          if (free(r)) {
            hit = { index: i, x, y, rot };
            rects.push(r);
            break;
          }
        }
    if (hit) placed.push(hit);
    else left.push(i);
  }
  return { placed: placed.sort((a, b) => a.index - b.index), left: left.sort((a, b) => a - b) };
}
