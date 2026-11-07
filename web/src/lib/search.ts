// The search of components/Select.tsx: every word of the query must appear in the label or the group, case and
// accents ignored.
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const matches = (o: { label: string; group?: string }, q: string) => {
  const hay = fold(`${o.label} ${o.group ?? ""}`);
  return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

// best first: the label is the query, then starts with it, then every word found at the start of a word
// ("9" in "9 drawers" rather than in "295"), then the rest; each tier keeps the old order
export const rank = <T extends { label: string; group?: string }>(os: T[], q: string): T[] => {
  const f = fold(q.trim());
  if (!f) return os.filter((o) => matches(o, q));
  const words = f.split(/\s+/);
  const score = (o: T) => {
    const l = fold(o.label), hay = ` ${fold(`${o.label} ${o.group ?? ""}`).replace(/[^\p{L}\p{N}.]+/gu, " ")}`;
    return l === f ? 0 : l.startsWith(f) ? 1 : words.every((w) => hay.includes(` ${w}`)) ? 2 : 3;
  };
  return os.filter((o) => matches(o, q)).map((o, i) => [o, score(o), i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([o]) => o);
};
