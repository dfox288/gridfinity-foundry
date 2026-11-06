import { describe, expect, it } from "vitest";
import { trace } from "./grid";

describe("trace (GridFlock's cell layout along one axis)", () => {
  it("only whole cells without fillers", () => {
    expect(trace(5 * 42 + 6, 0, 2, 15)).toEqual([1, 1, 1, 1, 1]);
  });
  it("adds half cells with integer-fraction fillers", () => {
    expect(trace(5.5 * 42 + 6, 1, 2, 15)).toEqual([1, 1, 1, 1, 1, 0.5]);
  });
  it("one dynamic cell at the end, merged into the last when too small", () => {
    const t = trace(5 * 42 + 6, 2, 2, 15);
    expect(t).toHaveLength(5);
    expect(t[4]).toBeCloseTo(1 + 6 / 42);
  });
});
