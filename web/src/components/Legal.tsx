import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { useStore } from "../store";

// Imprint and privacy notice of this installation (server: LEGAL_DIR), as an overlay; /imprint and /privacy open it directly
const TITLES: Record<string, string> = { imprint: "Imprint", privacy: "Privacy" };

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

// the little Markdown the pages need: headings, paragraphs (line breaks kept), lists, bold, links
function markdown(md: string) {
  return md
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const h = block.match(/^(#{1,3})\s+(.*)$/);
      if (h) return `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
      if (block.split("\n").every((l) => /^\s*-\s+/.test(l)))
        return `<ul>${block.split("\n").map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
      return `<p>${block.split("\n").map(inline).join("<br>")}</p>`;
    })
    .join("");
}

export function LegalLinks() {
  const t = useT();
  const [pages, setPages] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/legal").then((r) => (r.ok ? r.json() : [])).then((p: string[]) => {
      setPages(p);
      const direct = location.pathname.replace(/^\//, "");
      if (p.includes(direct)) setOpen(direct);
    }).catch(() => {});
  }, []);
  if (!pages.length) return null;
  return (
    <>
      <span className="legal-links">
        {pages.map((p) => (
          <a key={p} href={`/${p}`} onClick={(e) => (e.preventDefault(), setOpen(p))}>{t(TITLES[p])}</a>
        ))}
      </span>
      {open && <LegalPage page={open} onClose={() => (setOpen(null), location.pathname !== "/" && history.replaceState(null, "", "/"))} />}
    </>
  );
}

function LegalPage({ page, onClose }: { page: string; onClose: () => void }) {
  const lang = useStore((s) => s.lang);
  const t = useT();
  const [html, setHtml] = useState("");
  useEffect(() => {
    fetch(`/api/legal/${page}?lang=${lang}`).then((r) => (r.ok ? r.text() : "")).then((md) => setHtml(markdown(md)));
  }, [page, lang]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // in <body>: the top bar is its own stacking context, the 3D labels would cover the page
  return createPortal(
    <div className="legal-backdrop" onClick={onClose}>
      <div className="legal-page" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(TITLES[page])}>
        <button className="icon-btn legal-close" onClick={onClose} title={t("Close")}>✕</button>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>,
    document.body,
  );
}
