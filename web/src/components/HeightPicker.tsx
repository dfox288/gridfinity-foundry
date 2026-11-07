import { useT } from "../lib/i18n";
import { useStore } from "../store";
import { Select } from "./Select";

const QUICK = [3, 6, 9];

// bin height in units: the usual three as buttons, every other height the catalog has in a list
// maxU: the tallest height that fits the drawer (its inner height is set); taller ones are marked
export function HeightPicker({ value, onChange, toggle = false, maxU }: { value: number | null; onChange: (h: number | null) => void; toggle?: boolean; maxU?: number }) {
  const t = useT();
  const heights = useStore((s) => s.heights);
  const more = heights.filter((h) => !QUICK.includes(h));
  return (
    <div className="seg small">
      {QUICK.map((x) => (
        <button
          key={x}
          className={`${x === value ? "on" : ""} ${maxU !== undefined && x > maxU ? "too-tall" : ""}`}
          title={maxU !== undefined && x > maxU ? t("Too tall for the drawer") : undefined}
          onClick={() => onChange(toggle && value === x ? null : x)}
        >
          {x}U
        </button>
      ))}
      {more.length > 0 && (
        <Select
          className={`seg-select ${value !== null && more.includes(value) ? "on" : ""}`}
          value={value !== null && more.includes(value) ? String(value) : ""}
          placeholder={t("more")}
          onChange={(v) => onChange(Number(v))}
          title={t("Taller bins are made when first needed (about a second each)")}
          options={more.map((x) => ({ value: String(x), label: maxU !== undefined && x > maxU ? `${x}U ✕` : `${x}U` }))}
        />
      )}
    </div>
  );
}
