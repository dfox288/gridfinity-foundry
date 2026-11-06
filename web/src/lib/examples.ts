// Example projects for a first visit: an empty layout offers them on the plate. Plain data; labels in both languages.
import { FURNITURE } from "./furniture";
import { DEFAULT_LAYOUT, newId, type Placed, type Project } from "../store";

type L = [string, string];   // [en, de]
type B = [number, number, number, number, number, L?, ("hex" | "solid")?];   // w, d, h, x, y, label, kind (w >= d; turned if given d > w)

interface Example {
  id: string;
  name: L;
  blurb: L;
  furniture: string;
  bins: B[];
}

const bin = (w: number, d: number, h: number, kind = "hex") => `groove/print-bin-groove_${kind}-${w}x${d}x${h}.stl`;

export const EXAMPLES: Example[] = [
  {
    id: "screws",
    name: ["Screw drawer", "Schraubenschublade"],
    blurb: ["IKEA ALEX, 9 drawers: screws, nuts and washers by size", "IKEA ALEX, 9 Schubladen: Schrauben, Muttern und Scheiben nach Größe"],
    furniture: "ikea-alex-9",
    bins: [
      ...["M2", "M2.5", "M3", "M4", "M5", "M6", "M8"].map((m, i): B => [1, 1, 3, i, 0, [`Screws ${m}`, `Schrauben ${m}`]]),
      ...["M2", "M2.5", "M3", "M4", "M5", "M6", "M8"].map((m, i): B => [1, 1, 3, i, 1, [`Nuts ${m}`, `Muttern ${m}`]]),
      ...["M2", "M2.5", "M3", "M4", "M5", "M6", "M8"].map((m, i): B => [1, 1, 3, i, 2, [`Washers ${m}`, `Scheiben ${m}`]]),
      [2, 2, 6, 0, 3, ["Heat-set inserts", "Gewindeeinsätze"]],
      [2, 2, 6, 2, 3, ["Wood screws", "Holzschrauben"]],
      [3, 2, 6, 4, 3, ["Wall plugs", "Dübel"]],
      [3, 1, 6, 0, 5, ["Long M3", "M3 lang"]],
      [4, 1, 6, 3, 5, ["Long M4 and M5", "M4 und M5 lang"]],
      [2, 2, 6, 0, 6, ["Springs", "Federn"]],
      [2, 2, 6, 2, 6, ["O-rings", "O-Ringe"]],
      [3, 2, 6, 4, 6, ["Cable ties", "Kabelbinder"]],
      [6, 2, 6, 0, 8, ["Threaded rod and offcuts", "Gewindestangen und Reste"], "solid"],
      [1, 2, 6, 6, 8, ["Spare", "Frei"]],
    ],
  },
  {
    id: "electronics",
    name: ["Electronics drawer", "Elektronikschublade"],
    blurb: ["IKEA HELMER: parts up front, boards and cables behind", "IKEA HELMER: Bauteile vorne, Boards und Kabel dahinter"],
    furniture: "ikea-helmer",
    bins: [
      ...([["Resistors", "Widerstände"], ["Capacitors", "Kondensatoren"], ["LEDs", "LEDs"], ["Diodes", "Dioden"], ["Transistors", "Transistoren"]] as L[]).map((l, i): B => [1, 1, 3, i, 0, l]),
      ...([["Pin headers", "Stiftleisten"], ["Jumper wires", "Jumperkabel"], ["Buttons", "Taster"], ["Fuses", "Sicherungen"], ["Screws M2", "Schrauben M2"]] as L[]).map((l, i): B => [1, 1, 3, i, 1, l]),
      [2, 2, 6, 0, 2, ["ESP32 boards", "ESP32-Boards"]],
      [3, 2, 6, 2, 2, ["Sensors", "Sensoren"]],
      [5, 2, 6, 0, 4, ["USB cables and adapters", "USB-Kabel und Adapter"]],
      [2, 2, 9, 0, 6, ["Soldering", "Löten"], "solid"],
      [3, 1, 6, 2, 6, ["Heat shrink", "Schrumpfschlauch"]],
      [3, 1, 6, 2, 7, ["Tape", "Klebeband"]],
      [5, 0.5, 6, 0, 8, ["Small tools", "Kleinwerkzeug"]],
    ],
  },
];

export function exampleProject(e: Example, lang: "en" | "de"): Project {
  const f = FURNITURE.find((x) => x.id === e.furniture);
  const bins: Placed[] = e.bins.map(([w, d, h, x, y, label, kind]) => ({
    id: newId(),
    file: bin(Math.max(w, d), Math.min(w, d), h, kind),
    x,
    y,
    rot: d > w ? 1 : 0,
    ...(label ? { label: label[lang === "de" ? 1 : 0] } : {}),
  }));
  return {
    version: 2,
    active: 0,
    drawers: [{ id: newId(), name: e.name[lang === "de" ? 1 : 0], furniture: f?.id, layout: { ...DEFAULT_LAYOUT, plate: f ? { plate_size: f.size } : DEFAULT_LAYOUT.plate, bins } }],
  };
}
