// The bin library in the layout sidebar: label system, kind, height and size filters, the sizes to click or drag onto
// the plate, community uploads, and "Fill gaps"
import { useRef, useState } from "react";
import { api, type BinFile } from "../api";
import { HEIGHT_COLORS, SYSTEM_COLORS } from "../lib/colors";
import { canChange, useStore } from "../store";
import { useT } from "../lib/i18n";
import { creatorName, uploadBins } from "../lib/upload";
import { HeightPicker } from "./HeightPicker";

export function Library({ armed, onArm, onFill, maxU }: { armed: string | null; onArm: (f: string | null) => void; onFill: (bins: BinFile[], max: [number, number]) => void; maxU?: number }) {
  const bins = useStore((s) => s.bins);
  useStore((s) => s.me);   // re-render on sign-in (canChange)
  const t = useT();
  const [system, setSystem] = useState("groove");
  const [kind, setKind] = useState("hex");
  const [h, setH] = useState(6);
  const [fw, setFw] = useState<number | null>(null);
  const [fd, setFd] = useState<number | null>(null);
  const [fillMax, setFillMax] = useState("2x2");
  const all = bins.filter((b) => b.type === "bin");
  const systems = [...new Set([...all.map((b) => b.system!), "community"])];
  const community = system === "community";
  const [creator, setCreator] = useState(creatorName());
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const widths = [...new Set(all.map((b) => b.w))].sort((a, b) => a - b);
  const depths = [...new Set(all.map((b) => b.d))].sort((a, b) => a - b);
  const list = all
    .filter((b) => b.system === system && (community || (b.kind === kind && b.h === h)))
    // a size filter matches either way round (a bin can be turned)
    .filter((b) => (fw === null || b.w === fw || b.d === fw) && (fd === null || b.d === fd || b.w === fd) && (fw === null || fd === null || (b.w === fw && b.d === fd) || (b.w === fd && b.d === fw)))
    .sort((a, b) => a.w * a.d - b.w * b.d || a.w - b.w);
  return (
    <div className="library">
      <div className="lib-filters">
        <div className="seg small">
          {systems.map((s) => (
            <button key={s} className={s === system ? "on" : ""} onClick={() => setSystem(s)}>{t(s)}</button>
          ))}
        </div>
        {!community && (
          <>
            <div className="seg small">
              {["hex", "solid"].map((k) => (
                <button key={k} className={k === kind ? "on" : ""} onClick={() => setKind(k)}>{t(k)}</button>
              ))}
            </div>
            <HeightPicker value={h} onChange={(x) => x !== null && setH(x)} maxU={maxU} />
          </>
        )}
      </div>
      {community && (
        <div
          className={`dropzone ${over ? "over" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) uploadBins(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
        >
          <b>{t("Drop STL files here")}</b>
          <span>{t("or click to choose · also onto the plate")}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".stl"
            multiple
            hidden
            onChange={(e) => (e.target.files && uploadBins(e.target.files), (e.target.value = ""))}
          />
          <input
            className="creator"
            placeholder={t("Your name (shown with your bins)")}
            value={creator}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setCreator(e.target.value);
              try {
                localStorage.setItem("creator", e.target.value);
              } catch {
                /* storage blocked */
              }
            }}
          />
        </div>
      )}
      <div className="size-filter">
        <span>W</span>
        <button className={fw === null ? "on" : ""} onClick={() => setFw(null)}>{t("all")}</button>
        {widths.map((x) => (
          <button key={x} className={fw === x ? "on" : ""} onClick={() => setFw(fw === x ? null : x)}>{x}</button>
        ))}
      </div>
      <div className="size-filter">
        <span>D</span>
        <button className={fd === null ? "on" : ""} onClick={() => setFd(null)}>{t("all")}</button>
        {depths.map((x) => (
          <button key={x} className={fd === x ? "on" : ""} onClick={() => setFd(fd === x ? null : x)}>{x}</button>
        ))}
      </div>
      <div className="lib-grid">
        {list.map((b) => {
          const s = 30 / Math.max(b.w, b.d, 2);
          return (
            <button
              key={b.file}
              className={`lib-item ${armed === b.file ? "on" : ""}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/bin", b.file);
                e.dataTransfer.effectAllowed = "copy";
                onArm(b.file);
              }}
              onClick={() => onArm(armed === b.file ? null : b.file)}
              title={b.name ? `${b.name}${b.creator ? " · " + b.creator : ""} · ${b.w}×${b.d}×${b.h}U${b.warning ? "\n⚠ " + b.warning : ""}` : b.file}
            >
              <svg viewBox="-17 -17 34 34" width="34" height="34">
                <rect x={(-b.w * s) / 2} y={(-b.d * s) / 2} width={b.w * s} height={b.d * s} rx={2} style={{ fill: community ? SYSTEM_COLORS.community[0] : HEIGHT_COLORS[b.h]?.[0] }} />
              </svg>
              <span>{b.w}×{b.d}{community ? `×${b.h}` : ""}{b.warning ? " ⚠" : ""}</span>
              {community && <small className="lib-name">{b.name}</small>}
              {community && canChange(b.owner_id) && (
                <span
                  className="lib-del"
                  title={t("Delete")}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(t("Delete “{name}” for everyone?", { name: b.name ?? "" }))) return;
                    await api.deleteUpload(b.file);
                    useStore.getState().set({ bins: await api.bins() });
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}
        {list.length === 0 && <div className="empty">{t(community ? "No uploaded bins yet" : "No bins for this filter")}</div>}
      </div>
      {!community && maxU !== undefined && (
        <p className={`hint ${h > maxU ? "bad" : ""}`}>
          {maxU < 1 ? t("No bin fits under the drawer height") : h > maxU ? t("{h}U is too tall for this drawer: up to {max}U fit", { h, max: maxU }) : t("Up to {max}U fit this drawer", { max: maxU })}
        </p>
      )}
      {!community && (
        <div className="fill-row">
          <button className="ghost small" disabled={!list.length} onClick={() => onFill(list, fillMax.split("x").map(Number) as [number, number])} title={t("Fills every free spot with the biggest of these bins that fits; one undo takes it back")}>
            {t("Fill gaps")}
          </button>
          <select className="inline-select" value={fillMax} onChange={(e) => setFillMax(e.target.value)}>
            {["1x1", "2x1", "2x2", "3x2", "3x3", "6x6"].map((a) => (
              <option key={a} value={a}>{t("up to {size}", { size: a.replace("x", "×") })}</option>
            ))}
          </select>
        </div>
      )}
      <p className="hint">{t("Click a size, then click on the plate (or drag it there). R turns (also while dragging), F or a double-click zooms in, Shift-click selects more, ⌘A all, Del removes, arrows move, ⌘Z undoes.")}</p>
    </div>
  );
}
