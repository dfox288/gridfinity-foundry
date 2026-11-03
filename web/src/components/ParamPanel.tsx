import { useMemo, useState } from "react";
import type { Param, ParamValue } from "../api";
import { GF_DE, GF_GROUPS_DE, GF_OPTIONS_DE, useT } from "../lib/i18n";
import { useStore } from "../store";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pretty = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function NumberInput({ value, step, min, max, onChange }: { value: number; step?: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="num"
      type="number"
      value={text ?? String(value)}
      step={step ?? "any"}
      min={min}
      max={max}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      onBlur={() => setText(null)}
    />
  );
}

function Field({ p, value, onChange }: { p: Param; value: ParamValue; onChange: (v: ParamValue | undefined) => void }) {
  const de = useStore((s) => s.lang) === "de";
  const opt = (n: string) => (de ? GF_OPTIONS_DE[n] ?? n : n);
  if (p.type === "boolean")
    return (
      <button className={`switch ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={!!value}>
        <span />
      </button>
    );
  if (p.options) {
    if (p.options.length <= 3 && p.options.every((o) => o.name.length <= 12))
      return (
        <div className="seg">
          {p.options.map((o) => (
            <button key={String(o.value)} className={same(o.value, value) ? "on" : ""} onClick={() => onChange(o.value)}>
              {opt(o.name)}
            </button>
          ))}
        </div>
      );
    return (
      <select value={String(value)} onChange={(e) => onChange(typeof p.initial === "number" ? +e.target.value : e.target.value)}>
        {p.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {opt(o.name)}
          </option>
        ))}
      </select>
    );
  }
  if (p.type === "string") return <input className="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  if (Array.isArray(value)) {
    const labels = value.length === 2 ? ["X", "Y"] : value.length === 4 ? ["N", "E", "S", "W"] : value.map((_, i) => String(i + 1));
    return (
      <div className={`vec vec${value.length}`}>
        {value.map((v, i) => (
          <label key={i}>
            <span>{labels[i]}</span>
            <NumberInput value={v} step={p.step} onChange={(n) => onChange(value.map((x, j) => (j === i ? n : x)))} />
          </label>
        ))}
      </div>
    );
  }
  const v = value as number;
  if (p.min !== undefined && p.max !== undefined)
    return (
      <div className="range">
        <input type="range" min={p.min} max={p.max} step={p.step ?? 0.1} value={v} onChange={(e) => onChange(+e.target.value)} />
        <code>{v}</code>
      </div>
    );
  return <NumberInput value={v} step={p.step} onChange={onChange} />;
}

export function ParamPanel({ schema, over, onChange, hide = [] }: {
  schema: Param[];
  over: Record<string, ParamValue>;
  onChange: (name: string, v: ParamValue | undefined) => void;
  hide?: string[];
}) {
  const t = useT();
  const de = useStore((s) => s.lang) === "de";
  const label = (p: Param) => (de && GF_DE[p.name] ? GF_DE[p.name][0] : pretty(p.name));
  const caption = (p: Param) => (de && GF_DE[p.name] ? GF_DE[p.name][1] : p.caption);
  const group = (g: string) => (de ? GF_GROUPS_DE[g] ?? g : g === "Parameters" ? "Plate & printer" : g);
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ Parameters: true });
  const groups = useMemo(() => {
    const m = new Map<string, Param[]>();
    for (const p of schema) {
      if (hide.includes(p.name)) continue;
      const hit = !q || `${p.name} ${p.caption ?? ""} ${p.group} ${GF_DE[p.name]?.join(" ") ?? ""} ${GF_GROUPS_DE[p.group] ?? ""}`.toLowerCase().includes(q.toLowerCase());
      if (!hit || (onlyChanged && !(p.name in over))) continue;
      m.set(p.group, [...(m.get(p.group) ?? []), p]);
    }
    return [...m.entries()];
  }, [schema, q, onlyChanged, over, hide]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = Object.keys(over).filter((k) => !hide.includes(k)).length;

  return (
    <div className="params">
      <div className="params-tools">
        <input className="search" placeholder={t("Search options…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`chip ${onlyChanged ? "on" : ""}`} onClick={() => setOnlyChanged(!onlyChanged)} title={t("Show changed options only")}>
          {t("{n} changed", { n: changed })}
        </button>
      </div>
      {groups.map(([g, ps]) => {
        const isOpen = q || onlyChanged || open[g];
        const n = ps.filter((p) => p.name in over).length;
        return (
          <section key={g} className={`group ${isOpen ? "open" : ""}`}>
            <button className="group-head" onClick={() => setOpen({ ...open, [g]: !open[g] })}>
              <span className="caret">›</span>
              {group(g)}
              {n > 0 && <span className="badge">{n}</span>}
            </button>
            {isOpen && (
              <div className="group-body">
                {ps.map((p) => {
                  const v = p.name in over ? over[p.name] : p.initial;
                  const mod = p.name in over;
                  return (
                    <div key={p.name} className={`field ${mod ? "mod" : ""}`} title={caption(p)}>
                      <div className="field-head">
                        <span className="field-name">{label(p)}</span>
                        {mod && (
                          <button className="reset" onClick={() => onChange(p.name, undefined)} title={t("Reset to {v}", { v: JSON.stringify(p.initial) })}>
                            ↺
                          </button>
                        )}
                      </div>
                      <Field p={p} value={v} onChange={(x) => onChange(p.name, x)} />
                      {caption(p) && <p className="hint">{caption(p)}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
