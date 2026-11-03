// The server's API (server/app.py)
import { translate } from "./lib/i18n";
import { useStore } from "./store";

export type ParamValue = number | boolean | string | number[];

export interface Param {
  name: string;
  group: string;
  caption?: string;
  type: "number" | "boolean" | "string";
  initial: ParamValue;
  step?: number;
  min?: number;
  max?: number;
  options?: { name: string; value: number | string }[];
}

export interface BinFile {
  file: string;
  type: "bin" | "divider" | "part";
  category?: string;   // dividers and parts: "Divider", "Flex label", ...
  system?: string;
  kind?: string;
  w: number;
  d: number;
  h: number;
  fit?: number;
  side?: string;
  name?: string;
  creator?: string;    // uploaded bins
  owner?: string;      // uploaded bins: the GitHub login of the uploader (sign-in on)
  warning?: string;
  bytes: number;
}

export interface Printer {
  id: string;         // Bambu Studio's printer preset, e.g. "Bambu Lab P1S 0.6 nozzle"
  model: string;
  nozzle: string;
  bed: number[];
  extruders: number;
}

export interface PresetInfo {
  name: string;
  updated: number;
  owner?: string;
}

// sign-in (server/app.py USER_HEADER): auth is on when the server sits behind oauth2-proxy
export interface Me {
  auth: boolean;
  user: string | null;
  admin: boolean;
}

export type PresetKind = "plate" | "layout";

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const e = await r.json();
      msg = e.detail ? `${e.error}: ${e.detail}` : e.error ?? msg;
    } catch {
      /* not JSON */
    }
    if (r.status === 401) msg = translate(useStore.getState().lang, "Sign in with GitHub (top right) to save or upload");
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  schema: () => fetch("/api/schema").then((r) => json<Param[]>(r)),
  bins: () => fetch("/api/bins").then((r) => json<BinFile[]>(r)),
  printers: () => fetch("/api/printers").then((r) => json<Printer[]>(r)),
  // /api/me sits behind oauth2-proxy: signed out it answers a plain 401 (sign-in on, nobody signed in); its own
  // /oauth2/userinfo (the session cookie) is the fallback when the header did not arrive
  async me(): Promise<Me> {
    const r0 = await fetch("/api/me");
    if (r0.status === 401) return { auth: true, user: null, admin: false };
    const me = await json<Me & { admins?: string[] }>(r0);
    if (me.auth && !me.user) {
      const r = await fetch("/oauth2/userinfo", { headers: { Accept: "application/json" } }).catch(() => null);
      const info = r?.ok && (r.headers.get("Content-Type") ?? "").includes("json") ? await r.json() : null;
      me.user = info?.preferredUsername || info?.user || null;
      me.admin = !!me.user && (me.admins ?? []).includes(me.user.toLowerCase());
    }
    return { auth: me.auth, user: me.user, admin: me.admin };
  },
  upload: (file: File, name: string, creator: string) =>
    fetch("/api/uploads", {
      method: "POST",
      headers: { "X-Name": encodeURIComponent(name), "X-Creator": encodeURIComponent(creator), "X-Filename": encodeURIComponent(file.name) },
      body: file,
    }).then((r) => json<BinFile>(r)),
  deleteUpload: (file: string) =>
    fetch(`/api/uploads/${file.replace(/^uploads\//, "").replace(/\.stl$/, "")}`, { method: "DELETE" }).then((r) => json(r)),

  async plate(params: Record<string, ParamValue>, signal?: AbortSignal) {
    const t = performance.now();
    const r = await fetch("/api/plate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
      signal,
    });
    if (!r.ok) await json(r);
    return {
      buffer: await r.arrayBuffer(),
      cached: r.headers.get("X-Cache") === "hit",
      ms: Math.round(performance.now() - t),
    };
  },

  presets: (kind: PresetKind) => fetch(`/api/presets/${kind}`).then((r) => json<PresetInfo[]>(r)),
  loadPreset: <T>(kind: PresetKind, name: string) =>
    fetch(`/api/presets/${kind}/${encodeURIComponent(name)}`).then((r) => json<{ name: string; data: T }>(r)),
  savePreset: (kind: PresetKind, name: string, data: unknown) =>
    fetch(`/api/presets/${kind}/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }).then((r) => json(r)),
  deletePreset: (kind: PresetKind, name: string) =>
    fetch(`/api/presets/${kind}/${encodeURIComponent(name)}`, { method: "DELETE" }).then((r) => json(r)),

  async zip(req: { name: string; bins: { file: string; count: number }[]; parts: { file: string; count: number }[]; labels?: { w: number; fit: number; text: string; count: number }[]; plates?: { params: Record<string, ParamValue>; label: string }[]; plate: { params: Record<string, ParamValue> } | null }) {
    const r = await fetch("/api/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!r.ok) await json(r);
    return r.blob();
  },
};

export interface BambuRequest {
  name: string;
  printer: string;
  bins: { file: string; count: number; filament: string; color: string }[];
  parts: { file: string; count: number; filament: string; color: string }[];
  plate: { params: Record<string, ParamValue>; filament: string; color: string } | null;
  plates?: { params: Record<string, ParamValue>; filament: string; color: string; label: string }[];
  labels?: { w: number; fit: number; text: string; count: number; filament: string; color: string }[];
  split?: boolean;   // one single-plate 3MF per plate, in a zip
}

export async function bambuProject(req: BambuRequest) {
  const r = await fetch("/api/bambu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) await json(r);
  return { blob: await r.blob(), plates: Number(r.headers.get("X-Plates") ?? 0) };
}

// A download's file name: the preset name (or a fallback) made file-safe, a part suffix, and the local date and time,
// e.g. "kitchen-drawer-2_baseplate_2026-11-03_1442.3mf"
export function fileName(preset: string | null, fallback: string, ext: string, suffix = "") {
  const slug = (t: string) =>
    t
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._+-]+/g, "-")
      .replace(/^[-.]+|-+$/g, "")
      .toLowerCase() || fallback;
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  return [slug(preset ?? fallback), suffix && slug(suffix), stamp].filter(Boolean).join("_") + "." + ext;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
