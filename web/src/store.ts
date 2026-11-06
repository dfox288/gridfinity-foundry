import { create } from "zustand";
import type { BinFile, Me, Param, ParamValue, Printer, Provider } from "./api";

export type Tab = "plate" | "layout";
export type ColorMode = "height" | "system" | "custom";

export interface Placed {
  id: string;
  file: string;
  x: number;        // cells from the grid's south-west corner (half steps)
  y: number;
  rot: 0 | 1;       // 1: turned by 90 deg
  color?: string;
  filament?: string;  // its Bambu colour, e.g. "PLA Basic · Jade White"
  label?: string;     // what goes in it ("M3 screws"), shown on the bin
}

export interface Layout {
  plate: Record<string, ParamValue>;   // GridFlock overrides of this drawer (plate_size = the drawer)
  bins: Placed[];
  colorMode: ColorMode;
  plateFilament?: [string, string];   // [name, hex] of the baseplate, e.g. ["PLA Basic · Gray", "#8E9089"]
  parts?: PartLine[];                 // dividers and labels to print with it
  height?: number;                    // the drawer's inner height, mm (optional): taller bins are flagged
}

export interface PartLine {
  file: string;
  count: number;
  filament: [string, string];
}

// a project: several drawers, each with its own layout (2026-11-03: drawer planner); `layout` in the store is the
// active drawer's, the others wait in `drawers`
export interface Drawer {
  id: string;
  name: string;
  furniture?: string;
  layout: Layout;
}

export interface Project {
  version: 2;
  drawers: Drawer[];
  active: number;
}

interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

interface State {
  tab: Tab;
  theme: "dark" | "light";
  lang: "en" | "de";
  schema: Param[];
  bins: BinFile[];
  printers: Printer[];
  heights: number[];   // bin heights the catalog has (server/catalog.py)
  me: Me;
  providers: Provider[];   // sign-in buttons
  printer: string;    // Bambu printer preset: bed size and the Bambu project's settings
  plate: Record<string, ParamValue>;
  platePreset: string | null;
  layout: Layout;
  layoutPreset: string | null;
  drawers: Drawer[];
  active: number;
  past: Placed[][];
  future: Placed[][];
  selected: string | null;
  also: string[];      // more selected bins (Shift-click, ⌘A) besides `selected`; any new `selected` alone clears them
  toasts: Toast[];
  set: (s: Partial<State>) => void;
  setPlateParam: (name: string, v: ParamValue | undefined) => void;
  setLayoutPlate: (name: string, v: ParamValue | undefined) => void;
  editBins: (f: (b: Placed[]) => Placed[]) => void;
  undo: () => void;
  redo: () => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

export const DEFAULT_LAYOUT: Layout = {
  plate: { plate_size: [5 * 42 + 6, 8 * 42 + 6] },
  bins: [],
  colorMode: "height",
};

function override(over: Record<string, ParamValue>, schema: Param[], name: string, v: ParamValue | undefined) {
  const p = schema.find((x) => x.name === name);
  const next = { ...over };
  if (v === undefined || (p && JSON.stringify(p.initial) === JSON.stringify(v))) delete next[name];
  else next[name] = v;
  return next;
}

const savedLang = (() => {
  try {
    return (localStorage.getItem("lang") as "en" | "de" | null) ?? null;
  } catch {
    return null;
  }
})();

const savedPrinter = (() => {
  try {
    return localStorage.getItem("printer");
  } catch {
    return null;
  }
})();

const savedTheme = (() => {
  try {
    return (localStorage.getItem("theme") as "dark" | "light" | null) ?? null;
  } catch {
    return null;
  }
})();

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  tab: "plate",
  theme: savedTheme ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
  lang: savedLang ?? (navigator.language.toLowerCase().startsWith("de") ? "de" : "en"),
  schema: [],
  bins: [],
  printers: [],
  heights: [3, 6, 9],
  me: { auth: false, user: null, id: "", name: null, admin: false },
  providers: [],
  printer: savedPrinter ?? "Bambu Lab P1S 0.6 nozzle",
  plate: {},
  platePreset: null,
  layout: DEFAULT_LAYOUT,
  layoutPreset: null,
  drawers: [{ id: "d1", name: "Drawer 1", layout: DEFAULT_LAYOUT }],
  active: 0,
  past: [],
  future: [],
  selected: null,
  also: [],
  toasts: [],
  set: (s) => set("selected" in s && !("also" in s) ? { ...s, also: [] } : s),
  setPlateParam: (name, v) => set({ plate: override(get().plate, get().schema, name, v) }),
  setLayoutPlate: (name, v) => set({ layout: { ...get().layout, plate: override(get().layout.plate, get().schema, name, v) } }),
  editBins: (f) => {
    const { layout, past } = get();
    const bins = f(layout.bins);
    if (bins === layout.bins) return;
    set({ layout: { ...layout, bins }, past: [...past.slice(-99), layout.bins], future: [] });
  },
  undo: () => {
    const { past, future, layout } = get();
    if (!past.length) return;
    set({ layout: { ...layout, bins: past[past.length - 1] }, past: past.slice(0, -1), future: [layout.bins, ...future] });
  },
  redo: () => {
    const { past, future, layout } = get();
    if (!future.length) return;
    set({ layout: { ...layout, bins: future[0] }, past: [...past, layout.bins], future: future.slice(1) });
  },
  toast: (text, kind = "info") => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === "error" ? 7000 : 3500);
  },
}));

export const newId = () => Math.random().toString(36).slice(2, 9);

// the whole project with the active drawer's current layout in place
export function project(): Project {
  const s = useStore.getState();
  return { version: 2, active: s.active, drawers: s.drawers.map((d, i) => (i === s.active ? { ...d, layout: s.layout } : d)) };
}

// a saved preset or draft: a project, or (older) a single layout
// the bin variants were called flex and cullenect before they became groove and click (2026-11-04)
export function binFile(f: string) {
  return f.replace(/^flex\/print-bin-flex_/, "groove/print-bin-groove_").replace(/^cullenect\/print-bin-cullenect_/, "click/print-bin-click_");
}

function layoutOf(l: Partial<Layout>): Layout {
  const x = { ...DEFAULT_LAYOUT, ...l };
  return { ...x, bins: x.bins.map((b) => ({ ...b, file: binFile(b.file) })) };
}

export function toProject(data: unknown): Project {
  const d = data as Partial<Project> & Partial<Layout>;
  if (d && Array.isArray(d.drawers) && d.drawers.length)
    return { version: 2, active: Math.min(d.active ?? 0, d.drawers.length - 1), drawers: d.drawers.map((x) => ({ ...x, layout: layoutOf(x.layout) })) };
  return { version: 2, active: 0, drawers: [{ id: newId(), name: "Drawer 1", layout: layoutOf(d as Layout) }] };
}

export function loadProject(p: Project) {
  useStore.getState().set({ drawers: p.drawers, active: p.active, layout: p.drawers[p.active].layout, past: [], future: [], selected: null });
}

export function switchDrawer(i: number) {
  const p = project();
  if (i < 0 || i >= p.drawers.length) return;
  loadProject({ ...p, active: i });
}

// The value of a GridFlock parameter: the override, else GridFlock's default
export function value(over: Record<string, ParamValue>, schema: Param[], name: string): ParamValue | undefined {
  return name in over ? over[name] : schema.find((p) => p.name === name)?.initial;
}

// for poking at it from the browser console
(window as unknown as { studio: typeof useStore }).studio = useStore;

// may the current user delete or overwrite something owned by ownerId (an upload, a preset; owner_id from the server)
export function canChange(ownerId?: string) {
  const { me } = useStore.getState();
  return !me.auth || me.admin || (!!me.id && ownerId === me.id);
}
