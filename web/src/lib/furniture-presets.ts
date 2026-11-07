import type { ParamValue } from "../api";
import { FURNITURE, type Furniture } from "./furniture";

// The furniture drawers as built-in baseplate presets. Loading one sets the plate size only; the other plate options stay.
export const furnitureFor = (size: unknown): Furniture | undefined =>
  Array.isArray(size) ? FURNITURE.find((f) => f.size[0] === size[0] && f.size[1] === size[1]) : undefined;

export const withFurniture = (plate: Record<string, ParamValue>, f: Furniture) => ({ ...plate, plate_size: [...f.size] });

export const furnitureSub = (f: Furniture) => `${f.size[0]} × ${f.size[1]} mm`;
