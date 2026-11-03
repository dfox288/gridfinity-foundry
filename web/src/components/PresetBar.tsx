import { useEffect, useRef, useState } from "react";
import { api, type PresetInfo, type PresetKind } from "../api";
import { useT } from "../lib/i18n";
import { canChange, useStore } from "../store";

// Saved presets of one kind on the server: pick one to load, save the current state under a name, delete
export function PresetBar<T>({ kind, current, dirty, onLoad, getData, onNew }: {
  kind: PresetKind;
  current: string | null;
  dirty: boolean;
  onLoad: (name: string, data: T) => void;
  getData: () => T;
  onNew: () => void;
}) {
  const toast = useStore((s) => s.toast);
  useStore((s) => s.me);   // re-render on sign-in (canChange)
  const t = useT();
  const [list, setList] = useState<PresetInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const refresh = () => api.presets(kind).then(setList).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && (setOpen(false), setSaving(false));
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const save = async (n: string) => {
    n = n.trim();
    if (!n) return;
    try {
      await api.savePreset(kind, n, getData());
      toast(t("Saved “{name}”", { name: n }));
      setSaving(false);
      await refresh();
      onLoad(n, getData());
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="presets" ref={box}>
      <button className="preset-current" onClick={() => setOpen(!open)}>
        <span className="preset-label">{t("Preset")}</span>
        <span className="preset-name">{current ?? t("Unsaved")}{dirty && current ? " •" : ""}</span>
        <span className="caret">▾</span>
      </button>
      <button className="icon-btn" title={current ? t("Save “{name}”", { name: current }) : t("Save as…")} onClick={() => (current ? save(current) : (setName(""), setSaving(true)))}>
        ⤓
      </button>
      <button className="icon-btn" title={t("Save as…")} onClick={() => (setName(current ? `${current} copy` : ""), setSaving(true), setOpen(false))}>
        ＋
      </button>
      {saving && (
        <form className="popover" onSubmit={(e) => (e.preventDefault(), save(name))}>
          <input autoFocus placeholder={t("Preset name")} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" type="submit">{t("Save")}</button>
        </form>
      )}
      {open && (
        <div className="popover list">
          <button className="item new" onClick={() => (onNew(), setOpen(false))}>
            {t("✦ New (defaults)")}
          </button>
          {list.length === 0 && <div className="empty">{t("No presets yet")}</div>}
          {list.map((p) => (
            <div key={p.name} className={`item ${p.name === current ? "on" : ""}`}>
              <button
                className="item-main"
                onClick={async () => {
                  try {
                    const r = await api.loadPreset<T>(kind, p.name);
                    onLoad(p.name, r.data);
                    setOpen(false);
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                <span>{p.name}</span>
                <small>{new Date(p.updated).toLocaleString(useStore.getState().lang)}{p.owner ? ` · ${p.owner}` : ""}</small>
              </button>
              {canChange(p.owner_id) && <button
                className="item-del"
                title={t("Delete")}
                onClick={async () => {
                  if (!confirm(t("Delete preset “{name}”?", { name: p.name }))) return;
                  await api.deletePreset(kind, p.name).catch((e) => toast(e.message, "error"));
                  refresh();
                }}
              >
                ✕
              </button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
