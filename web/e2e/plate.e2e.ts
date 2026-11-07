import { expect, test } from "@playwright/test";
import { choose, openLayout, state } from "./helpers";

// a saved baseplate preset, served by a mocked API (nothing is written to the server)
const SAVED = { name: "Thin magnets", data: { plate_size: [300, 400], magnets: true } };
test.beforeEach(async ({ page }) => {
  await page.route("**/api/presets/plate", (r) => r.fulfill({ json: [{ name: SAVED.name, updated: 1, owner: "" }] }));
  await page.route(`**/api/presets/plate/${encodeURIComponent(SAVED.name)}`, (r) => r.fulfill({ json: SAVED }));
});

test("furniture drawers are built-in baseplate presets that set the size only", async ({ page }) => {
  await openLayout(page);
  await page.locator("nav.tabs button", { hasText: "Baseplate" }).click();
  await page.evaluate(() => (window as any).studio.getState().setPlateParam("magnets", true));
  await page.locator(".presets .preset-current").click();
  await expect(page.locator(".popover .preset-group").first()).toHaveText("Furniture drawers");
  await page.locator(".popover .item.builtin", { hasText: "IKEA HELMER" }).click();
  await expect(page.locator(".toast")).toContainText("Measure yours");
  expect(await state(page, "s.plate")).toEqual({ magnets: true, plate_size: [220, 370] });
  await expect(page.locator(".preset-name")).toHaveText("IKEA HELMER");
  await page.locator(".presets .icon-btn").first().click();   // saving a built-in one asks for a new name
  await expect(page.locator(".presets form.popover input")).toHaveValue("IKEA HELMER copy");
});

test("a layout drawer picks its baseplate: furniture or a saved preset, copied", async ({ page }) => {
  await openLayout(page);
  const pick = page.locator(".drawer .baseplate-pick .combo");
  await choose(page, pick, "alex 9");
  expect(await state(page, "s.layout.plate.plate_size")).toEqual([295, 423]);
  expect(await state(page, "s.drawers[s.active].furniture")).toBe("ikea-alex-9");
  await expect(page.locator(".baseplate-pick .changed")).toHaveCount(0);
  await page.locator(".drawer .drawer-row input").first().fill("290");
  await expect(page.locator(".baseplate-pick .changed")).toBeVisible();

  await choose(page, pick, "thin magnets");
  await expect.poll(() => state(page, "s.layout.plate")).toEqual(SAVED.data);
  expect(await state(page, "s.drawers[s.active].plateFrom")).toBe(SAVED.name);
  await expect(page.locator(".baseplate-pick .changed")).toHaveCount(0);

  await page.locator("button", { hasText: "Edit on the Baseplate tab" }).click();
  await expect(page.locator(".preset-name")).toHaveText(SAVED.name);
  expect(await state(page, "s.plate")).toEqual(SAVED.data);
});
