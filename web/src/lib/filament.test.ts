import { describe, expect, it } from "vitest";
import { density, fmtGrams, grams, metres } from "./filament";

describe("filament estimate", () => {
  it("weighs by material", () => {
    expect(density("PLA Basic · Cyan")).toBe(1.24);
    expect(density("PETG HF · Black")).toBe(1.27);
    expect(grams(10000, "PLA Basic")).toBeCloseTo(12.4);
  });
  it("turns volume into 1.75 mm filament length", () => {
    expect(metres(2405.28)).toBeCloseTo(1, 2);
  });
  it("formats grams and kilograms", () => {
    expect(fmtGrams(412.6)).toBe("413 g");
    expect(fmtGrams(1530)).toBe("1.53 kg");
  });
});
