import { useT } from "../lib/i18n";
import { useStore } from "../store";

const QUICK = [3, 6, 9];

// bin height in units: the usual three as buttons, every other height the catalog has in a list
export function HeightPicker({ value, onChange, toggle = false }: { value: number | null; onChange: (h: number | null) => void; toggle?: boolean }) {
  const t = useT();
  const heights = useStore((s) => s.heights);
  const more = heights.filter((h) => !QUICK.includes(h));
  return (
    <div className="seg small">
      {QUICK.map((x) => (
        <button key={x} className={x === value ? "on" : ""} onClick={() => onChange(toggle && value === x ? null : x)}>{x}U</button>
      ))}
      {more.length > 0 && (
        <select
          className={`seg-select ${value !== null && more.includes(value) ? "on" : ""}`}
          value={value !== null && more.includes(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          title={t("Taller bins are made when first needed (about a second each)")}
        >
          <option value="" disabled>{t("more")}</option>
          {more.map((x) => (
            <option key={x} value={x}>{x}U</option>
          ))}
        </select>
      )}
    </div>
  );
}
