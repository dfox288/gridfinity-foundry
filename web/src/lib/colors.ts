// Default bin colours (Bambu PLA Basic) by height or by label system, and the baseplate's
import type { BinFile } from "../api";
import type { Layout, Placed } from "../store";

// default colours, all Bambu PLA Basic: [hex, name]
export const HEIGHT_COLORS: Record<number, [string, string]> = {
  3: ["#0086D6", "Cyan"], 4: ["#00B1B7", "Turquoise"], 5: ["#00AE42", "Bambu Green"], 6: ["#FEC600", "Sunflower Yellow"],
  7: ["#FF9016", "Pumpkin Orange"], 8: ["#EC008C", "Magenta"], 9: ["#5E43B7", "Purple"], 10: ["#C12E1F", "Red"],
  11: ["#BECF00", "Bright Green"], 12: ["#FF6A13", "Orange"], 13: ["#F55A74", "Pink"], 14: ["#0056B8", "Cobalt Blue"],
  15: ["#3F8E43", "Mistletoe Green"], 16: ["#9D432C", "Brown"], 17: ["#482960", "Indigo Purple"], 18: ["#9D2235", "Maroon Red"],
};
export const SYSTEM_COLORS: Record<string, [string, string]> = { groove: ["#0056B8", "Cobalt Blue"], click: ["#FF6A13", "Orange"], community: ["#00AE42", "Bambu Green"] };
export const PLATE_DEFAULT: [string, string] = ["PLA Basic · Gray", "#8E9089"];
// a bin's colour and the filament it stands for
export function binColor(b: Placed, info: BinFile | undefined, mode: Layout["colorMode"]): [string, string] {
  if (mode === "custom" && b.color) return [b.color, b.filament ?? ""];
  const c = mode === "system" ? SYSTEM_COLORS[info?.system ?? ""] : HEIGHT_COLORS[info?.h ?? 6];
  return c ? [c[0], `PLA Basic · ${c[1]}`] : ["#94a3b8", ""];
}
