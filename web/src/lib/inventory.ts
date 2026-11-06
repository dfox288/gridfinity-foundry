// From an inventory to bins: a pasted list (one thing per line) or a CSV (item, count, size, height) becomes one row
// per bin with a size and height. Blank sizes and heights are guessed from words in the item (English and German),
// how many there are and a length in cm; the person checks and changes the guesses before anything is placed.

export interface InvRow {
  item: string;      // becomes the bin's label
  count?: number;
  w: number;         // footprint in cells, long side first (w >= d)
  d: number;
  h: number;         // height in units
  guessed: boolean;  // size or height came from the guess, not from the list
}

type Guess = { w: number; d: number; h: number };

// word lists, checked in this order; the first that matches wins
const RULES: [RegExp, Guess][] = [
  // long tools
  [/plier|zange|screwdriver|schraubendreher|schraubenzieher|tweezer|pinzette|file\b|feile|cutter|seitenschneider|hex key|allen|inbus|caliper|messschieber|ruler|lineal|knife|messer|scissor|schere|spatula|spachtel|deburr|entgrat/i, { w: 4, d: 1, h: 6 }],
  // bulky things
  [/cable|kabel|charger|ladeger|power supply|netzteil|soldering iron|lötkolben|lotkolben|multimeter|glue gun|heißkleb|heisskleb|hot glue|adapter|headphone|kopfhörer/i, { w: 3, d: 2, h: 6 }],
  // rolls and stacks
  [/tape|klebeband|heat ?shrink|schrumpfschlauch|sandpaper|schleifpapier|wire|litze|draht|solder\b|lötzinn|lotzinn|glove|handschuh|filament|label|etikett/i, { w: 2, d: 2, h: 6 }],
  // small things
  [/batter|batterie|akku|connector|stecker|button|taster|switch|schalter|sensor|module|modul|board|arduino|esp32|esp8266|raspberry|dowel|dübel|dubel|cable tie|zip tie|kabelbinder|glue stick|klebestift|pen\b|pens\b|stift|marker|bit holder/i, { w: 2, d: 1, h: 6 }],
  // tiny parts
  [/screw|schraube|nut\b|nuts\b|mutter|washer|scheibe|bolt|bolzen|rivet|niete|resistor|widerstand|capacitor|kondensator|diode|transistor|\bleds?\b|fuse|sicherung|header|jumper|insert|einsatz|einsätze|magnet|bit\b|bits\b|spring|feder|o-ring|oring|pin\b|pins\b|stift|crimp|terminal|klemme/i, { w: 1, d: 1, h: 3 }],
];
const DEFAULT: Guess = { w: 2, d: 1, h: 6 };

const SIZES_WORDS: Record<string, [number, number]> = { xs: [1, 0.5], s: [1, 1], small: [1, 1], klein: [1, 1], m: [2, 1], medium: [2, 1], mittel: [2, 1], l: [2, 2], large: [2, 2], groß: [2, 2], gross: [2, 2], xl: [3, 2] };

// a size written as "2x1", "2 × 1", "1.5x1" or a word (S, M, L, small, klein, …): long side first
export function parseSize(s: string): [number, number] | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (SIZES_WORDS[t]) return SIZES_WORDS[t];
  const m = t.replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return a >= b ? [a, b] : [b, a];
}

export function parseHeight(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^(\d+)\s*u?$/);
  return m ? +m[1] : null;
}

// the guess for one thing: words first; then many tiny parts get a bigger bin, a length in cm a long one
export function guess(item: string, count?: number): Guess {
  let g = RULES.find(([re]) => re.test(item))?.[1] ?? DEFAULT;
  const cm = item.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (cm) {
    const len = Math.min(6, Math.max(1, Math.ceil((parseFloat(cm[1].replace(",", ".")) * 10 + 4) / 42)));
    if (len > g.w) g = { ...g, w: len };
  }
  if (count && g.w === 1 && g.d === 1) {
    if (count > 400) g = { ...g, w: 2, d: 2 };
    else if (count > 150) g = { ...g, w: 2, d: 1 };
  }
  return g;
}

const HEADERS: Record<string, keyof Omit<InvRow, "guessed" | "w" | "d" | "h"> | "size" | "height"> = {
  item: "item", thing: "item", name: "item", what: "item", gegenstand: "item", artikel: "item", inhalt: "item", teil: "item",
  count: "count", qty: "count", quantity: "count", number: "count", anzahl: "count", menge: "count", stück: "count",
  size: "size", größe: "size", groesse: "size", grosse: "size",
  height: "height", höhe: "height", hoehe: "height", hohe: "height",
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') (cur += '"'), i++;
      else quoted = !quoted;
    } else if (c === sep && !quoted) (out.push(cur), (cur = ""));
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

// a free line: "M3 screws 200", "200 × M3 screws", "M3 screws, 200" -> item and count (a lone whole number)
function freeLine(line: string): { item: string; count?: number } {
  const t = line.replace(/^[-*•\s]+/, "").trim();
  const m = t.match(/^(\d+)\s*(?:x|×|stk\.?|pcs\.?)?\s+(.+)$/i) ?? null;
  if (m && !/^\d+\s*cm\b/i.test(t)) return { item: m[2].replace(/[,;:]\s*$/, "").trim(), count: +m[1] };
  const e = t.match(/^(.+?)[\s,;:]+(?:x|×)?\s*(\d+)\s*(?:x|×|stk\.?|pcs\.?|pieces|stück)?$/i);
  if (e && !/cm$/i.test(e[1])) return { item: e[1].trim(), count: +e[2] };
  return { item: t };
}

// the rows of a pasted list or a CSV file (comma, semicolon or tab; a header row with item/count/size/height in
// English or German, or none: then the columns are taken in that order, or a line is read as free text)
export function parseInventory(text: string): InvRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return [];
  const sep = [";", "\t", ","].find((c) => lines[0].includes(c)) ?? "";
  let cols: string[] | null = null;
  let body = lines;
  if (sep) {
    const head = splitLine(lines[0], sep).map((h) => HEADERS[h.toLowerCase()] ?? "");
    if (head.includes("item")) (cols = head), (body = lines.slice(1));
    else if (lines.every((l) => l.includes(sep))) cols = ["item", "count", "size", "height"];
  }
  const rows: InvRow[] = [];
  for (const line of body) {
    let item = "", count: number | undefined, size: [number, number] | null = null, height: number | null = null;
    if (cols && sep) {
      const cells = splitLine(line, sep);
      cols.forEach((c, i) => {
        const v = cells[i] ?? "";
        if (c === "item") item = v;
        else if (c === "count") count = parseInt(v, 10) || undefined;
        else if (c === "size") size = parseSize(v);
        else if (c === "height") height = parseHeight(v);
      });
    } else ({ item, count } = freeLine(line));
    if (!item) continue;
    const g = guess(item, count);
    const s = size as [number, number] | null;
    rows.push({ item: item.slice(0, 40), count, w: s ? s[0] : g.w, d: s ? s[1] : g.d, h: height ?? g.h, guessed: !s || height === null });
  }
  return rows;
}

// the CSV template to download, with a few example rows; columns in the page's language
export function inventoryTemplate(lang: "en" | "de") {
  return lang === "de"
    ? "Gegenstand;Anzahl;Größe;Höhe\nSchrauben M3;200;;\nWiderstände;;1x1;3\nLötkolben 25 cm;1;;\nKabelbinder;;2x1;6\n"
    : "item,count,size,height\nM3 screws,200,,\nResistors,,1x1,3\nSoldering iron 25 cm,1,,\nCable ties,,2x1,6\n";
}
