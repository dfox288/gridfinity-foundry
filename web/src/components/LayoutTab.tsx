import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { api, bambuProject, download, fileName, type BinFile, type ParamValue } from "../api";
import { grid, PITCH, type Grid } from "../lib/grid";
import { usePlate } from "../lib/usePlate";
import { fmtGrams, grams, metres, useVolumes } from "../lib/filament";
import { meshVolume } from "../lib/stl";
import { fill } from "../lib/fill";
import { drawerMapHtml } from "../lib/drawerMap";
import { EXAMPLES, exampleProject } from "../lib/examples";
import { canChange, DEFAULT_LAYOUT, loadProject, newId, project, toProject, useStore, value, type Layout, type PartLine, type Placed } from "../store";
import { FURNITURE } from "../lib/furniture";
import { DrawerTabs } from "./DrawerTabs";
import { BAMBU, filamentName } from "../lib/bambu";
import { BinMesh } from "./BinMesh";
import { ParamPanel } from "./ParamPanel";
import { PlateMesh, plateLayout } from "./PlateMesh";
import { useT } from "../lib/i18n";
import { creatorName, uploadBins } from "../lib/upload";
import { addPart, PART_DEFAULT, partName, PartRows, PartsLibrary } from "./Parts";
import { PresetBar } from "./PresetBar";
import { PrinterPicker } from "./PrinterPicker";
import { fitView, Scene, type Controls } from "./Scene";
import { HeightPicker } from "./HeightPicker";
import { ViewButtons } from "./ViewButtons";
import { FindBin } from "./FindBin";

const FLEX_FIT = 0.2;   // flex label press fit (mm, total): holds in every groove bin width

// default colours, all Bambu PLA Basic: [hex, name]
const HEIGHT_COLORS: Record<number, [string, string]> = {
  3: ["#0086D6", "Cyan"], 4: ["#00B1B7", "Turquoise"], 5: ["#00AE42", "Bambu Green"], 6: ["#FEC600", "Sunflower Yellow"],
  7: ["#FF9016", "Pumpkin Orange"], 8: ["#EC008C", "Magenta"], 9: ["#5E43B7", "Purple"], 10: ["#C12E1F", "Red"],
  11: ["#BECF00", "Bright Green"], 12: ["#FF6A13", "Orange"], 13: ["#F55A74", "Pink"], 14: ["#0056B8", "Cobalt Blue"],
  15: ["#3F8E43", "Mistletoe Green"], 16: ["#9D432C", "Brown"], 17: ["#482960", "Indigo Purple"], 18: ["#9D2235", "Maroon Red"],
};
const SYSTEM_COLORS: Record<string, [string, string]> = { groove: ["#0056B8", "Cobalt Blue"], click: ["#FF6A13", "Orange"], community: ["#00AE42", "Bambu Green"] };
const PLATE_DEFAULT: [string, string] = ["PLA Basic · Gray", "#8E9089"];
const SEAT = 4.4;   // a bin's bottom below the plate top

type Cand = { file: string; x: number; y: number; rot: 0 | 1 };

const fp = (b: BinFile, rot: 0 | 1) => (rot ? [b.d, b.w] : [b.w, b.d]);
const whole = (b: BinFile) => Number.isInteger(b.w) && Number.isInteger(b.d);

function fits(c: Cand, info: BinFile, g: Grid, bins: Placed[], lib: Map<string, BinFile>, ignore?: string) {
  const [w, d] = fp(info, c.rot);
  const e = 1e-6;
  if (c.x < -e || c.y < -e || c.x + w > g.cellsX + e || c.y + d > g.cellsY + e) return false;
  if (whole(info) && (!Number.isInteger(c.x) || !Number.isInteger(c.y))) return false;   // full-pitch feet sit on whole cells
  for (const o of bins) {
    if (o.id === ignore) continue;
    const oi = lib.get(o.file);
    if (!oi) continue;
    const [ow, od] = fp(oi, o.rot);
    if (c.x < o.x + ow - e && o.x < c.x + w - e && c.y < o.y + od - e && o.y < c.y + d - e) return false;
  }
  return true;
}

function snap(px: number, py: number, info: BinFile, rot: 0 | 1, g: Grid): [number, number] {
  const [w, d] = fp(info, rot);
  const step = whole(info) ? 1 : 2;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(0, max));
  return [
    clamp(Math.round((px / PITCH - w / 2) * step) / step, Math.floor((g.cellsX - w) * step) / step),
    clamp(Math.round((py / PITCH - d / 2) * step) / step, Math.floor((g.cellsY - d) * step) / step),
  ];
}

// a bin's colour and the filament it stands for
function binColor(b: Placed, info: BinFile | undefined, mode: Layout["colorMode"]): [string, string] {
  if (mode === "custom" && b.color) return [b.color, b.filament ?? ""];
  const c = mode === "system" ? SYSTEM_COLORS[info?.system ?? ""] : HEIGHT_COLORS[info?.h ?? 6];
  return c ? [c[0], `PLA Basic · ${c[1]}`] : ["#94a3b8", ""];
}

// Registers a function that turns screen coordinates into a point on the plate's top plane
function PointerBridge({ z, onReady }: { z: number; onReady: (f: (x: number, y: number) => THREE.Vector3 | null) => void }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    onReady((cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    });
  }, [camera, gl, z, onReady]);
  return null;
}

function GridLines({ g, z, dark }: { g: Grid; z: number; dark: boolean }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const xs = [0], ys = [0];
    g.traceX.forEach((t) => xs.push(xs[xs.length - 1] + t));
    g.traceY.forEach((t) => ys.push(ys[ys.length - 1] + t));
    for (const x of xs) pts.push(x * PITCH, 0, z, x * PITCH, ys[ys.length - 1] * PITCH, z);
    for (const y of ys) pts.push(0, y * PITCH, z, xs[xs.length - 1] * PITCH, y * PITCH, z);
    const b = new THREE.BufferGeometry();
    b.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return b;
  }, [g, z]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={dark ? "#64748b" : "#475569"} transparent opacity={0.35} />
    </lineSegments>
  );
}

function SelectionFrame({ x, y, w, d, z, h }: { x: number; y: number; w: number; d: number; z: number; h: number }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w * PITCH + 2, d * PITCH + 2, h + 2)), [w, d, h]);
  return (
    <lineSegments geometry={geo} position={[(x + w / 2) * PITCH, (y + d / 2) * PITCH, z + h / 2]}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.9} />
    </lineSegments>
  );
}

function Library({ armed, onArm, onFill }: { armed: string | null; onArm: (f: string | null) => void; onFill: (bins: BinFile[], max: [number, number]) => void }) {
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
            <HeightPicker value={h} onChange={(x) => x !== null && setH(x)} />
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
      <p className="hint">{t("Click a size, then click on the plate (or drag it there). R turns, Del removes, arrows move, ⌘Z undoes.")}</p>
    </div>
  );
}

export function LayoutTab() {
  const { schema, bins: library, layout, layoutPreset, theme, selected, drawers, active, set, setLayoutPlate, editBins, undo, redo, toast } = useStore();
  const lib = useMemo(() => new Map(library.map((b) => [b.file, b])), [library]);
  const t = useT();
  const lang = useStore((s) => s.lang);
  const fn = (f: string) => filamentName(f, lang);
  const [saved, setSaved] = useState(() => JSON.stringify(toProject(DEFAULT_LAYOUT).drawers.map((d) => d.layout)));
  const [scope, setScope] = useState<"drawer" | "all">("drawer");
  const [showLabels, setShowLabels] = useState(true);
  const [armed, setArmed] = useState<string | null>(null);
  const [armedRot, setArmedRot] = useState<0 | 1>(0);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const controls = useRef<Controls>(null);
  const toPlane = useRef<((x: number, y: number) => THREE.Vector3 | null) | null>(null);

  const v = (n: string) => value(layout.plate, schema, n);
  const g = useMemo(() => grid(v), [layout.plate, schema]); // eslint-disable-line react-hooks/exhaustive-deps
  const plate = usePlate(layout.plate, schema.length > 0);
  const n4 = (name: string) => (v(name) as number[] | undefined) ?? [0, 0, 0, 0];
  const ea = n4("edge_adjust"), wall = n4("plate_wall_thickness");
  const pl = useMemo(
    () => plateLayout(plate.segments, [-(g.origin[0] + ea[3] + wall[3]), -(g.origin[1] + ea[2] + wall[2])]),
    [plate.segments, g, ea[3], ea[2], wall[3], wall[2]], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const top = pl.box.isEmpty() ? 4.65 : pl.box.max.z;
  const size = v("plate_size") as number[];
  const bed = v("bed_size") as number[];

  const frameBox = useMemo(() => {
    const b = pl.box.isEmpty() ? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(g.cellsX * PITCH, g.cellsY * PITCH, 5)) : pl.box.clone();
    return b.expandByPoint(new THREE.Vector3(b.max.x, b.max.y, 60));
  }, [pl.box, g]);
  // refit when the drawer size changes, and again when the new plate's mesh arrives (its box is then the new size)
  const sizeKey = `${size?.[0]}x${size?.[1]}|${Math.round(frameBox.max.x - frameBox.min.x)}x${Math.round(frameBox.max.y - frameBox.min.y)}`;
  useEffect(() => {
    const t = setTimeout(() => fitView(controls.current, frameBox, "iso"), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeKey, plate.segments.length > 0]);

  const armedInfo = armed ? lib.get(armed) : undefined;
  const ghost: Cand | null = drag
    ? (() => {
        const b = layout.bins.find((x) => x.id === drag.id);
        return b ? { file: b.file, x: drag.x, y: drag.y, rot: b.rot } : null;
      })()
    : armedInfo && hover
      ? (() => {
          const [x, y] = snap(hover[0], hover[1], armedInfo, armedRot, g);
          return { file: armedInfo.file, x, y, rot: armedRot };
        })()
      : null;
  const ghostOk = ghost ? fits(ghost, lib.get(ghost.file)!, g, layout.bins, lib, drag?.id) : false;

  const place = (c: Cand) => {
    const info = lib.get(c.file);
    if (!info || !fits(c, info, g, layout.bins, lib)) return false;
    const id = Math.random().toString(36).slice(2, 9);
    editBins((b) => [...b, { id, ...c }]);
    set({ selected: id });
    return true;
  };

  const centre = (b: { x: number; y: number; rot: 0 | 1 }, info: BinFile) => {
    const [w, d] = fp(info, b.rot);
    return new THREE.Vector3((b.x + w / 2) * PITCH, (b.y + d / 2) * PITCH, top - SEAT);
  };

  const selNow = () => layout.bins.find((b) => b.id === selected);
  const turn = () => {
    if (armed) return setArmedRot(armedRot ? 0 : 1);
    const sel = selNow();
    if (!sel) return;
    const c = { ...sel, rot: (sel.rot ? 0 : 1) as 0 | 1 };
    if (fits(c, lib.get(sel.file)!, g, layout.bins, lib, sel.id)) editBins((b) => b.map((x) => (x.id === sel.id ? c : x)));
    else toast(t("No room to turn it here"));
  };
  const copy = () => {
    const sel = selNow();
    if (!sel) return;
    // the next free spot for a copy, scanning from the bottom left
    const st = whole(lib.get(sel.file)!) ? 1 : 0.5;
    for (let y = 0; y <= g.cellsY; y += st)
      for (let x = 0; x <= g.cellsX; x += st) if (place({ file: sel.file, x, y, rot: sel.rot })) return;
    toast(t("No free spot for a copy"));
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
      if (mod && e.key.toLowerCase() === "y") return e.preventDefault(), redo();
      if (e.key === "1" || e.key === "2" || e.key === "3") return fitView(controls.current, frameBox, (["iso", "top", "front"] as const)[+e.key - 1]);
      if (e.key === "Escape") return setArmed(null), set({ selected: null });
      const sel = layout.bins.find((b) => b.id === selected);
      if (e.key === "r" || e.key === "R") return turn();
      if (!sel) return;
      if (e.key === "Delete" || e.key === "Backspace") return e.preventDefault(), editBins((b) => b.filter((x) => x.id !== sel.id)), set({ selected: null });
      const info = lib.get(sel.file)!;
      const step = whole(info) ? 1 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (mv[e.key]) {
        e.preventDefault();
        const c = { ...sel, x: sel.x + mv[e.key][0], y: sel.y + mv[e.key][1] };
        if (fits(c, info, g, layout.bins, lib, sel.id)) editBins((b) => b.map((x) => (x.id === sel.id ? c : x)));
      }
      if (mod && e.key.toLowerCase() === "d") return e.preventDefault(), copy();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // finish a drag anywhere
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const b = layout.bins.find((x) => x.id === drag.id);
      if (b && (b.x !== drag.x || b.y !== drag.y) && fits({ ...b, x: drag.x, y: drag.y }, lib.get(b.file)!, g, layout.bins, lib, b.id))
        editBins((bs) => bs.map((x) => (x.id === b.id ? { ...x, x: drag.x, y: drag.y } : x)));
      setDrag(null);
      if (controls.current) controls.current.enabled = true;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [drag, layout.bins, lib, g, editBins]);

  const onPlaneMove = (e: ThreeEvent<PointerEvent>) => {
    if (drag) {
      const b = layout.bins.find((x) => x.id === drag.id)!;
      const info = lib.get(b.file)!;
      const [x, y] = snap(e.point.x - drag.dx, e.point.y - drag.dy, info, b.rot, g);
      if (x !== drag.x || y !== drag.y) setDrag({ ...drag, x, y });
    } else setHover([e.point.x, e.point.y]);
  };

  // bill of materials
  const exportBambu = async (split: boolean) => {
                setBusy(true);
                try {
                  const name = layoutPreset ?? "layout";
                  const r = await bambuProject({
                    name,
                    split,
                    printer: useStore.getState().printer,
                    bins: bom.map(({ file, count, filament, color }) => ({ file, count, filament: fn(filament || "Filament"), color })),
                    parts: allParts.map((p) => ({ file: p.file, count: p.count, filament: fn(p.filament[0]), color: p.filament[1] })),
                    plate: null,
                    plates: plates.map((pl) => ({ ...pl, filament: fn(pl.filament) })),
                    labels: engraved.map((l) => ({ ...l, filament: fn(labelFilament[0]), color: labelFilament[1] })),
                  });
                  download(r.blob, fileName(layoutPreset, "layout", split ? "zip" : "3mf", split ? "bambu-plates" : ""));
                  toast(t("Bambu Studio project: {n} plates", { n: r.plates }));
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
  };

  // bill of materials: per bin file and colour
  // the drawers the print list and the downloads cover: this one, or all of the project
  const inScope = useMemo(
    () => (scope === "all" ? project().drawers : [{ ...drawers[active], layout }]),
    [scope, drawers, active, layout], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bom = useMemo(() => {
    const m = new Map<string, { file: string; count: number; info?: BinFile; color: string; filament: string; labels: string[] }>();
    for (const d of inScope)
      for (const b of d.layout.bins) {
        const info = lib.get(b.file);
        const [color, filament] = binColor(b, info, d.layout.colorMode);
        const k = `${b.file}|${color}`;
        const e = m.get(k) ?? { file: b.file, count: 0, info, color, filament, labels: [] };
        e.count++;
        if (b.label) e.labels.push(b.label);
        m.set(k, e);
      }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [inScope, lib]);
  const allParts = useMemo(() => {
    const m = new Map<string, PartLine>();
    for (const d of inScope)
      for (const p of d.layout.parts ?? []) {
        const k = `${p.file}|${p.filament[0]}`;
        const e = m.get(k);
        m.set(k, e ? { ...e, count: e.count + p.count } : { ...p });
      }
    return [...m.values()];
  }, [inScope]);
  // engraved flex labels for the labelled flex bins: one each, text as on the bin (fit 0.2: holds in every width)
  const [engrave, setEngrave] = useState(true);
  const engraved = useMemo(() => {
    const m = new Map<string, { w: number; fit: number; text: string; count: number }>();
    if (!engrave) return [];
    for (const d of inScope)
      for (const b of d.layout.bins) {
        const info = lib.get(b.file);
        if (!b.label || info?.system !== "groove") continue;
        const fit = FLEX_FIT;
        const k = `${info.w}|${fit}|${b.label}`;
        const e = m.get(k);
        m.set(k, e ? { ...e, count: e.count + 1 } : { w: info.w, fit, text: b.label, count: 1 });
      }
    return [...m.values()];
  }, [inScope, lib, engrave]);
  const labelFilament = PART_DEFAULT;
  const plates = inScope.map((d) => ({
    params: d.layout.plate as Record<string, ParamValue>,
    filament: (d.layout.plateFilament ?? PLATE_DEFAULT)[0],
    color: (d.layout.plateFilament ?? PLATE_DEFAULT)[1],
    label: inScope.length > 1 ? d.name : "",
  }));
  // filament estimate (solid volume -> grams); the baseplates of other drawers scale with their area from this one's
  const flexLabelFile = (w: number) => `labels/flex/print-flex-label-${w}_fit${FLEX_FIT}.stl`;
  const vols = useVolumes([...bom.map((b) => b.file), ...allParts.map((p) => p.file), ...engraved.map((l) => flexLabelFile(l.w))]);
  const plateVol = useMemo(() => plate.segments.reduce((a, sg) => a + meshVolume(sg.pos), 0), [plate.segments]);
  const area = (pl: Record<string, ParamValue>) => {
    const sz = (pl.plate_size as number[] | undefined) ?? size ?? [0, 0];
    return (sz[0] ?? 0) * (sz[1] ?? 0);
  };
  const plateGrams = (d: (typeof inScope)[number]) => {
    const own = area(layout.plate);
    if (!plateVol || !own) return 0;
    return grams((plateVol * area(d.layout.plate)) / own, (d.layout.plateFilament ?? PLATE_DEFAULT)[0]);
  };
  const est = (() => {
    let g = 0, mm3 = 0, missing = 0;
    const add = (file: string, count: number, filament?: string) => {
      const v = vols.get(file);
      if (v === undefined) return void missing++;
      g += grams(v, filament) * count;
      mm3 += v * count;
    };
    bom.forEach((b) => add(b.file, b.count, b.filament));
    allParts.forEach((p) => add(p.file, p.count, p.filament[0]));
    engraved.forEach((l) => add(flexLabelFile(l.w), l.count, labelFilament[0]));
    const own = area(layout.plate);
    for (const d of inScope) {
      if (!plateVol || !own) { missing++; continue; }
      const v = (plateVol * area(d.layout.plate)) / own;
      g += grams(v, (d.layout.plateFilament ?? PLATE_DEFAULT)[0]);
      mm3 += v;
    }
    return { g, m: metres(mm3), missing };
  })(); // cheap; recomputed each render so newly arrived volumes show
  const zipBins = useMemo(() => {
    const m = new Map<string, number>();
    bom.forEach((r) => m.set(r.file, (m.get(r.file) ?? 0) + r.count));
    return [...m.entries()].map(([file, count]) => ({ file, count }));
  }, [bom]);
  const [material, setMaterial] = useState("PLA Basic");
  const partLib = useMemo(() => library.filter((b) => b.type !== "bin"), [library]);
  const parts = layout.parts ?? [];
  const setParts = (lines: typeof parts) => set({ layout: { ...useStore.getState().layout, parts: lines } });
  // quick adds from the bin card: a divider per joint between cells (rib bins), the flex label of the bin's width
  const addDividers = () => {
    if (!selInfo) return;
    const joints = Math.max(0, Math.floor(selInfo.w - 1 + 1e-9));
    const div = partLib.find((p) => p.category === "Divider" && p.d === selInfo.d && p.h === selInfo.h);
    if (!joints || !div) return toast(t(joints ? "No divider for this size" : "A 1-cell bin has no joint for a divider"));
    setParts(addPart(parts, div.file, joints));
    toast(t(joints > 1 ? "{n} dividers {d}×{h}U added" : "1 divider {d}×{h}U added", { n: joints, d: selInfo.d, h: selInfo.h }));
  };
  const addLabel = () => {
    if (!selInfo) return;
    if (selInfo.system !== "groove") return toast(t("Click labels (Cullenect) come from MakerWorld (model 446624)"));
    const lab = partLib.find((p) => p.category === "Flex label" && p.w === selInfo.w && (p.fit ?? FLEX_FIT) === FLEX_FIT);
    if (!lab) return toast(t("No flex label for this width"));
    setParts(addPart(parts, lab.file));
    toast(t("Flex label {w} added", { w: selInfo.w }));
  };
  const used = layout.bins.reduce((a, b) => {
    const i = lib.get(b.file);
    return a + (i ? i.w * i.d : 0);
  }, 0);
  const sel = layout.bins.find((b) => b.id === selected);
  const selInfo = sel ? lib.get(sel.file) : undefined;
  const dirty = JSON.stringify(project().drawers.map((d) => d.layout)) !== saved;

  return (
    <div className="workspace">
      <aside className="sidebar">
        <PresetBar<unknown>
          kind="layout"
          current={layoutPreset}
          dirty={dirty}
          getData={() => project()}
          onLoad={(name, data) => {
            const pr = toProject(data);
            loadProject(pr);
            set({ layoutPreset: name });
            setSaved(JSON.stringify(pr.drawers.map((d) => d.layout)));
          }}
          onNew={() => {
            const pr = toProject(DEFAULT_LAYOUT);
            loadProject(pr);
            set({ layoutPreset: null });
            setSaved(JSON.stringify(pr.drawers.map((d) => d.layout)));
          }}
        />
        <div className="card drawer">
          <h3>{t("Drawer")}</h3>
          <div className="furniture">
            <select
              value={drawers[active]?.furniture ?? ""}
              onChange={(e) => {
                const f = FURNITURE.find((x) => x.id === e.target.value);
                const pr = project();
                pr.drawers[pr.active] = { ...pr.drawers[pr.active], furniture: f?.id };
                loadProject(pr);
                if (f) {
                  setLayoutPlate("plate_size", f.size);
                  toast(t("Measure yours: {note}", { note: t(f.note) }));
                }
              }}
            >
              <option value="">{t("Own size")}</option>
              {FURNITURE.map((f) => (
                <option key={f.id} value={f.id}>{`${t(f.name)} · ${f.size[0]} × ${f.size[1]}`}</option>
              ))}
            </select>
            {(() => {
              const f = FURNITURE.find((x) => x.id === drawers[active]?.furniture);
              if (!f || f.drawers < 2 || drawers.length >= f.drawers) return null;
              return (
                <button
                  className="ghost small"
                  onClick={() => {
                    const pr = project();
                    const cur = pr.drawers[pr.active];
                    const short = f.name.replace(/,.*/, "");
                    pr.drawers[pr.active] = { ...cur, name: `${short} 1` };
                    for (let i = pr.drawers.length; i < f.drawers; i++)
                      pr.drawers.push({ id: newId(), name: `${short} ${i + 1}`, furniture: f.id, layout: { ...DEFAULT_LAYOUT, plate: { ...cur.layout.plate }, plateFilament: cur.layout.plateFilament } });
                    loadProject(pr);
                  }}
                >
                  {t("Set up all {n} drawers", { n: f.drawers })}
                </button>
              );
            })()}
          </div>
          <div className="drawer-row">
            <label>
              <span>{t("Width")}</span>
              <input type="number" value={size?.[0] ?? 0} onChange={(e) => setLayoutPlate("plate_size", [+e.target.value, size[1]])} />
            </label>
            <span className="x">×</span>
            <label>
              <span>{t("Depth")}</span>
              <input type="number" value={size?.[1] ?? 0} onChange={(e) => setLayoutPlate("plate_size", [size[0], +e.target.value])} />
            </label>
            <span className="unit">mm</span>
          </div>
          <PrinterPicker />
          <div className="drawer-row">
            <label>
              <span>{t("Print bed")}</span>
              <input type="number" value={bed?.[0] ?? 0} onChange={(e) => setLayoutPlate("bed_size", [+e.target.value, bed[1]])} />
            </label>
            <span className="x">×</span>
            <label>
              <span>&nbsp;</span>
              <input type="number" value={bed?.[1] ?? 0} onChange={(e) => setLayoutPlate("bed_size", [bed[0], +e.target.value])} />
            </label>
            <span className="unit">mm</span>
          </div>
          <p className="hint">
            {t("{x} × {y} cells · {n} plate pieces · {p}% filled", { x: g.cellsX, y: g.cellsY, n: plate.segments.length || "–", p: Math.round((used / Math.max(1, g.cellsX * g.cellsY)) * 100) })}
          </p>
          <div className="row-btns">
            <button className="ghost small" onClick={() => setShowOptions(!showOptions)}>{t(showOptions ? "Hide plate options" : "All plate options")}</button>
            <button
              className="ghost small"
              onClick={() => {
                const s = useStore.getState();
                set({ layout: { ...layout, plate: { ...s.plate, plate_size: layout.plate.plate_size ?? s.plate.plate_size } } });
                toast(t("Baseplate tab settings applied (drawer size kept)"));
              }}
            >
              {t("Use baseplate tab settings")}
            </button>
          </div>
        </div>
        {showOptions && <ParamPanel schema={schema} over={layout.plate} onChange={setLayoutPlate} hide={["plate_size", "bed_size"]} />}
        <div className="card">
          <h3>{t("Bins")}</h3>
          <Library
            armed={armed}
            onArm={(f) => (setArmed(f), set({ selected: null }))}
            onFill={(cands, max) => {
              const taken = layout.bins.flatMap((b) => {
                const i = lib.get(b.file);
                if (!i) return [];
                const [w, d] = fp(i, b.rot);
                return [{ x: b.x, y: b.y, w, d }];
              });
              const add = fill(g.cellsX, g.cellsY, taken, cands, max);
              if (!add.length) return toast(t("No free spot for these bins"));
              editBins((b) => [...b, ...add.map((a) => ({ id: newId(), ...a }))]);
              set({ selected: null });
              toast(t("Added {n} bins (undo takes them back)", { n: add.length }));
            }}
          />
        </div>
        <div className="card">
          <h3>{t("Dividers & labels")}</h3>
          <PartsLibrary parts={partLib} onAdd={(f) => setParts(addPart(parts, f))} />
        </div>
      </aside>
      <main
        className={`stage ${armed ? "placing" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          const p = toPlane.current?.(e.clientX, e.clientY);
          if (p) setHover([p.x, p.y]);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) {
            // STL files dropped on the plate: upload them, put the first one where it was dropped
            const p = toPlane.current?.(e.clientX, e.clientY);
            uploadBins(e.dataTransfer.files).then((added) => {
              const b = added[0];
              if (!b || !p) return;
              const [x, y] = snap(p.x, p.y, b, 0, g);
              const id = Math.random().toString(36).slice(2, 9);
              const c = { file: b.file, x, y, rot: 0 as const };
              if (fits(c, b, g, useStore.getState().layout.bins, new Map([...lib, [b.file, b]]))) {
                editBins((bs) => [...bs, { id, ...c }]);
                set({ selected: id });
              }
            });
            return;
          }
          const f = e.dataTransfer.getData("text/bin") || armed;
          const p = toPlane.current?.(e.clientX, e.clientY);
          const info = f ? lib.get(f) : undefined;
          if (p && info) {
            const [x, y] = snap(p.x, p.y, info, armedRot, g);
            if (!place({ file: info.file, x, y, rot: armedRot })) toast(t("No room there"));
          }
          setArmed(null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <Scene theme={theme} controlsRef={controls} onPointerMissed={() => !armed && set({ selected: null })}>
          <PointerBridge z={top} onReady={(f) => (toPlane.current = f)} />
          {plate.segments.length > 0 && <PlateMesh segments={plate.segments} layout={pl} colorParts={false} hover={false} baseColor={(layout.plateFilament ?? PLATE_DEFAULT)[1]} />}
          <GridLines g={g} z={top + 0.05} dark={theme === "dark"} />
          <mesh
            position={[(g.cellsX * PITCH) / 2, (g.cellsY * PITCH) / 2, top]}
            onPointerMove={onPlaneMove}
            onPointerOut={() => setHover(null)}
            onClick={(e) => {
              if (drag) return;
              if (!armedInfo) return set({ selected: null });   // a click on the empty plate deselects
              e.stopPropagation();
              const [x, y] = snap(e.point.x, e.point.y, armedInfo, armedRot, g);
              if (!place({ file: armedInfo.file, x, y, rot: armedRot })) toast(t("No room there"));
              if (!e.shiftKey) setArmed(null);
            }}
          >
            <planeGeometry args={[g.cellsX * PITCH + 400, g.cellsY * PITCH + 400]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          {layout.bins.map((b) => {
            const info = lib.get(b.file);
            if (!info) return null;
            const moving = drag?.id === b.id;
            return (
              <BinMesh
                key={b.id}
                file={b.file}
                at={centre(b, info)}
                rot={b.rot}
                color={binColor(b, info, layout.colorMode)[0]}
                selected={b.id === selected}
                onClick={(e) => e.stopPropagation()}   // not a click on the empty plate
                onPointerDown={(e) => {
                  if (armed || e.button !== 0) return;
                  e.stopPropagation();
                  set({ selected: b.id });
                  const c = centre(b, info);
                  setDrag({ id: b.id, dx: e.point.x - c.x, dy: e.point.y - c.y, x: b.x, y: b.y });
                  if (controls.current) controls.current.enabled = false;
                  void moving;
                }}
              />
            );
          })}
          {ghost && <BinMesh key={`ghost-${ghost.file}`} file={ghost.file} at={centre(ghost, lib.get(ghost.file)!)} rot={ghost.rot} color="#fff" ghost valid={ghostOk} />}
          {sel && selInfo && !drag && (() => {
            const [w, d] = fp(selInfo, sel.rot);
            return <SelectionFrame x={sel.x} y={sel.y} w={w} d={d} z={top - SEAT} h={7 * selInfo.h + 4} />;
          })()}
          {showLabels &&
            layout.bins.map((b) => {
              const info = lib.get(b.file);
              if (!b.label || !info || drag?.id === b.id) return null;
              const [w] = fp(info, b.rot);
              // on the front edge of the bin, at its top
              return (
                <Html key={`label-${b.id}`} position={[(b.x + w / 2) * PITCH, b.y * PITCH + 7, top - SEAT + 7 * info.h + 5]} center zIndexRange={[10, 0]} distanceFactor={420}>
                  <div className={`bin-label ${b.id === selected ? "on" : ""}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => set({ selected: b.id })}>
                    {b.label}
                  </div>
                </Html>
              );
            })}
        </Scene>
        <ViewButtons onView={(view) => fitView(controls.current, frameBox, view)} name={layoutPreset} fallback="layout" />
        <DrawerTabs />
        {plate.loading && <div className="spinner" title={t("Rendering the plate…")} />}
        {plate.error && <div className="stage-error">{plate.error}</div>}
        {layout.bins.length === 0 && !armed && <div className="stage-tip">{t("Pick a bin size on the left, then click on the plate")}</div>}
        {layout.bins.length === 0 && !armed && drawers.length === 1 && (
          <div className="examples">
            <span>{t("Or start from an example:")}</span>
            {EXAMPLES.map((e) => (
              <button
                key={e.id}
                className="ghost small"
                title={e.blurb[lang === "de" ? 1 : 0]}
                onClick={() => {
                  loadProject(exampleProject(e, lang));
                  set({ layoutPreset: null });
                }}
              >
                {e.name[lang === "de" ? 1 : 0]}
              </button>
            ))}
          </div>
        )}
        <div className="hud">
          <FindBin />
          {/* the selected bin's card; greyed out while nothing is selected (2026-11-03) */}
          <div className={`card selected ${sel && selInfo ? "" : "idle"}`}>
            <div className="sel-head">
              {sel && selInfo ? (
                <>
                  <b>{selInfo.w}×{selInfo.d}×{selInfo.h}</b>
                  <span>{t(selInfo.system ?? "")} · {t(selInfo.kind ?? "")}</span>
                </>
              ) : (
                <span>{t("Click a bin to colour, turn or copy it")}</span>
              )}
            </div>
            <input
              key={sel?.id ?? "none"}
              className="label-input"
              disabled={!sel}
              placeholder={t("Label, e.g. M3 screws")}
              defaultValue={sel?.label ?? ""}
              maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (sel && v !== (sel.label ?? "")) editBins((b) => b.map((x) => (x.id === sel.id ? { ...x, label: v || undefined } : x)));
              }}
            />
            <div className="filament-row">
              <select value={material} disabled={!sel} onChange={(e) => setMaterial(e.target.value)}>
                {Object.keys(BAMBU).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <span className="filament-name">{sel && selInfo ? fn(binColor(sel, selInfo, layout.colorMode)[1]) || "–" : ""}</span>
            </div>
            <div className="swatches">
              {BAMBU[material].map(([name, hex, code, nameDe]) => (
                <button
                  key={code}
                  style={{ background: hex }}
                  title={`${material} ${lang === "de" ? nameDe : name} (${code})`}
                  disabled={!sel}
                  className={sel && sel.color === hex && sel.filament === `${material} · ${name}` && layout.colorMode === "custom" ? "on" : ""}
                  onClick={() => {
                    if (!sel) return;
                    editBins((b) => b.map((x) => (x.id === sel.id ? { ...x, color: hex, filament: `${material} · ${name}` } : x)));
                    if (layout.colorMode !== "custom") set({ layout: { ...useStore.getState().layout, colorMode: "custom" } });
                  }}
                />
              ))}
            </div>
            <div className="row-btns">
              <button className="ghost small" disabled={!sel} onClick={turn}>{t("Turn (R)")}</button>
              <button className="ghost small" disabled={!sel} onClick={copy}>{t("Copy (⌘D)")}</button>
              <button className="ghost small" disabled={!sel} onClick={addDividers}>{t("+ Dividers")}</button>
              <button className="ghost small" disabled={!sel} onClick={addLabel}>{t("+ Label")}</button>
              <button className="ghost small danger" disabled={!sel} onClick={() => sel && (editBins((b) => b.filter((x) => x.id !== sel.id)), set({ selected: null }))}>{t("Remove")}</button>
            </div>
          </div>
          <div className="card bom">
            <div className="bom-head">
              <h3>{t("Print list")}</h3>
            </div>
            {drawers.length > 1 && (
              <div className="seg small scope">
                <button className={scope === "drawer" ? "on" : ""} onClick={() => setScope("drawer")}>{t("This drawer")}</button>
                <button className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>{t("All drawers")} ({drawers.length})</button>
              </div>
            )}
            <label className="labels-toggle">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> {t("Show labels on the bins")}
            </label>
            <div className="colour-by">
              <span>{t("Colour by")}</span>
              <div className="seg small">
                {([["height", "height"], ["system", "label system"], ["custom", "own"]] as const).map(([m, label]) => (
                  <button key={m} className={layout.colorMode === m ? "on" : ""} onClick={() => set({ layout: { ...layout, colorMode: m } })}>{t(label)}</button>
                ))}
              </div>
            </div>
            {bom.length === 0 && allParts.length === 0 && <div className="empty">{t("No bins yet")}</div>}
            {bom.map(({ file, count, info, color, filament, labels }) => (
              <div key={`${file}|${color}`} className="bom-row">
                <span className="dot" style={{ background: color }} />
                <span className="bom-name">
                  {info ? `${info.name ? info.name + " · " : ""}${info.w}×${info.d}×${info.h}` : file}
                  <small>{info ? `${t(info.system ?? "")} · ${t(info.kind ?? "")}` : ""}{filament ? ` · ${fn(filament)}` : ""}</small>
                  {labels.length > 0 && (
                    <small className="bom-labels" title={labels.join(" · ")}>
                      {labels.slice(0, 4).join(" · ")}
                      {labels.length > 4 && ` · ${t("{n} more", { n: labels.length - 4 })}`}
                    </small>
                  )}
                </span>
                <b>
                  {count}×
                  {vols.has(file) && <small className="bom-g">{fmtGrams(grams(vols.get(file)!, filament) * count)}</small>}
                </b>
              </div>
            ))}
            {allParts.length > 0 && <div className="bom-sep">{t("Dividers & labels")}</div>}
            {scope === "drawer" ? (
              <PartRows lines={parts} lib={lib} onChange={setParts} />
            ) : (
              allParts.map((l) => (
                <div key={`${l.file}|${l.filament[0]}`} className="bom-row">
                  <span className="dot" style={{ background: l.filament[1] }} />
                  <span className="bom-name">{partName(lib.get(l.file), l.file)}<small>{fn(l.filament[0])}</small></span>
                  <b>{l.count}×</b>
                </div>
              ))
            )}
            {inScope.some((d) => d.layout.bins.some((b) => b.label && lib.get(b.file)?.system === "groove")) && (
              <label className="labels-toggle">
                <input type="checkbox" checked={engrave} onChange={(e) => setEngrave(e.target.checked)} /> {t("Print flex labels with the text engraved")}
              </label>
            )}
            {engraved.map((l) => (
              <div key={`${l.w}|${l.fit}|${l.text}`} className="bom-row">
                <span className="dot" style={{ background: labelFilament[1] }} />
                <span className="bom-name">
                  {t("Flex label")} {l.w} · „{l.text}“<small>fit {l.fit} · {fn(labelFilament[0])}</small>
                </span>
                <b>
                  {l.count}×
                  {vols.has(flexLabelFile(l.w)) && <small className="bom-g">{fmtGrams(grams(vols.get(flexLabelFile(l.w))!, labelFilament[0]) * l.count)}</small>}
                </b>
              </div>
            ))}
            {scope === "all" ? (
              inScope.map((d) => {
                const sz = (d.layout.plate.plate_size as number[] | undefined) ?? size;
                const pf = d.layout.plateFilament ?? PLATE_DEFAULT;
                return (
                  <div key={d.id} className="bom-row plate-row">
                    <span className="dot" style={{ background: pf[1] }} />
                    <span className="bom-name">{t("Baseplate")} · {d.name}<small>{sz?.[0]} × {sz?.[1]} mm · {fn(pf[0])}</small></span>
                    <b>1×{plateGrams(d) > 0 && <small className="bom-g">{fmtGrams(plateGrams(d))}</small>}</b>
                  </div>
                );
              })
            ) : (
            <div className="bom-row plate-row">
              <span className="dot" style={{ background: (layout.plateFilament ?? PLATE_DEFAULT)[1] }} />
              <span className="bom-name">
                {t("Baseplate")}
                <small>
                  {size?.[0]} × {size?.[1]} mm ·{" "}
                  <select
                    className="inline-select"
                    value={(layout.plateFilament ?? PLATE_DEFAULT)[0]}
                    onChange={(e) => {
                      const [mat, name] = e.target.value.split(" · ");
                      const hit = BAMBU[mat]?.find((c) => c[0] === name);
                      if (hit) set({ layout: { ...layout, plateFilament: [e.target.value, hit[1]] } });
                    }}
                  >
                    {Object.entries(BAMBU).map(([mat, cs]) => (
                      <optgroup key={mat} label={mat}>
                        {cs.map(([name]) => (
                          <option key={name} value={`${mat} · ${name}`}>{fn(`${mat} · ${name}`)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </small>
              </span>
              <b>
                {plate.segments.length || "–"} {t("pcs")}
                {plateGrams(inScope[0]) > 0 && <small className="bom-g">{fmtGrams(plateGrams(inScope[0]))}</small>}
              </b>
            </div>
            )}
            {(bom.length > 0 || allParts.length > 0 || plateVol > 0) && (
              <div className="bom-total" title={t("From the solid volume of each part; infill makes the real amount somewhat lower")}>
                <span>{t("Filament, about")}</span>
                <b>
                  {fmtGrams(est.g)} · {Math.round(est.m)} m{est.missing > 0 && " …"}
                </b>
              </div>
            )}
            <div className="row-btns">
              <button className="ghost small" onClick={undo} disabled={!useStore.getState().past.length}>↶ {t("Undo")}</button>
              <button className="ghost small" onClick={redo} disabled={!useStore.getState().future.length}>↷ {t("Redo")}</button>
              <button className="ghost small danger" disabled={!layout.bins.length} onClick={() => confirm(t("Remove all bins?")) && editBins(() => [])}>{t("Clear")}</button>
            </div>
            <button className="primary" disabled={busy || (!bom.length && !allParts.length && !engraved.length)} onClick={() => exportBambu(false)}>
              {busy ? t("Packing…") : t("Bambu project, all plates (.3mf)")}
            </button>
            <button className="ghost" disabled={busy || (!bom.length && !allParts.length && !engraved.length)} onClick={() => exportBambu(true)}>
              {t("Bambu: one file per plate (.zip)")}
            </button>
            <button
              className="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const name = layoutPreset ?? "layout";
                  const blob = await api.zip({ name, bins: zipBins, parts: allParts.map((p) => ({ file: p.file, count: p.count })), labels: engraved, plate: null, plates: plates.map((pl) => ({ params: pl.params, label: pl.label })) });
                  download(blob, fileName(layoutPreset, "layout", "zip", "stl"));
                } catch (e) {
                  toast((e as Error).message, "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("STL files (.zip)")}
            </button>
            <button
              className="ghost"
              disabled={!inScope.some((d) => d.layout.bins.length)}
              title={t("A top view of each drawer with every bin's label, to print and stick inside the cabinet")}
              onClick={() => {
                const maps = inScope.map((d) => {
                  const dg = grid((n) => value(d.layout.plate, schema, n));
                  return {
                    name: d.name,
                    cellsX: dg.cellsX,
                    cellsY: dg.cellsY,
                    sizeMm: dg.size,
                    bins: d.layout.bins.flatMap((b) => {
                      const info = lib.get(b.file);
                      if (!info) return [];
                      const [w, dd] = fp(info, b.rot);
                      return [{ x: b.x, y: b.y, w, d: dd, color: binColor(b, info, d.layout.colorMode)[0], text: b.label ?? "", size: `${info.w}×${info.d}×${info.h}` }];
                    }),
                  };
                });
                const html = drawerMapHtml(layoutPreset ?? t("Drawer map"), maps, { front: t("front"), bins: t("bins"), empty: t("No bins yet"), cards: t("Cards for the drawer fronts") });
                const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
                if (!window.open(url, "_blank")) download(new Blob([html], { type: "text/html" }), fileName(layoutPreset, "layout", "html", "map"));
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              }}
            >
              {t("Drawer map to print")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
