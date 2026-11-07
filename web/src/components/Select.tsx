import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { rank } from "../lib/search";

export interface Opt {
  value: string;
  label: string;
  group?: string;      // options with the same group are listed under it, in order of first appearance
  disabled?: boolean;
  swatch?: string;     // a colour dot before the label
}

// A select box. Up to `threshold` options it is the browser's own; with more it opens a list with a search field:
// type to filter (every word must appear in the label or its group, case and accents ignored), arrows and Enter to pick.
export function Select({ value, options, onChange, className = "", title, ariaLabel, disabled, placeholder, onOpen, threshold = 8 }: {
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  placeholder?: string;   // shown when no option has the value
  onOpen?: () => void;
  threshold?: number;
}) {
  if (options.length <= threshold) return <NativeSelect {...{ value, options, onChange, className, title, ariaLabel, disabled, placeholder, onOpen }} />;
  return <Combo {...{ value, options, onChange, className, title, ariaLabel, disabled, placeholder, onOpen }} />;
}

type Props = Omit<Parameters<typeof Select>[0], "threshold">;

const groupsOf = (options: Opt[]) => {
  const order: (string | undefined)[] = [];
  for (const o of options) if (!order.includes(o.group)) order.push(o.group);
  return order.map((g) => ({ group: g, options: options.filter((o) => o.group === g) }));
};

function NativeSelect({ value, options, onChange, className, title, ariaLabel, disabled, placeholder, onOpen }: Props) {
  const known = options.some((o) => o.value === value);
  return (
    <select className={className} title={title} aria-label={ariaLabel} disabled={disabled} value={known ? value : ""} onFocus={onOpen} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value="" disabled>{placeholder ?? ""}</option>}
      {groupsOf(options).map(({ group, options: os }) => {
        const items = os.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>);
        return group ? <optgroup key={group} label={group}>{items}</optgroup> : items;
      })}
    </select>
  );
}

function Combo({ value, options, onChange, className, title, ariaLabel, disabled, placeholder, onOpen }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hot, setHot] = useState<string | null>(null);   // the highlighted option (null: the first match, or the current value)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean }>({ left: 0, top: 0, width: 240, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);

  const shown = useMemo(() => rank(options, q), [options, q]);
  const pickable = shown.filter((o) => !o.disabled);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 240);
    const up = r.bottom + 320 > window.innerHeight && r.top > 320;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: up ? r.top - 4 : r.bottom + 4, width, up });
  };
  const show = (first = "") => {
    if (disabled) return;
    onOpen?.();
    place();
    setQ(first);
    setHot(null);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const pick = (o: Opt) => {
    if (o.disabled) return;
    close();
    if (o.value !== value) onChange(o.value);
  };

  // derived in the same render as the filter, so Enter right after typing takes the first match of what was typed
  const hotIndex = pickable.findIndex((o) => o.value === hot);
  const cur0 = q ? -1 : pickable.findIndex((o) => o.value === value);
  const active = hotIndex >= 0 ? hotIndex : Math.max(0, cur0);
  const setActive = (f: number | ((a: number) => number)) => {
    const i = typeof f === "function" ? f(active) : f;
    setHot(pickable[i]?.value ?? null);
  };
  useLayoutEffect(() => {
    list.current?.querySelector(".combo-opt.active")?.scrollIntoView({ block: "nearest" });
  }, [active, open, q]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close(false);
    const move = (e: Event) => !pop.current?.contains(e.target as Node) && place();
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", move, true);
    };
  }, [open]);

  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, pickable.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
    else if (e.key === "Home") (e.preventDefault(), setActive(0));
    else if (e.key === "End") (e.preventDefault(), setActive(pickable.length - 1));
    else if (e.key === "Enter") (e.preventDefault(), pickable[active] && pick(pickable[active]));
    else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), close());
    else if (e.key === "Tab") close(false);
  };

  const id = useMemo(() => `combo-${Math.random().toString(36).slice(2, 8)}`, []);
  const activeOpt = pickable[active];
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`combo ${className}`}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-value={value}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") (e.preventDefault(), show());
          else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) (e.preventDefault(), show(e.key));
        }}
      >
        {cur?.swatch && <span className="combo-dot" style={{ background: cur.swatch }} />}
        <span className="combo-label">{cur?.label ?? placeholder ?? ""}</span>
        <span className="combo-caret">▾</span>
      </button>
      {open &&
        createPortal(
          <div ref={pop} className={`combo-pop ${pos.up ? "up" : ""}`} style={{ left: pos.left, top: pos.top, width: pos.width }} onKeyDown={keys}>
            <input
              autoFocus
              className="combo-search"
              placeholder={t("Search…")}
              value={q}
              role="combobox"
              aria-controls={id}
              aria-expanded
              aria-activedescendant={activeOpt ? `${id}-${activeOpt.value}` : undefined}
              onChange={(e) => (setQ(e.target.value), setHot(null))}
            />
            <div className="combo-list" role="listbox" id={id} ref={list}>
              {shown.length === 0 && <div className="combo-empty">{t("Nothing found")}</div>}
              {groupsOf(shown).map(({ group, options: os }) => (
                <div key={group ?? ""} role="group" aria-label={group}>
                  {group && <div className="combo-group">{group}</div>}
                  {os.map((o) => (
                    <div
                      key={o.value}
                      id={`${id}-${o.value}`}
                      role="option"
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled}
                      className={`combo-opt ${o.value === value ? "on" : ""} ${o === activeOpt ? "active" : ""} ${o.disabled ? "disabled" : ""}`}
                      onMouseMove={() => !o.disabled && o !== activeOpt && setActive(pickable.indexOf(o))}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o)}
                    >
                      {o.swatch && <span className="combo-dot" style={{ background: o.swatch }} />}
                      {o.label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
