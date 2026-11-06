// Filament estimate: grams and metres from a part's solid volume (GET /api/volume). Gridfinity bins are mostly thin
// walls, which a slicer prints solid, so the solid volume is close; floors and the baseplate get infill, so the real
// number is somewhat lower. 1.75 mm filament.
import { useEffect, useState } from "react";

const DENSITY: [RegExp, number][] = [[/PETG/i, 1.27], [/ABS|ASA/i, 1.05], [/TPU/i, 1.21], [/PLA/i, 1.24]];
export const FILAMENT_MM2 = Math.PI * 0.875 ** 2;

export function density(filament?: string) {
  return DENSITY.find(([re]) => re.test(filament ?? ""))?.[1] ?? 1.24;
}

export const grams = (mm3: number, filament?: string) => (mm3 / 1000) * density(filament);
export const metres = (mm3: number) => mm3 / FILAMENT_MM2 / 1000;

const known = new Map<string, number>();
const pending = new Set<string>();

// volumes of library files; re-renders when new ones arrive
export function useVolumes(files: string[]): Map<string, number> {
  const [, bump] = useState(0);
  const key = [...new Set(files)].sort().join("|");
  useEffect(() => {
    const want = key ? key.split("|").filter((f) => !known.has(f) && !pending.has(f)) : [];
    if (!want.length) return;
    want.forEach((f) => pending.add(f));
    let alive = true;
    (async () => {
      for (let i = 0; i < want.length; i += 60) {
        const chunk = want.slice(i, i + 60);
        try {
          const r = await fetch(`/api/volume?${chunk.map((f) => `f=${encodeURIComponent(f)}`).join("&")}`);
          const d = (await r.json()) as Record<string, number>;
          for (const [f, v] of Object.entries(d)) known.set(f, v);
        } catch {
          /* no estimate then */
        } finally {
          chunk.forEach((f) => pending.delete(f));
        }
      }
      if (alive) bump((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return known;
}

export function fmtGrams(g: number) {
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}
