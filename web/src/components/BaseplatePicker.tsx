import { useEffect, useState } from "react";
import { api, type ParamValue, type PresetInfo } from "../api";
import { FURNITURE } from "../lib/furniture";
import { furnitureFor, furnitureSub, withFurniture } from "../lib/furniture-presets";
import { useT } from "../lib/i18n";
import { useStore, type Drawer } from "../store";

export interface PlatePick {
  plate: Record<string, ParamValue>;
  furniture?: string;
  plateFrom?: string;
  plateFromData?: string;
}

// The drawer's baseplate: a furniture drawer (sets the size, keeps the options) or a saved baseplate preset (copied:
// size and options; the drawer remembers the name and shows when it was changed since).
export function BaseplatePicker({ drawer, plate, onPick }: { drawer?: Drawer; plate: Record<string, ParamValue>; onPick: (p: PlatePick) => void }) {
  const t = useT();
  const toast = useStore((s) => s.toast);
  const [saved, setSaved] = useState<PresetInfo[]>([]);
  const refresh = () => api.presets("plate").then(setSaved).catch(() => setSaved([]));
  useEffect(() => void refresh(), []);

  const value = drawer?.plateFrom ? `p:${drawer.plateFrom}` : drawer?.furniture ? `f:${drawer.furniture}` : "";
  const f = FURNITURE.find((x) => x.id === drawer?.furniture);
  const changed = drawer?.plateFrom
    ? JSON.stringify(plate) !== drawer.plateFromData
    : !!f && furnitureFor(plate.plate_size)?.id !== f.id;

  const pick = async (v: string) => {
    if (v.startsWith("f:")) {
      const g = FURNITURE.find((x) => x.id === v.slice(2))!;
      onPick({ plate: withFurniture(plate, g), furniture: g.id });
      toast(t("Measure yours: {note}", { note: t(g.note) }));
    } else if (v.startsWith("p:")) {
      try {
        const r = await api.loadPreset<Record<string, ParamValue>>("plate", v.slice(2));
        const data = r.data ?? {};
        onPick({ plate: data, furniture: furnitureFor(data.plate_size)?.id, plateFrom: r.name, plateFromData: JSON.stringify(data) });
      } catch (e) {
        toast((e as Error).message, "error");
      }
    } else onPick({ plate });
  };

  return (
    <div className="baseplate-pick">
      <select aria-label={t("Baseplate")} value={value} onFocus={refresh} onChange={(e) => pick(e.target.value)}>
        <option value="">{t("Own size")}</option>
        <optgroup label={t("Furniture drawers")}>
          {FURNITURE.map((g) => (
            <option key={g.id} value={`f:${g.id}`}>{`${t(g.name)} · ${furnitureSub(g)}`}</option>
          ))}
        </optgroup>
        {saved.length > 0 && (
          <optgroup label={t("Saved baseplates")}>
            {saved.map((p) => (
              <option key={p.name} value={`p:${p.name}`}>{p.name}</option>
            ))}
          </optgroup>
        )}
        {drawer?.plateFrom && !saved.some((p) => p.name === drawer.plateFrom) && <option value={`p:${drawer.plateFrom}`}>{drawer.plateFrom}</option>}
      </select>
      {changed && <small className="changed" title={t("Changed in this drawer since it was picked")}>{t("changed")}</small>}
    </div>
  );
}
