import { useEffect } from "react";
import { api } from "./api";
import { LayoutTab } from "./components/LayoutTab";
import { PlateTab } from "./components/PlateTab";
import { translate } from "./lib/i18n";
import { loadProject, project, toProject, useStore } from "./store";

const DRAFT = "gridfinity-studio-draft";

export function App() {
  const { tab, theme, lang, toasts, schema, me, set, toast } = useStore();
  const t = (en: string) => translate(lang, en);

  useEffect(() => {
    api.schema().then((schema) => set({ schema })).catch((e) => toast(`Schema: ${e.message}`, "error"));
    api.bins().then((bins) => set({ bins })).catch((e) => toast(`Bins: ${e.message}`, "error"));
    api.printers().then((printers) => set({ printers })).catch(() => {});
    api.me().then((me) => set({ me })).catch(() => {});
    // the unsaved work of the last visit (this browser only)
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null");
      if (d) {
        set({ plate: d.plate ?? {}, tab: d.tab ?? "plate", platePreset: d.platePreset ?? null, layoutPreset: d.layoutPreset ?? null });
        loadProject(toProject(d.project ?? d.layout));
      }
    } catch {
      /* no draft */
    }
  }, [set, toast]);

  useEffect(
    () =>
      useStore.subscribe((s) => {
        try {
          localStorage.setItem(DRAFT, JSON.stringify({ plate: s.plate, project: project(), tab: s.tab, platePreset: s.platePreset, layoutPreset: s.layoutPreset }));
        } catch {
          /* storage blocked */
        }
      }),
    [],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("lang", lang);
    } catch {
      /* storage blocked */
    }
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 16 16" width="22" height="22">
            <rect x="1" y="1" width="6" height="6" rx="1.5" fill="#f5a524" />
            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45" />
            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".7" />
          </svg>
          <span>Gridfinity <b>Foundry</b></span>
        </div>
        <nav className="tabs">
          <button className={tab === "plate" ? "on" : ""} onClick={() => set({ tab: "plate" })}>{t("Baseplate")}</button>
          <button className={tab === "layout" ? "on" : ""} onClick={() => set({ tab: "layout" })}>{t("Layout")}</button>
        </nav>
        <div className="top-right">
          <span className="credit">
            {t("plates by")} <a href="https://github.com/yawkat/gridflock" target="_blank" rel="noreferrer">GridFlock</a>
          </span>
          {me.auth &&
            (me.user ? (
              <span className="account">
                <span className="account-name" title={t("Signed in with GitHub")}>{me.user}</span>
                <a href="/oauth2/sign_out?rd=/">{t("Sign out")}</a>
              </span>
            ) : (
              // same tab: the unsaved work waits in the draft (localStorage)
              <a className="account signin" href="/oauth2/start?rd=/">{t("Sign in with GitHub")}</a>
            ))}
          <div className="seg small lang">
            {(["de", "en"] as const).map((l) => (
              <button key={l} className={lang === l ? "on" : ""} onClick={() => set({ lang: l })}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button className="icon-btn" title={t("Light / dark")} onClick={() => set({ theme: theme === "dark" ? "light" : "dark" })}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>
      {schema.length === 0 ? <div className="loading">{t("Loading GridFlock…")}</div> : tab === "plate" ? <PlateTab /> : <LayoutTab />}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
