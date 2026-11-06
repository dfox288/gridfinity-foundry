// A printable map of the drawers: a top view of each drawer, one per page, with every bin's label (or its size), to
// stick inside the cabinet door or onto the drawer front. Built as a standalone page and opened for printing.

export interface MapBin {
  x: number;       // cells from the south-west (front left) corner
  y: number;
  w: number;       // footprint in cells as placed
  d: number;
  color: string;
  text: string;    // the label, or empty
  size: string;    // e.g. "2×1×6"
}

export interface MapDrawer {
  name: string;
  cellsX: number;
  cellsY: number;
  sizeMm: [number, number];
  bins: MapBin[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function svg(d: MapDrawer, front: string) {
  const C = 42, pad = 6;
  const W = d.cellsX * C, H = d.cellsY * C;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad + 18}">`);
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#999" stroke-width="0.8"/>`);
  for (let i = 1; i < d.cellsX; i++) out.push(`<line x1="${i * C}" y1="0" x2="${i * C}" y2="${H}" stroke="#e3e3e3" stroke-width="0.5"/>`);
  for (let j = 1; j < d.cellsY; j++) out.push(`<line x1="0" y1="${j * C}" x2="${W}" y2="${j * C}" stroke="#e3e3e3" stroke-width="0.5"/>`);
  for (const b of d.bins) {
    const x = b.x * C, y = (d.cellsY - b.y - b.d) * C, w = b.w * C, h = b.d * C;
    const g = 1.2;
    out.push(`<rect x="${x + g}" y="${y + g}" width="${w - 2 * g}" height="${h - 2 * g}" rx="3" fill="${esc(b.color)}" fill-opacity="0.22" stroke="${esc(b.color)}" stroke-width="1.4"/>`);
    // the label as large as the bin allows, wrapped onto up to three lines
    const main = b.text || b.size;
    const words = main.split(/\s+/);
    const lines: string[] = [];
    const maxChars = Math.max(4, Math.floor(w / 6.5));
    for (const word of words) {
      const last = lines[lines.length - 1];
      if (last !== undefined && (last + " " + word).length <= maxChars) lines[lines.length - 1] = last + " " + word;
      else lines.push(word);
    }
    const shown = lines.slice(0, 3);
    const longest = Math.max(...shown.map((l) => l.length));
    const fs = Math.max(4.5, Math.min(13, (w - 6) / (longest * 0.58), (h - (b.text ? 14 : 6)) / (shown.length * 1.2)));
    const cy = y + h / 2 - (b.text ? 3 : 0) - ((shown.length - 1) * fs * 1.2) / 2;
    shown.forEach((l, i) =>
      out.push(`<text x="${x + w / 2}" y="${cy + i * fs * 1.2}" font-size="${fs.toFixed(1)}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`),
    );
    if (b.text && h > 16) out.push(`<text x="${x + w / 2}" y="${y + h - 5}" font-size="4.5" fill="#666" text-anchor="middle">${esc(b.size)}</text>`);
  }
  out.push(`<text x="${W / 2}" y="${H + 13}" font-size="7" fill="#666" text-anchor="middle" letter-spacing="1">▼ ${esc(front)} ▼</text>`);
  out.push(`</svg>`);
  return out.join("");
}

// small cards for the drawer fronts: name and contents, cut out and taped on
function cards(drawers: MapDrawer[], heading: string) {
  const list = drawers.filter((d) => d.bins.some((b) => b.text));
  if (!list.length) return "";
  const card = (d: MapDrawer) => {
    const labels = [...new Set(d.bins.map((b) => b.text).filter(Boolean))];
    return `<div class="card"><b>${esc(d.name)}</b><span>${labels.map(esc).join(" · ")}</span></div>`;
  };
  return `<section class="cards-page"><header><h1>${esc(heading)}</h1></header><div class="cards">${list.map(card).join("")}</div></section>`;
}

export function drawerMapHtml(title: string, drawers: MapDrawer[], tr: { front: string; bins: string; empty: string; cards: string }) {
  const pages = drawers
    .map(
      (d) => `<section>
  <header><h1>${esc(d.name)}</h1><span>${d.sizeMm[0]} × ${d.sizeMm[1]} mm · ${d.cellsX} × ${d.cellsY} · ${d.bins.length} ${esc(tr.bins)}</span></header>
  ${d.bins.length ? svg(d, tr.front) : `<p class="empty">${esc(tr.empty)}</p>`}
</section>`,
    )
    .join("\n") + cards(drawers, tr.cards);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: #111; margin: 0; background: #fff; }
  section { page-break-after: always; break-after: page; padding: 8mm 0; }
  section:last-child { page-break-after: auto; break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; margin-bottom: 6mm; padding-bottom: 2mm; }
  h1 { font-size: 18pt; margin: 0; letter-spacing: 0.02em; }
  header span { font-size: 9pt; color: #555; }
  svg { width: 100%; max-height: 240mm; display: block; }
  svg text { font-family: inherit; }
  .empty { color: #777; }
  .cards { display: grid; grid-template-columns: repeat(2, 85mm); gap: 4mm; }
  .card { height: 30mm; box-sizing: border-box; border: 0.3mm dashed #999; padding: 3mm 4mm; display: flex; flex-direction: column; gap: 1.5mm; overflow: hidden; }
  .card b { font-size: 13pt; letter-spacing: 0.04em; text-transform: uppercase; }
  .card span { font-size: 8pt; line-height: 1.3; color: #333; }
  @media screen { body { max-width: 190mm; margin: 0 auto; padding: 0 8mm; } }
</style></head><body>
${pages}
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));</script>
</body></html>`;
}
