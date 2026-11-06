import { describe, expect, it } from "vitest";
import { copySpot, fits, fp, snap } from "./placement";
import type { Placed } from "../store";

const lib = new Map([
  ["a2x1", { w: 2, d: 1 }],
  ["a1x1", { w: 1, d: 1 }],
  ["half", { w: 1, d: 0.5 }],
]);
const g = { cellsX: 5, cellsY: 8 };
const bin = (id: string, file: string, x: number, y: number, rot: 0 | 1 = 0): Placed => ({ id, file, x, y, rot });

describe("fp", () => {
  it("swaps width and depth when turned", () => {
    expect(fp({ w: 3, d: 1 }, 0)).toEqual([3, 1]);
    expect(fp({ w: 3, d: 1 }, 1)).toEqual([1, 3]);
  });
});

describe("fits", () => {
  it("accepts a free spot and rejects overlaps", () => {
    const bins = [bin("x", "a2x1", 0, 0)];
    expect(fits({ file: "a1x1", x: 2, y: 0, rot: 0 }, { w: 1, d: 1 }, g, bins, lib)).toBe(true);
    expect(fits({ file: "a1x1", x: 1, y: 0, rot: 0 }, { w: 1, d: 1 }, g, bins, lib)).toBe(false);
  });
  it("lets touching bins share an edge", () => {
    const bins = [bin("x", "a1x1", 0, 0)];
    expect(fits({ file: "a1x1", x: 1, y: 0, rot: 0 }, { w: 1, d: 1 }, g, bins, lib)).toBe(true);
    expect(fits({ file: "a1x1", x: 0, y: 1, rot: 0 }, { w: 1, d: 1 }, g, bins, lib)).toBe(true);
  });
  it("keeps bins inside the grid, turned ones too", () => {
    expect(fits({ file: "a2x1", x: 4, y: 0, rot: 0 }, { w: 2, d: 1 }, g, [], lib)).toBe(false);
    expect(fits({ file: "a2x1", x: 4, y: 0, rot: 1 }, { w: 2, d: 1 }, g, [], lib)).toBe(true);
    expect(fits({ file: "a2x1", x: 0, y: 7, rot: 1 }, { w: 2, d: 1 }, g, [], lib)).toBe(false);
  });
  it("puts whole-cell bins on whole cells only, half bins on half steps", () => {
    expect(fits({ file: "a1x1", x: 0.5, y: 0, rot: 0 }, { w: 1, d: 1 }, g, [], lib)).toBe(false);
    expect(fits({ file: "half", x: 0, y: 0.5, rot: 0 }, { w: 1, d: 0.5 }, g, [], lib)).toBe(true);
  });
  it("ignores the bin being moved", () => {
    const bins = [bin("x", "a2x1", 0, 0)];
    expect(fits({ file: "a2x1", x: 1, y: 0, rot: 0 }, { w: 2, d: 1 }, g, bins, lib, "x")).toBe(true);
  });
});

describe("snap", () => {
  it("centres the bin under the pointer on the grid", () => {
    // pointer in the middle of cell (2, 3): a 1x1 bin lands there
    expect(snap(2.5 * 42, 3.5 * 42, { w: 1, d: 1 }, 0, g)).toEqual([2, 3]);
  });
  it("clamps at the edges", () => {
    expect(snap(-100, -100, { w: 2, d: 1 }, 0, g)).toEqual([0, 0]);
    expect(snap(9999, 9999, { w: 2, d: 1 }, 0, g)).toEqual([3, 7]);
  });
  it("snaps half bins to half cells", () => {
    // pointer 0.8 cells in: the half bin (centre 0.25 off its corner) starts at 0.55, snapped to 0.5
    expect(snap(0.5 * 42, 0.8 * 42, { w: 1, d: 0.5 }, 0, g)).toEqual([0, 0.5]);
  });
});

describe("copySpot", () => {
  it("prefers right beside the original", () => {
    const b = bin("x", "a2x1", 0, 0);
    expect(copySpot(b, { w: 2, d: 1 }, g, [b], lib)).toMatchObject({ x: 2, y: 0 });
  });
  it("goes behind when the right is taken or off the grid", () => {
    const b = bin("x", "a2x1", 3, 0);
    expect(copySpot(b, { w: 2, d: 1 }, g, [b], lib)).toMatchObject({ x: 3, y: 1 });
  });
  it("returns null when the drawer is full", () => {
    const tiny = { cellsX: 1, cellsY: 1 };
    const b = bin("x", "a1x1", 0, 0);
    expect(copySpot(b, { w: 1, d: 1 }, tiny, [b], lib)).toBeNull();
  });
});

import { resizeBox, sameKindSized } from "./placement";
import type { BinFile } from "../api";

describe("resizeBox", () => {
  const b = { x: 1, y: 1, w: 2, d: 1 };
  it("moves the east edge to the pointer in half steps", () => {
    expect(resizeBox(b, "e", 4.2, 0, 5, 8)).toEqual({ x: 1, y: 1, w: 3, d: 1 });
    expect(resizeBox(b, "e", 2.7, 0, 5, 8)).toEqual({ x: 1, y: 1, w: 1.5, d: 1 });
  });
  it("keeps the opposite edge when dragging west or south", () => {
    expect(resizeBox(b, "w", 0, 0, 5, 8)).toEqual({ x: 0, y: 1, w: 3, d: 1 });
    expect(resizeBox(b, "s", 0, 0.4, 5, 8)).toEqual({ x: 1, y: 0.5, w: 2, d: 1.5 });
  });
  it("never goes below half a cell or past the grid", () => {
    expect(resizeBox(b, "e", -3, 0, 5, 8).w).toBe(0.5);
    expect(resizeBox(b, "e", 99, 0, 5, 8).w).toBe(4);
    expect(resizeBox(b, "w", 99, 0, 5, 8)).toMatchObject({ x: 2.5, w: 0.5 });
  });
});

describe("sameKindSized", () => {
  const mk = (w: number, d: number, h = 6, kind = "hex") => ({ file: `${kind}-${w}x${d}x${h}`, type: "bin", system: "groove", kind, w, d, h, bytes: 0 }) as BinFile;
  const library = [mk(1, 1), mk(2, 1), mk(3, 2), mk(2, 1, 9), mk(2, 1, 6, "solid")];
  it("finds the same kind and height in the new size", () => {
    expect(sameKindSized(library, mk(1, 1), 2, 1)).toEqual({ file: mk(2, 1), rot: 0 });
  });
  it("turns it when the footprint is deeper than wide", () => {
    expect(sameKindSized(library, mk(1, 1), 2, 3)).toEqual({ file: mk(3, 2), rot: 1 });
  });
  it("gives null for a size the library does not have", () => {
    expect(sameKindSized(library, mk(1, 1), 5, 5)).toBeNull();
  });
});
