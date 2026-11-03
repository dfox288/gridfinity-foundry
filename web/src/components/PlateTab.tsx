import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { bambuProject, download, fileName, type ParamValue } from "../api";
import { grid } from "../lib/grid";
import { toStl } from "../lib/stl";
import { usePlate } from "../lib/usePlate";
import { filamentName } from "../lib/bambu";
import { useT } from "../lib/i18n";
import { useStore, value } from "../store";
import { ParamPanel } from "./ParamPanel";
import { PlateMesh, plateLayout } from "./PlateMesh";
import { PresetBar } from "./PresetBar";
import { PrinterPicker } from "./PrinterPicker";
import { fitView, Scene, type Controls } from "./Scene";
import { ViewButtons } from "./ViewButtons";

export function PlateTab() {
  const { schema, plate, platePreset, theme, set, setPlateParam, toast } = useStore();
  const [saved, setSaved] = useState("{}");
  const [explode, setExplode] = useState(0.35);
  const [colorParts, setColorParts] = useState(true);
  const [labels, setLabels] = useState(true);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const controls = useRef<Controls>(null);
  const state = usePlate(plate, schema.length > 0);
  const layout = useMemo(() => plateLayout(state.segments, null), [state.segments]);
  const v = (n: string) => value(plate, schema, n);
  const g = grid(v);
  const bed = v("bed_size") as number[] | undefined;

  // frame the plate when it first appears and when its size changes
  const sizeKey = layout.box.isEmpty() ? "" : layout.box.getSize(layout.box.min.clone()).toArray().map(Math.round).join();
  useEffect(() => {
    if (sizeKey) fitView(controls.current, viewBox(), "iso");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeKey]);

  const exportBambu = async (split: boolean) => {
    setBusy(true);
    try {
      const st = useStore.getState();
      const r = await bambuProject({ name: platePreset ?? "baseplate", split, printer: st.printer, bins: [], parts: [], plate: { params: plate, filament: filamentName("PLA Basic · Gray", st.lang), color: "#8E9089" } });
      download(r.blob, fileName(platePreset, "baseplate", split ? "zip" : "3mf", split ? "bambu-plates" : ""));
      toast(t("Bambu Studio project: {n} plates", { n: r.plates }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  // the plate as shown: the assembled box grown by the exploded spacing
  const viewBox = () => {
    const cols = Math.max(0, ...state.segments.map((s) => s.col)), rows = Math.max(0, ...state.segments.map((s) => s.row));
    return layout.box.clone().expandByVector(new THREE.Vector3((cols * explode * 28) / 2, (rows * explode * 28) / 2, 0));
  };
  const dirty = JSON.stringify(plate) !== saved;
  const fmt = (t: number[]) => {
    const whole = t.filter((x) => x === 1).length, rest = t.filter((x) => x !== 1);
    return rest.length ? `${whole} + ${rest.map((x) => x.toFixed(2).replace(/0+$/, "")).join(" + ")}` : `${whole}`;
  };

  return (
    <div className="workspace">
      <aside className="sidebar">
        <PresetBar<Record<string, ParamValue>>
          kind="plate"
          current={platePreset}
          dirty={dirty}
          getData={() => plate}
          onLoad={(name, data) => {
            set({ plate: data ?? {}, platePreset: name });
            setSaved(JSON.stringify(data ?? {}));
          }}
          onNew={() => {
            set({ plate: {}, platePreset: null });
            setSaved("{}");
          }}
        />
        <PrinterPicker />
        <ParamPanel schema={schema} over={plate} onChange={setPlateParam} />
      </aside>
      <main className="stage">
        <Scene theme={theme} controlsRef={controls}>
          {state.segments.length > 0 && (
            <PlateMesh segments={state.segments} layout={layout} explode={explode} colorParts={colorParts} labels={labels} baseColor={theme === "dark" ? "#9aa7b8" : "#b8c2cf"} />
          )}
        </Scene>
        <ViewButtons onView={(view) => fitView(controls.current, viewBox(), view)} name={platePreset} fallback="baseplate" />
        {state.loading && <div className="spinner" title={t("Rendering…")} />}
        {state.error && <div className="stage-error">{state.error}</div>}
        <div className="hud">
          <div className="card stats">
            <div className="stat">
              <span>{t("Plate")}</span>
              <b>{g.size[0]} × {g.size[1]} mm</b>
            </div>
            <div className="stat">
              <span>{t("Cells")}</span>
              <b>{fmt(g.traceX)} × {fmt(g.traceY)}</b>
            </div>
            <div className="stat">
              <span>{t("Pieces")}</span>
              <b>{state.segments.length || "–"}</b>
              {bed && <small>{t("bed")} {bed[0]} × {bed[1]}</small>}
            </div>
            <div className="stat">
              <span>{t("Render")}</span>
              <b>{state.ms ? `${state.ms} ms` : "–"}</b>
              <small>{state.cached ? t("cached") : t("{n}k triangles", { n: (state.triangles / 1000).toFixed(0) })}</small>
            </div>
          </div>
          <div className="card controls">
            <label className="slider">
              <span>{t("Explode")}</span>
              <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
            </label>
            <div className="toggles">
              <button className={`chip ${colorParts ? "on" : ""}`} onClick={() => setColorParts(!colorParts)}>{t("Colours")}</button>
              <button className={`chip ${labels ? "on" : ""}`} onClick={() => setLabels(!labels)}>{t("Numbers")}</button>
            </div>
          </div>
          <div className="card downloads">
            <button className="primary" disabled={!state.segments.length || busy} onClick={() => exportBambu(false)}>
              {busy ? t("Packing…") : t("Bambu project, all plates (.3mf)")}
            </button>
            <button className="ghost" disabled={!state.segments.length || busy} onClick={() => exportBambu(true)}>
              {t("Bambu: one file per plate (.zip)")}
            </button>
            <button className="ghost" disabled={!state.segments.length} onClick={() => download(toStl(state.segments.map((s) => s.pos)), fileName(platePreset, "baseplate", "stl", "all-pieces"))}>
              {t("All pieces (.stl)")}
            </button>
            <div className="piece-list">
              {state.segments.map((s) => (
                <button key={s.index} className="chip" title={`${(s.max.x - s.min.x).toFixed(1)} × ${(s.max.y - s.min.y).toFixed(1)} mm`}
                  onClick={() => download(toStl([s.pos]), fileName(platePreset, "baseplate", "stl", `piece-${s.index + 1}`))}>
                  {s.index + 1}
                </button>
              ))}
            </div>
            <button
              className="ghost"
              onClick={() => {
                const s = useStore.getState();
                s.set({ layout: { ...s.layout, plate: { ...plate } }, tab: "layout" });
                toast(t("Plate settings copied to the layout"));
              }}
            >
              {t("Use for a layout →")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
