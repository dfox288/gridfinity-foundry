import { describe, expect, it } from "vitest";
import { guess, inventoryTemplate, parseInventory, parseSize } from "./inventory";

describe("parseSize", () => {
  it("reads WxD long side first, and words", () => {
    expect(parseSize("1x2")).toEqual([2, 1]);
    expect(parseSize("1,5 × 1")).toEqual([1.5, 1]);
    expect(parseSize("L")).toEqual([2, 2]);
    expect(parseSize("klein")).toEqual([1, 1]);
    expect(parseSize("big-ish")).toBeNull();
  });
});

describe("guess", () => {
  it("knows tiny parts, tools and bulky things in English and German", () => {
    expect(guess("M3 screws")).toEqual({ w: 1, d: 1, h: 3 });
    expect(guess("Muttern M4")).toEqual({ w: 1, d: 1, h: 3 });
    expect(guess("Seitenschneider")).toEqual({ w: 4, d: 1, h: 6 });
    expect(guess("USB cables")).toEqual({ w: 3, d: 2, h: 6 });
    expect(guess("Something else")).toEqual({ w: 2, d: 1, h: 6 });
  });
  it("gives many tiny parts a bigger bin", () => {
    expect(guess("M3 screws", 200)).toMatchObject({ w: 2, d: 1 });
    expect(guess("M3 screws", 1000)).toMatchObject({ w: 2, d: 2 });
  });
  it("makes room for a length in cm", () => {
    expect(guess("Ruler 15 cm").w).toBe(4);
    expect(guess("Steel rule 30 cm").w).toBe(6);
  });
});

describe("parseInventory", () => {
  it("reads a pasted list with counts before or after", () => {
    const r = parseInventory("M3 screws 200\n- 50 × M4 nuts\nPliers\n\n# a comment");
    expect(r.map((x) => [x.item, x.count])).toEqual([["M3 screws", 200], ["M4 nuts", 50], ["Pliers", undefined]]);
    expect(r[0]).toMatchObject({ w: 2, d: 1, h: 3, guessed: true });
  });
  it("does not take a length or a size in the name for a count", () => {
    const r = parseInventory("Soldering iron 25 cm\nM3 screws");
    expect(r[0]).toMatchObject({ item: "Soldering iron 25 cm", count: undefined });
    expect(r[1].item).toBe("M3 screws");
  });
  it("reads the English CSV template, keeping given sizes and heights", () => {
    const r = parseInventory(inventoryTemplate("en"));
    expect(r).toHaveLength(4);
    expect(r[1]).toMatchObject({ item: "Resistors", w: 1, d: 1, h: 3, guessed: false });
    expect(r[3]).toMatchObject({ item: "Cable ties", w: 2, d: 1, h: 6, guessed: false });
  });
  it("reads the German template (semicolons) and quoted cells", () => {
    expect(parseInventory(inventoryTemplate("de"))[0]).toMatchObject({ item: "Schrauben M3", count: 200 });
    expect(parseInventory('item,size\n"Screws, mixed",2x2')[0]).toMatchObject({ item: "Screws, mixed", w: 2, d: 2 });
  });
});
