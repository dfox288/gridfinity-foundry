import { useState } from "react";
import type { BinFile } from "../api";
import { BAMBU, filamentName } from "../lib/bambu";
import { translate, useT } from "../lib/i18n";
import { HeightPicker } from "./HeightPicker";
import { useStore } from "../store";
import type { PartLine } from "../store";

export const PART_DEFAULT: [string, string] = ["PLA Basic · Jade White", "#FFFFFF"];
const CATEGORIES = ["Divider", "Tab divider", "Flex label", "Corner label", "Lip plug (v1 bins)", "Glue label (v1 bins)"];

export function partName(p: BinFile | undefined, file = "") {
  if (!p) return file.split("/").pop() ?? file;
  const t = (en: string) => translate(useStore.getState().lang, en);
  switch (p.category) {
    case "Divider": return `${t("Divider")} ${p.d}×${p.h}U`;
    case "Tab divider": return `${t("Tab divider")} ${p.d}×${p.h}U`;
    case "Flex label": return `${t("Flex label")} ${p.w} · fit ${p.fit}`;
    case "Corner label": return `${t("Corner label")} ${p.w} ${t(p.side ?? "")}`;
    case "Lip plug (v1 bins)": return `${t("Lip plug")} ${p.w} · fit ${p.fit}`;
    case "Glue label (v1 bins)": return `${t("Glue label")} ${p.w} ${t(p.side ?? "")}`;
    default: return p.name ?? file;
  }
}

// the library of loose parts: pick a category, add one with +
export function PartsLibrary({ parts, onAdd }: { parts: BinFile[]; onAdd: (file: string) => void }) {
  const t = useT();
  const cats = CATEGORIES.filter((c) => parts.some((p) => p.category === c));
  const [cat, setCat] = useState(cats[0] ?? "Divider");
  const [h, setH] = useState<number | null>(6);
  const tall = cat.includes("ivider");
  const list = parts
    .filter((p) => p.category === cat && (!tall || h === null || p.h === h))
    .sort((a, b) => (a.w ?? 0) - (b.w ?? 0) || (a.d ?? 0) - (b.d ?? 0) || (a.h ?? 0) - (b.h ?? 0) || (a.fit ?? 0) - (b.fit ?? 0) || (a.side ?? "").localeCompare(b.side ?? ""));
  return (
    <div className="library">
      <div className="lib-filters">
        <select className="part-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
          {cats.map((c) => (
            <option key={c} value={c}>{t(c)}</option>
          ))}
        </select>
        {tall && (
          <HeightPicker value={h} onChange={setH} toggle />
        )}
      </div>
      <div className="part-list">
        {list.map((p) => (
          <button key={p.file} className="part-item" onClick={() => onAdd(p.file)} title={p.file}>
            <span>{partName(p)}</span>
            <b>+</b>
          </button>
        ))}
      </div>
      {cat.includes("v1") && <p className="hint">{t("For the old light bins without ribs or groove.")}</p>}
      {cat === "Tab divider" && <p className="hint">{t("With a corner label in bins 3+ cells wide.")}</p>}
    </div>
  );
}

// the parts rows of the print list
export function PartRows({ lines, lib, onChange }: { lines: PartLine[]; lib: Map<string, BinFile>; onChange: (l: PartLine[]) => void }) {
  const lang = useStore((s) => s.lang);
  return (
    <>
      {lines.map((l, i) => (
        <div key={l.file} className="bom-row">
          <span className="dot" style={{ background: l.filament[1] }} />
          <span className="bom-name">
            {partName(lib.get(l.file), l.file)}
            <small>
              <select
                className="inline-select"
                value={l.filament[0]}
                onChange={(e) => {
                  const [mat, name] = e.target.value.split(" · ");
                  const hit = BAMBU[mat]?.find((c) => c[0] === name);
                  if (hit) onChange(lines.map((x, j) => (j === i ? { ...x, filament: [e.target.value, hit[1]] } : x)));
                }}
              >
                {Object.entries(BAMBU).map(([mat, cs]) => (
                  <optgroup key={mat} label={mat}>
                    {cs.map(([name]) => (
                      <option key={name} value={`${mat} · ${name}`}>{filamentName(`${mat} · ${name}`, lang)}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </small>
          </span>
          <span className="stepper">
            <button onClick={() => onChange(l.count > 1 ? lines.map((x, j) => (j === i ? { ...x, count: x.count - 1 } : x)) : lines.filter((_, j) => j !== i))}>−</button>
            <b>{l.count}×</b>
            <button onClick={() => onChange(lines.map((x, j) => (j === i ? { ...x, count: x.count + 1 } : x)))}>+</button>
          </span>
        </div>
      ))}
    </>
  );
}

export function addPart(lines: PartLine[], file: string, n = 1): PartLine[] {
  const i = lines.findIndex((l) => l.file === file);
  if (i >= 0) return lines.map((l, j) => (j === i ? { ...l, count: l.count + n } : l));
  return [...lines, { file, count: n, filament: PART_DEFAULT }];
}
