import { useT } from "../lib/i18n";
import { useStore } from "../store";

// The Bambu printer (Bambu Studio's system presets): sets the print bed of the baseplate and of the layout, and is the
// printer the Bambu project opens with
export function PrinterPicker() {
  const { printers, printer, set, setPlateParam, setLayoutPlate } = useStore();
  const t = useT();
  if (!printers.length) return null;
  const models = [...new Set(printers.map((p) => p.model))];
  return (
    <label className="printer">
      <span>{t("Printer")}</span>
      <select
        value={printer}
        onChange={(e) => {
          const p = printers.find((x) => x.id === e.target.value);
          if (!p) return;
          set({ printer: p.id });
          try {
            localStorage.setItem("printer", p.id);
          } catch {
            /* storage blocked */
          }
          setPlateParam("bed_size", p.bed);
          setLayoutPlate("bed_size", p.bed);
        }}
      >
        {models.map((m) => (
          <optgroup key={m} label={m.replace("Bambu Lab ", "")}>
            {printers
              .filter((p) => p.model === m)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {`${m.replace("Bambu Lab ", "")} · ${p.nozzle} mm · ${p.bed[0]} × ${p.bed[1]}${p.extruders > 1 ? " · 2 " + t("nozzles") : ""}`}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
