// "From your inventory": paste a list or upload a CSV (template to download), check the suggested bin per line, then
// have them placed in the drawer; what does not fit can go into a new drawer of the same size.
import { useRef, useState } from "react";
import { download } from "../api";
import { useT } from "../lib/i18n";
import { inventoryTemplate, parseInventory, type InvRow } from "../lib/inventory";
import { useStore } from "../store";
import { Select } from "./Select";

export function Inventory({ onPlace, onNewDrawer }: { onPlace: (rows: InvRow[]) => InvRow[]; onNewDrawer: (rows: InvRow[]) => InvRow[] }) {
  const t = useT();
  const { bins, heights, lang } = useStore();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<InvRow[] | null>(null);
  const [left, setLeft] = useState<InvRow[]>([]);
  const file = useRef<HTMLInputElement>(null);
  // the sizes the groove bins come in, long side first
  const sizes = [...new Set(bins.filter((b) => b.type === "bin" && b.system === "groove").map((b) => `${b.w}x${b.d}`))].sort(
    (a, b) => a.split("x").reduce((p, q) => p * +q, 1) - b.split("x").reduce((p, q) => p * +q, 1) || a.localeCompare(b),
  );
  const suggest = (s: string) => {
    const r = parseInventory(s);
    setRows(r.length ? r : null);
    setLeft([]);
  };
  const edit = (i: number, patch: Partial<InvRow>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch, guessed: false } : r)));

  return (
    <div className="inventory">
      <p className="hint">{t("Paste what you want to store, one thing per line (e.g. “M3 screws 200”), or upload a CSV.")}</p>
      <textarea rows={4} value={text} placeholder={"M3 screws 200\nPliers\nUSB cables\nSoldering iron 25 cm"} onChange={(e) => setText(e.target.value)} />
      <div className="row-btns">
        <button className="ghost small" disabled={!text.trim()} onClick={() => suggest(text)}>{t("Suggest bins")}</button>
        <button className="ghost small" onClick={() => file.current?.click()}>{t("Upload CSV")}</button>
        <button className="ghost small" onClick={() => download(new Blob([inventoryTemplate(lang)], { type: "text/csv" }), lang === "de" ? "inventar-vorlage.csv" : "inventory-template.csv")}>
          {t("CSV template")}
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const s = await f.text();
            setText(s);
            suggest(s);
            e.target.value = "";
          }}
        />
      </div>
      {rows && (
        <>
          <table className="inv-table">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.guessed ? "guessed" : ""}>
                  <td>
                    <input value={r.item} maxLength={40} onChange={(e) => edit(i, { item: e.target.value })} title={r.count ? `${r.count}×` : undefined} />
                  </td>
                  <td>
                    <Select
                      ariaLabel={t("Size")}
                      value={`${r.w}x${r.d}`}
                      onChange={(v) => { const [w, d] = v.split("x").map(Number); edit(i, { w, d }); }}
                      options={[...(sizes.includes(`${r.w}x${r.d}`) ? [] : [{ value: `${r.w}x${r.d}`, label: `${r.w}×${r.d} ?` }]), ...sizes.map((s) => ({ value: s, label: s.replace("x", "×") }))]}
                    />
                  </td>
                  <td>
                    <Select ariaLabel={t("Height")} value={String(r.h)} onChange={(v) => edit(i, { h: +v })} options={heights.map((h) => ({ value: String(h), label: `${h}U` }))} />
                  </td>
                  <td>
                    <button className="icon-x" title={t("Remove")} onClick={() => setRows((rs) => (rs && rs.length > 1 ? rs.filter((_, j) => j !== i) : null))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{t("Grey rows are guesses: check size and height.")}</p>
          <button
            className="primary small"
            onClick={() => {
              setLeft(onPlace(rows));
              setRows(null);
            }}
          >
            {t("Place {n} bins in this drawer", { n: rows.length })}
          </button>
        </>
      )}
      {left.length > 0 && (
        <div className="inv-left">
          <span>{t("{n} did not fit: {items}", { n: left.length, items: left.slice(0, 3).map((r) => r.item).join(", ") + (left.length > 3 ? " …" : "") })}</span>
          <button className="ghost small" onClick={() => setLeft(onNewDrawer(left))}>{t("Into a new drawer")}</button>
        </div>
      )}
    </div>
  );
}
