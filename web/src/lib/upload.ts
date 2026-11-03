import { api, type BinFile } from "../api";
import { translate } from "./i18n";
import { useStore } from "../store";

export function creatorName() {
  try {
    return localStorage.getItem("creator") ?? "";
  } catch {
    return "";
  }
}

// Upload STL files as bins (server/uploads.py) and reload the library; returns the new entries
export async function uploadBins(files: FileList | File[]): Promise<BinFile[]> {
  const st = useStore.getState();
  const t = (en: string, v?: Record<string, string | number>) => translate(st.lang, en, v);
  const out: BinFile[] = [];
  for (const f of Array.from(files)) {
    if (!/\.stl$/i.test(f.name)) {
      st.toast(t("{name}: only STL files", { name: f.name }), "error");
      continue;
    }
    try {
      const e = await api.upload(f, f.name.replace(/\.stl$/i, "").replace(/[_-]+/g, " "), creatorName());
      out.push(e);
      st.toast(e.warning ? `${e.name}: ${e.warning}` : t("{name} added: {w}×{d}×{h}U", { name: e.name ?? "", w: e.w, d: e.d, h: e.h }), e.warning ? "error" : "info");
    } catch (err) {
      st.toast(`${f.name}: ${(err as Error).message}`, "error");
    }
  }
  if (out.length) useStore.getState().set({ bins: await api.bins() });
  return out;
}
