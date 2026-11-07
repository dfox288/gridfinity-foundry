import { expect, test } from "@playwright/test";
import { choose, openLayout, state } from "./helpers";

test.beforeEach(async ({ page }) => openLayout(page));

const card = (page: import("@playwright/test").Page) => page.locator(".card", { has: page.locator("h3", { hasText: "From your inventory" }) });

test("a pasted list becomes labelled bins in the drawer, one undo takes them back", async ({ page }) => {
  const c = card(page);
  await c.locator("textarea").fill("M3 screws 200\nM4 nuts\nPliers\nUSB cables\nSoldering iron 25 cm");
  await c.getByRole("button", { name: "Suggest bins" }).click();
  await expect(c.locator(".inv-table tr")).toHaveCount(5);
  const size = (i: number) => c.locator(".inv-table tr").nth(i).locator(".combo").first();   // searchable: many sizes
  await expect(size(0)).toHaveAttribute("data-value", "2x1");   // 200 screws: a bigger bin
  await expect(size(2)).toHaveAttribute("data-value", "4x1");   // pliers: long
  await choose(page, size(1), "2×1");                           // change a guess
  await c.getByRole("button", { name: /Place 5 bins/ }).click();
  const labels = await state<string[]>(page, "s.layout.bins.map(b => b.label).sort()");
  expect(labels).toEqual(["M3 screws", "M4 nuts", "Pliers", "Soldering iron 25 cm", "USB cables"]);
  expect(await state<string>(page, "s.layout.bins.find(b => b.label === 'M4 nuts').file")).toContain("2x1x3");
  await page.keyboard.press("Control+z");
  expect(await state<number>(page, "s.layout.bins.length")).toBe(0);
});

test("what does not fit goes into a new drawer", async ({ page }) => {
  const c = card(page);
  await c.locator("textarea").fill(Array.from({ length: 14 }, (_, i) => `Cables ${i + 1}`).join("\n"));   // 3x2 each
  await c.getByRole("button", { name: "Suggest bins" }).click();
  await c.getByRole("button", { name: /Place 14 bins/ }).click();
  await expect(c.locator(".inv-left")).toContainText("did not fit");
  const first = await state<number>(page, "s.layout.bins.length");
  await c.getByRole("button", { name: "Into a new drawer" }).click();
  expect(await state<number>(page, "s.drawers.length")).toBe(2);
  expect(first + (await state<number>(page, "s.layout.bins.length"))).toBeLessThanOrEqual(14);
  expect(await state<number>(page, "s.active")).toBe(1);
});

test("the CSV template downloads and reads back", async ({ page }) => {
  const c = card(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), c.getByRole("button", { name: "CSV template" }).click()]);
  expect(dl.suggestedFilename()).toBe("inventory-template.csv");
  const text = await (await dl.createReadStream()).toArray().then((b) => Buffer.concat(b).toString());
  await c.locator("input[type=file]").setInputFiles({ name: "mine.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
  await expect(c.locator(".inv-table tr")).toHaveCount(4);
  await expect(c.locator(".inv-table tr").nth(1).locator("input")).toHaveValue("Resistors");
});
