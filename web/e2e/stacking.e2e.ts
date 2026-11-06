import { expect, test } from "@playwright/test";
import { bin, clickAt, openLayout, planView, setBins, state, toScreen } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openLayout(page);
  // the floor: two 3U bins side by side, a 6U bin further right
  await setBins(page, [bin("a", 1, 1, 3, 0, 0, { label: "A" }), bin("b", 1, 1, 3, 1, 0, { label: "B" }), bin("c", 1, 1, 6, 3, 0, { label: "C" })]);
  await planView(page);
});

const plateTop = 0.25;   // mm above the bins' bottom where the plate's top is (top - SEAT)

test("a bin placed on layer 2 stands on the two 3U bins", async ({ page }) => {
  await page.locator(".layers button", { hasText: "2" }).click();
  await page.locator(".lib-item", { hasText: /^2×1$/ }).first().click();
  await clickAt(page, await toScreen(page, 1, 0.5, plateTop + 21));
  const top = await state<{ z: number; file: string }>(page, "s.layout.bins.find(b => (b.z ?? 0) === 1)");
  expect(top.z).toBe(1);
  expect(top.file).toContain("2x1x6");
  // the floor counts its own bins only, the print list all of them
  await expect(page.locator(".drawer .hint")).toContainText("8% filled");
});

test("a stacked bin needs a level footing", async ({ page }) => {
  await page.locator(".layers button", { hasText: "2" }).click();
  await page.locator(".lib-item", { hasText: /^2×1$/ }).first().click();
  await clickAt(page, await toScreen(page, 3, 0.5, plateTop + 21));   // half over nothing, half on the 6U bin
  await expect(page.locator(".toast")).toContainText("level footing");
  expect(await state<number>(page, "s.layout.bins.length")).toBe(3);
});

test("moving a bin out from under a stack flags the stack", async ({ page }) => {
  await setBins(page, [
    bin("a", 1, 1, 3, 0, 0), bin("b", 1, 1, 3, 1, 0),
    { ...bin("t", 2, 1, 3, 0, 0, { label: "On top" }), z: 1 },
  ]);
  await expect(page.locator(".drawer .hint .bad")).toHaveCount(0);
  await page.evaluate(() => (window as any).studio.getState().editBins((bs: any[]) => bs.map((b) => (b.id === "b" ? { ...b, x: 3 } : b))));
  await expect(page.locator(".drawer .hint .bad")).toContainText("no level footing");
});

test("Cmd/Ctrl+A selects the layer being edited only", async ({ page }) => {
  await setBins(page, [bin("a", 1, 1, 3, 0, 0), bin("b", 1, 1, 3, 1, 0), { ...bin("t", 2, 1, 3, 0, 0), z: 1 }]);
  await page.locator(".layers button", { hasText: "2" }).click();
  await page.locator(".stage canvas").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Control+a");
  expect(await state<string[]>(page, "[s.selected, ...s.also]")).toEqual(["t"]);
});
