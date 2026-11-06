// The shortcut sheet ("?" or the ? button over the 3D view): every key and mouse gesture of the layout editor.
import { useT } from "../lib/i18n";

const MAC = typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.platform);
export const MOD = MAC ? "⌘" : "Ctrl+";
const M = MAC ? "⌘" : "Ctrl";

export function Shortcuts({ onClose }: { onClose: () => void }) {
  const t = useT();
  const rows: [string, string][] = [
    [t("Click a size, then the plate"), t("place a bin (Shift keeps the size for more)")],
    [t("Drag a bin"), t("move it")],
    ["R", t("turn the selected bin, or the one being dragged or placed")],
    [t("Arrow keys"), t("move the selection")],
    [t("drag an orange edge handle"), t("resize the selected bin")],
    [`${M}+D`, t("copy beside it")],
    ["Del", t("remove the selection")],
    [t("Shift-click"), t("add a bin to the selection or take it out")],
    [`${M}+A`, t("select every bin of the drawer")],
    ["F · " + t("double-click"), t("zoom to the selected bin")],
    [t("Right-click a bin"), t("menu with everything for it")],
    ["1 · 2 · 3", t("view from the side, from above, from the front")],
    ["4", t("plan view: flat from above, drag the empty plate to pan")],
    [`${M}+Z · ${M}+Shift+Z`, t("undo · redo")],
    ["Esc", t("drop the size in hand, clear the selection")],
    ["?", t("this sheet")],
  ];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("Keys and mouse")}>
        <div className="sheet-head">
          <h3>{t("Keys and mouse")}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t("Close")}>✕</button>
        </div>
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td><kbd>{k}</kbd></td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">{t("Mouse: left drag turns the view, right drag pans, the wheel zooms.")}</p>
      </div>
    </div>
  );
}
