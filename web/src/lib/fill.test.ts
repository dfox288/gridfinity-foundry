import { describe, expect, it } from "vitest";
import { fill } from "./fill";
import type { BinFile } from "../api";

const b = (w: number, d: number) => ({ file: `${w}x${d}`, w, d }) as BinFile;
const area = (r: { file: string }[]) => r.reduce((a, x) => a + x.file.split("x").map(Number).reduce((p, q) => p * q, 1), 0);

describe("fill", () => {
  it("fills an empty drawer completely with 1x1 bins", () => {
    const r = fill(3, 2, [], [b(1, 1)]);
    expect(r).toHaveLength(6);
  });
  it("uses the biggest bin within the size limit", () => {
    const r = fill(4, 4, [], [b(1, 1), b(2, 2), b(4, 4)], [2, 2]);
    expect(r.every((x) => x.file === "2x2")).toBe(true);
    expect(r).toHaveLength(4);
  });
  it("leaves taken cells alone and covers the rest", () => {
    const r = fill(3, 3, [{ x: 1, y: 1, w: 1, d: 1 }], [b(1, 1), b(2, 1)]);
    expect(area(r)).toBe(8);
  });
  it("fills a half-cell column with half bins only", () => {
    const r = fill(2.5, 2, [], [b(1, 1), b(2, 0.5)]);
    expect(area(r)).toBe(5);
  });
  it("returns nothing when no candidate fits the limit", () => {
    expect(fill(4, 4, [], [b(3, 3)], [2, 2])).toEqual([]);
  });
});
