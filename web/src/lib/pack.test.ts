import { describe, expect, it } from "vitest";
import { pack } from "./pack";

const overlaps = (rs: { x: number; y: number; w: number; d: number }[]) =>
  rs.some((a, i) => rs.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d));

describe("pack", () => {
  it("places everything that fits without overlaps, inside the drawer", () => {
    const items = [{ w: 4, d: 1 }, { w: 2, d: 2 }, { w: 1, d: 1 }, { w: 1, d: 1 }, { w: 3, d: 2 }];
    const r = pack(5, 4, [], items);
    expect(r.left).toEqual([]);
    const rects = r.placed.map((p) => ({ x: p.x, y: p.y, w: p.rot ? items[p.index].d : items[p.index].w, d: p.rot ? items[p.index].w : items[p.index].d }));
    expect(overlaps(rects)).toBe(false);
    expect(rects.every((q) => q.x + q.w <= 5 && q.y + q.d <= 4)).toBe(true);
  });
  it("hands back what does not fit", () => {
    const r = pack(2, 2, [], [{ w: 2, d: 2 }, { w: 1, d: 1 }]);
    expect(r.placed.map((p) => p.index)).toEqual([0]);
    expect(r.left).toEqual([1]);
  });
  it("turns a bin when only that fits", () => {
    const r = pack(1, 4, [], [{ w: 4, d: 1 }]);
    expect(r.placed[0]).toMatchObject({ x: 0, y: 0, rot: 1 });
  });
  it("keeps clear of bins already there", () => {
    const r = pack(2, 1, [{ x: 0, y: 0, w: 1, d: 1 }], [{ w: 1, d: 1 }]);
    expect(r.placed[0]).toMatchObject({ x: 1, y: 0 });
  });
  it("puts half bins into a half-cell strip", () => {
    const r = pack(2.5, 1, [{ x: 0, y: 0, w: 2, d: 1 }], [{ w: 1, d: 0.5 }]);
    expect(r.placed[0]).toMatchObject({ x: 2, y: 0, rot: 1 });
  });
});
