import { describe, expect, it } from "vitest";
import { matches, rank } from "./search";

describe("searchable select", () => {
  const o = { value: "PLA Basic · Jade White", label: "PLA Basic · Jade-Weiß", group: "PLA Basic" };
  it("needs every word, in any order, case and accents ignored", () => {
    expect(matches(o, "weiss")).toBe(false);   // ß is not ss
    expect(matches(o, "WEIß pla")).toBe(true);
    expect(matches(o, "jade  basic")).toBe(true);
    expect(matches(o, "petg")).toBe(false);
    expect(matches(o, "")).toBe(true);
  });
  it("finds by group too", () => {
    expect(matches({ label: "0.4 mm · 256 × 256", group: "X1 Carbon" }, "carbon 0.4")).toBe(true);
  });
  it("ignores accents", () => {
    expect(matches({ label: "Crème" }, "creme")).toBe(true);
  });
  it("puts the exact and the starting matches first", () => {
    const os = ["1×2", "2×1.5", "12×1", "2×1"].map((l) => ({ label: l }));
    expect(rank(os, "2×1").map((o) => o.label)).toEqual(["2×1", "2×1.5", "12×1"]);
  });
  it("prefers words found at the start of a word", () => {
    const os = ["IKEA ALEX, 5 drawers · 295 × 522 mm", "IKEA ALEX, 9 drawers · 295 × 423 mm"].map((l) => ({ label: l }));
    expect(rank(os, "alex 9")[0].label).toContain("9 drawers");
  });
});
