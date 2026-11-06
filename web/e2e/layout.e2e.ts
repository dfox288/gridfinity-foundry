import { expect, test } from "@playwright/test";
import { bin, labelAt, openLayout, planView, setBins, state, toScreen } from "./helpers";

test.beforeEach(async ({ page }) => openLayout(page));

test("example drawers load without overlaps", async ({ page }) => {
  for (const name of ["Screw drawer", "Electronics drawer"]) {
    if (name !== "Screw drawer") await page.evaluate(() => (window as any).studio.getState().editBins(() => []));
    await page.locator(".examples button", { hasText: name }).click();
    const r = await state<{ n: number; missing: number; overlaps: number }>(page, `(() => {
      const lib = new Map(s.bins.map(b => [b.file, b]));
      const rs = s.layout.bins.map(b => { const i = lib.get(b.file); if (!i) return null; const [w, d] = b.rot ? [i.d, i.w] : [i.w, i.d]; return { x: b.x, y: b.y, w, d }; });
      let overlaps = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], c = rs[j];
        if (a && c && a.x < c.x + c.w - 1e-6 && c.x < a.x + a.w - 1e-6 && a.y < c.y + c.d - 1e-6 && c.y < a.y + a.d - 1e-6) overlaps++; }
      return { n: rs.length, missing: rs.filter(x => !x).length, overlaps };
    })()`);
    expect(r.n).toBeGreaterThan(10);
    expect(r.missing).toBe(0);
    expect(r.overlaps).toBe(0);
    await expect(page.locator(".drawer .hint")).toContainText("100% filled");
  }
});

test("share link opens the same project in a fresh browser", async ({ page, browser, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setBins(page, [bin("a", 2, 2, 6, 0, 0, { label: "M3 screws" }), bin("b", 3, 1, 6, 2, 0)]);
  await page.locator("button.share").click();
  await expect(page.locator(".toast")).toContainText("Link copied");   // the link is compressed asynchronously
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain("#share=");
  const before = await state<string>(page, "JSON.stringify(s.layout.bins)");
  const other = await (await browser.newContext()).newPage();
  await other.goto(url);
  await other.waitForFunction(() => (window as any).studio.getState().layout.bins.length === 2);
  expect(await other.evaluate(() => JSON.stringify((window as any).studio.getState().layout.bins))).toBe(before);
  expect(await other.evaluate(() => location.hash)).toBe("");
});

test("fill gaps fills the drawer, one undo takes it back", async ({ page }) => {
  await setBins(page, [bin("a", 3, 2, 6, 1, 2)]);
  await page.locator(".fill-row button").click();
  await expect(page.locator(".drawer .hint")).toContainText("100% filled");
  await page.keyboard.press("Control+z");
  expect(await state<number>(page, "s.layout.bins.length")).toBe(1);
});

test("shift-click selects several, they move and go together", async ({ page }) => {
  await setBins(page, [bin("a", 1, 1, 6, 0, 0, { label: "A" }), bin("b", 1, 1, 6, 1, 0, { label: "B" }), bin("c", 1, 1, 6, 0, 3, { label: "C" })]);
  await page.locator(".views button", { hasText: "Plan" }).click();
  await page.waitForFunction(() => (window as any).foundryControls?.current?.camera?.isOrthographicCamera);
  await page.waitForTimeout(800);
  await page.mouse.click(...(await labelAt(page, "A")));
  await page.keyboard.down("Shift");
  await page.mouse.click(...(await labelAt(page, "B")));
  await page.keyboard.up("Shift");
  expect(await state<string[]>(page, "[s.selected, ...s.also].sort()")).toEqual(["a", "b"]);
  await page.keyboard.press("ArrowUp");
  expect(await state<number[]>(page, "s.layout.bins.map(b => b.y)")).toEqual([1, 1, 3]);
  await page.keyboard.press("Delete");
  expect(await state<string[]>(page, "s.layout.bins.map(b => b.id)")).toEqual(["c"]);
});

test("plan view renders and labels stay small", async ({ page }) => {
  await page.locator(".examples button", { hasText: "Screw drawer" }).click();
  await planView(page);
  await expect(page.locator(".views button.on")).toHaveText("Plan");
  const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".bin-label")].map((e) => e.getBoundingClientRect().width)));
  expect(widest).toBeLessThan(250);   // labels once blew up to cover the page in the orthographic view
  await page.keyboard.press("1");
  await expect(page.locator(".views button.on")).toHaveCount(0);
});

test("dragging an edge handle resizes the bin", async ({ page }) => {
  await setBins(page, [bin("a", 2, 1, 6, 1, 3, { label: "Tape" }), bin("b", 1, 1, 6, 4, 3)], "a");
  await planView(page);
  const z = 0.25 + 42 + 6;
  const drag = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(...(await toScreen(page, from[0], from[1], z)));
    await page.mouse.down();
    await page.mouse.move(...(await toScreen(page, to[0], to[1], z)), { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);   // the handles come back after the resize is committed
  };
  await drag([3, 3.5], [4.1, 3.5]);
  expect(await state<string>(page, "s.layout.bins[0].file")).toContain("3x1x6");
  await drag([4, 3.5], [5.2, 3.5]);   // into bin b: refused
  await expect(page.locator(".toast")).toContainText("No room");
  expect(await state<string>(page, "s.layout.bins[0].file")).toContain("3x1x6");
  expect(await state<string>(page, "s.layout.bins[0].label")).toBe("Tape");
});

test("right-click opens the bin menu, a right drag does not", async ({ page }) => {
  await setBins(page, [bin("a", 2, 2, 6, 0, 0, { label: "Screws" })]);
  await planView(page);
  const [x, y] = await labelAt(page, "Screws");
  await page.mouse.click(x, y - 30, { button: "right" });
  await expect(page.locator(".ctx-menu")).toContainText("Copy beside it");
  await page.locator(".ctx-menu button", { hasText: "Copy beside it" }).click();
  expect(await state<number>(page, "s.layout.bins.length")).toBe(2);
  await page.mouse.move(x, y - 30);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 80, y + 20, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(page.locator(".ctx-menu")).toHaveCount(0);
});
