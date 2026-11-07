import { expect, test } from "@playwright/test";
import { openLayout, state } from "./helpers";

test.beforeEach(async ({ page }) => openLayout(page));

test("long select boxes are searchable: type, arrows, Enter; Escape keeps the value", async ({ page }) => {
  const printer = page.locator(".drawer .printer .combo");
  const before = await printer.getAttribute("data-value");
  await printer.click();
  await page.keyboard.type("h2d 0.6");   // the search field has the focus
  await expect(page.locator(".combo-opt").first()).toContainText("H2D");
  await page.keyboard.press("Escape");
  await expect(page.locator(".combo-pop")).toHaveCount(0);
  await expect(printer).toHaveAttribute("data-value", before!);
  await expect(printer).toBeFocused();

  await page.keyboard.type("x1 carbon 0.4");   // typing on the closed box opens it with that text
  await expect(page.locator(".combo-search")).toHaveValue("x1 carbon 0.4");
  await page.keyboard.press("Enter");
  expect(await state(page, "s.printer")).toMatch(/X1 Carbon 0\.4/);
  await expect(printer).toContainText("0.4 mm");

  await printer.click();
  await page.locator(".combo-search").fill("no such printer");
  await expect(page.locator(".combo-empty")).toBeVisible();
  await page.mouse.click(900, 500);   // a click elsewhere closes it
  await expect(page.locator(".combo-pop")).toHaveCount(0);
});

test("short select boxes stay the browser's own", async ({ page }) => {
  await expect(page.locator(".fill-row select")).toHaveCount(1);   // 6 options
});
