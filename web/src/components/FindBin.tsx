// Find a bin by its label in every drawer of the project ("where are the M3 nuts?"): a match switches to its drawer
// and selects the bin.
import { useState } from "react";
import { useT } from "../lib/i18n";
import { project, switchDrawer, useStore } from "../store";

export function FindBin() {
  const t = useT();
  const { drawers, active, layout, set } = useStore();
  const [q, setQ] = useState("");
  const all = drawers.map((d, i) => (i === active ? { ...d, layout } : d));
  if (!all.some((d) => d.layout.bins.some((b) => b.label))) return null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? all.flatMap((d, i) =>
        d.layout.bins.filter((b) => b.label && words.every((w) => b.label!.toLowerCase().includes(w))).map((b) => ({ drawer: i, name: d.name, id: b.id, label: b.label! })),
      )
    : [];
  return (
    <div className="card find">
      <input type="search" value={q} placeholder={t("Find a bin by its label…")} onChange={(e) => setQ(e.target.value)} />
      {words.length > 0 && (
        <div className="find-hits">
          {hits.length === 0 && <span className="empty">{t("Nothing found")}</span>}
          {hits.slice(0, 12).map((h) => (
            <button
              key={`${h.drawer}|${h.id}`}
              className={`find-hit ${h.drawer === active ? "here" : ""}`}
              onClick={() => {
                if (h.drawer !== project().active) switchDrawer(h.drawer);
                set({ selected: h.id });
              }}
            >
              <b>{h.label}</b>
              {all.length > 1 && <span>{h.name}</span>}
            </button>
          ))}
          {hits.length > 12 && <span className="empty">{t("{n} more", { n: hits.length - 12 })}</span>}
        </div>
      )}
    </div>
  );
}
