import { expect, test, type Page } from "@playwright/test";
import { bin, openLayout, planView, setBins, state, toScreen } from "./helpers";

// a finger: pointer events of type "touch" at screen points, as a phone sends them
async function finger(page: Page, type: "pointerdown" | "pointermove" | "pointerup", [x, y]: [number, number]) {
  await page.evaluate(([type, x, y]) => {
    const el = document.elementFromPoint(x as number, y as number) ?? document.body;
    el.dispatchEvent(new PointerEvent(type as string, { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: x as number, clientY: y as number, button: 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true }));
  }, [type, x, y] as const);
}

test.beforeEach(async ({ page }) => {
  await openLayout(page);
  await setBins(page, [bin("a", 1, 1, 6, 1, 1), bin("b", 1, 1, 6, 3, 4)]);
  await planView(page);
});

const top = 0.25 + 42;   // a 6U bin's rim above the drawer floor, mm

test("a tap selects the bin and does not move it", async ({ page }) => {
  const p = await toScreen(page, 1.5, 1.5, top);
  await finger(page, "pointerdown", p);
  await page.waitForTimeout(100);
  await finger(page, "pointerup", p);
  expect(await state<string | null>(page, "s.selected")).toBe("a");
  expect(await state<number[]>(page, "[s.layout.bins[0].x, s.layout.bins[0].y]")).toEqual([1, 1]);
});

test("holding a bin picks it up, dragging moves it", async ({ page }) => {
  const p = await toScreen(page, 1.5, 1.5, top);
  const q = await toScreen(page, 2.5, 2.5, top);
  await finger(page, "pointerdown", p);
  await page.waitForTimeout(500);
  for (let i = 1; i <= 6; i++) await finger(page, "pointermove", [p[0] + ((q[0] - p[0]) * i) / 6, p[1] + ((q[1] - p[1]) * i) / 6]);
  await finger(page, "pointerup", q);
  await page.waitForTimeout(200);
  expect(await state<number[]>(page, "[s.layout.bins[0].x, s.layout.bins[0].y]")).toEqual([2, 2]);
});

test("a quick swipe from a bin does not pick it up", async ({ page }) => {
  const p = await toScreen(page, 1.5, 1.5, top);
  await finger(page, "pointerdown", p);
  for (let i = 1; i <= 6; i++) await finger(page, "pointermove", [p[0] + i * 15, p[1]]);
  await page.waitForTimeout(500);
  await finger(page, "pointerup", [p[0] + 90, p[1]]);
  expect(await state<number[]>(page, "[s.layout.bins[0].x, s.layout.bins[0].y]")).toEqual([1, 1]);
  expect(await state<string | null>(page, "s.selected")).toBeNull();
});
