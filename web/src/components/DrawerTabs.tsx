import { useT } from "../lib/i18n";
import { DEFAULT_LAYOUT, loadProject, newId, project, switchDrawer, useStore } from "../store";

// the drawers of the project, above the 3D view: switch, add, rename, copy, remove
export function DrawerTabs() {
  const { drawers, active } = useStore();
  const t = useT();
  const p = () => project();
  return (
    <div className="drawer-tabs">
      {drawers.map((d, i) => (
        <div key={d.id} className={`dtab ${i === active ? "on" : ""}`}>
          <button className="dtab-main" onClick={() => switchDrawer(i)} title={d.furniture ?? ""}>
            {d.name}
          </button>
          {i === active && (
            <>
              <button
                className="dtab-act"
                title={t("Rename")}
                onClick={() => {
                  const name = prompt(t("Drawer name"), d.name)?.trim();
                  if (!name) return;
                  const pr = p();
                  pr.drawers[i] = { ...pr.drawers[i], name };
                  loadProject(pr);
                }}
              >
                ✎
              </button>
              <button
                className="dtab-act"
                title={t("Copy drawer")}
                onClick={() => {
                  const pr = p();
                  const src = pr.drawers[i];
                  pr.drawers.splice(i + 1, 0, { ...src, id: newId(), name: `${src.name} (2)`, layout: JSON.parse(JSON.stringify(src.layout)) });
                  loadProject({ ...pr, active: i + 1 });
                }}
              >
                ⧉
              </button>
              {drawers.length > 1 && (
                <button
                  className="dtab-act danger"
                  title={t("Remove drawer")}
                  onClick={() => {
                    if (!confirm(t("Remove drawer “{name}” with its layout?", { name: d.name }))) return;
                    const pr = p();
                    pr.drawers.splice(i, 1);
                    loadProject({ ...pr, active: Math.max(0, i - 1) });
                  }}
                >
                  ✕
                </button>
              )}
            </>
          )}
        </div>
      ))}
      <button
        className="dtab add"
        title={t("Add drawer")}
        onClick={() => {
          const pr = p();
          const cur = pr.drawers[pr.active].layout;
          // a new drawer with the same size and plate settings, empty
          pr.drawers.push({ id: newId(), name: `${t("Drawer")} ${pr.drawers.length + 1}`, layout: { ...DEFAULT_LAYOUT, plate: { ...cur.plate }, plateFilament: cur.plateFilament } });
          loadProject({ ...pr, active: pr.drawers.length - 1 });
        }}
      >
        ＋
      </button>
    </div>
  );
}
