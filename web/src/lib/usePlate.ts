import { useEffect, useRef, useState } from "react";
import { api, type ParamValue } from "../api";
import { parseStl, splitParts, type Segment } from "./stl";

export interface PlateState {
  segments: Segment[];
  loading: boolean;
  error: string | null;
  ms: number;
  cached: boolean;
  triangles: number;
}

// Renders the baseplate on the server whenever the parameters change (debounced, the last request wins)
export function usePlate(params: Record<string, ParamValue>, enabled = true): PlateState {
  const [state, setState] = useState<PlateState>({ segments: [], loading: false, error: null, ms: 0, cached: false, triangles: 0 });
  const key = JSON.stringify(params);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = (ctrl.current = new AbortController());
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const r = await api.plate(JSON.parse(key), c.signal);
        const pos = parseStl(r.buffer);
        const segments = splitParts(pos);
        if (!c.signal.aborted) setState({ segments, loading: false, error: null, ms: r.ms, cached: r.cached, triangles: pos.length / 9 });
      } catch (e) {
        if (!c.signal.aborted) setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [key, enabled]);

  return state;
}
