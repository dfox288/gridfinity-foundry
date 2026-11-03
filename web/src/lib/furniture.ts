// Drawers of common furniture: inner size in mm (width x depth). Measured by the community unless marked official;
// drawers vary by about 1 mm, so measure yours (inside, at the narrowest point) before printing.
export interface Furniture {
  id: string;
  name: string;
  size: [number, number];
  drawers: number;
  note: string;
}

export const FURNITURE: Furniture[] = [
  { id: "ikea-alex-5", name: "IKEA ALEX, 5 drawers", size: [295, 522], drawers: 5, note: "community measurements 295-297 x 522-525" },
  { id: "ikea-alex-9", name: "IKEA ALEX, 9 drawers", size: [295, 423], drawers: 9, note: "depth measured 423, width as the 5-drawer ALEX" },
  { id: "ikea-alex-wide", name: "IKEA ALEX wide (67 cm, on castors), 6 drawers", size: [600, 420], drawers: 6, note: "IKEA's inside size" },
  { id: "ikea-helmer", name: "IKEA HELMER", size: [220, 370], drawers: 6, note: "IKEA's inside size" },
  { id: "ikea-hemnes-top", name: "IKEA HEMNES 6-drawer chest, top drawers", size: [390, 430], drawers: 1, note: "community measurement; the drawers vary, measure yours" },
  { id: "ikea-malm-80", name: "IKEA MALM, 80 cm wide", size: [720, 430], drawers: 1, note: "approximate; measure (MALM generations differ)" },
];
