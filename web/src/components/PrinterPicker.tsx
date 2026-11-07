import { useT } from "../lib/i18n";
import { useStore } from "../store";
import { Select } from "./Select";

// The Bambu printer (Bambu Studio's system presets): sets the print bed of the baseplate and of the layout, and is the
// printer the Bambu project opens with
export function PrinterPicker() {
  const { printers, printer, set, setPlateParam, setLayoutPlate } = useStore();
  const t = useT();
  if (!printers.length) return null;
  const models = [...new Set(printers.map((p) => p.model))];
  return (
    <div className="printer">
      <span>{t("Printer")}</span>
      <Select
        ariaLabel={t("Printer")}
        value={printer}
        onChange={(id) => {
          const p = printers.find((x) => x.id === id);
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
        options={models.flatMap((m) =>
          printers
            .filter((p) => p.model === m)
            .map((p) => ({
              value: p.id,
              group: m.replace("Bambu Lab ", ""),
              label: `${m.replace("Bambu Lab ", "")} · ${p.nozzle} mm · ${p.bed[0]} × ${p.bed[1]}${p.extruders > 1 ? " · 2 " + t("nozzles") : ""}`,
            })),
        )}
      />
    </div>
  );
}
