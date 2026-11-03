import { fileName } from "../api";
import { useT } from "../lib/i18n";

// Camera presets and a PNG snapshot of the canvas
export function ViewButtons({ onView, name = null, fallback = "gridfinity" }: { onView: (v: "iso" | "top" | "front") => void; name?: string | null; fallback?: string }) {
  const t = useT();
  const snap = () => {
    const c = document.querySelector<HTMLCanvasElement>(".stage canvas");
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = fileName(name, fallback, "png");
    a.click();
  };
  return (
    <div className="views">
      <button onClick={() => onView("iso")} title={t("Isometric (1)")}>{t("Iso")}</button>
      <button onClick={() => onView("top")} title={t("Top (2)")}>{t("Top")}</button>
      <button onClick={() => onView("front")} title={t("Front (3)")}>{t("Front")}</button>
      <button onClick={snap} title={t("Save a picture")}>◉</button>
    </div>
  );
}
