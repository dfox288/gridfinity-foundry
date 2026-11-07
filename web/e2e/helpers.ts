import { expect, type Page } from "@playwright/test";

// The page exposes its store as window.studio and the camera controls as window.foundryControls (for the console and
// for these tests).
export async function openLayout(page: Page, lang: "en" | "de" = "en") {
  await page.goto("/");
  await page.evaluate((l) => (localStorage.clear(), localStorage.setItem("lang", l)), lang);
  await page.reload();
  await expect(page.locator("nav.tabs button").first()).toBeVisible();
  await page.locator("nav.tabs button").nth(1).click();
  await expect(page.locator(".stage canvas")).toBeVisible();
  await page.waitForFunction(() => (window as any).studio.getState().bins.length > 0);
}

export const state = <T>(page: Page, f: string) => page.evaluate(`(() => { const s = studio.getState(); return ${f}; })()`) as Promise<T>;

export async function setBins(page: Page, bins: object[], selected?: string) {
  await page.evaluate(([b, sel]) => {
    const s = (window as any).studio.getState();
    s.editBins(() => b);
    if (sel) s.set({ selected: sel });
  }, [bins, selected] as const);
}

export const bin = (id: string, w: number, d: number, h: number, x: number, y: number, extra: object = {}) => ({
  id, file: `groove/print-bin-groove_hex-${w}x${d}x${h}.stl`, x, y, rot: 0, ...extra,
});

// a point of the drawer (cells, and mm above the floor) on the screen, through the current camera
export async function toScreen(page: Page, x: number, y: number, z: number): Promise<[number, number]> {
  return page.evaluate(([x, y, z]) => {
    const c = (window as any).foundryControls.current.camera;
    const v = c.position.clone().set(x * 42, y * 42, z).project(c);
    const r = document.querySelector(".stage canvas")!.getBoundingClientRect();
    return [r.x + ((v.x + 1) / 2) * r.width, r.y + ((1 - v.y) / 2) * r.height] as [number, number];
  }, [x, y, z] as const);
}

// the centre of a bin's label on the screen
export async function labelAt(page: Page, text: string): Promise<[number, number]> {
  const box = await page.locator(".bin-label", { hasText: text }).first().boundingBox();
  if (!box) throw new Error(`no label ${text}`);
  return [box.x + box.width / 2, box.y + box.height / 2];
}

// switch to the plan view and wait until its camera has settled (zoom unchanged for a few frames)
export async function planView(page: Page) {
  await page.keyboard.press("4");
  await page.waitForFunction(() => (window as any).foundryControls?.current?.camera?.isOrthographicCamera);
  await page.waitForFunction(
    () =>
      new Promise<boolean>((done) => {
        const c = (window as any).foundryControls.current.camera;
        const z = c.zoom;
        setTimeout(() => done(c.zoom === z && z > 0.5), 300);
      }),
  );
}

// a click on the 3D view as a person makes it: the pointer arrives first (the scene picks up what is under it), then
// the button; an instant move-and-click is sometimes not seen by the scene
export async function clickAt(page: Page, [x, y]: [number, number], button: "left" | "right" = "left") {
  await page.mouse.move(x, y);
  await page.waitForTimeout(250);
  await page.mouse.down({ button });
  await page.mouse.up({ button });
}

// pick in a searchable select (components/Select.tsx): open it, type, Enter takes the first match
export async function choose(page: Page, combo: import("@playwright/test").Locator, search: string) {
  await combo.click();
  await page.locator(".combo-pop .combo-search").fill(search);
  await page.keyboard.press("Enter");
  await expect(page.locator(".combo-pop")).toHaveCount(0);
}
