// Share links: the whole project (baseplate settings, every drawer, printer) in the URL's hash, deflated and base64url
// encoded. The hash never reaches the server, so opening a link needs no sign-in and writes nothing.
import type { ParamValue } from "../api";
import { project, toProject, type Project } from "../store";

export const SHARE_KEY = "share";

export interface Shared {
  v: 1;
  plate: Record<string, ParamValue>;
  project: Project;
  printer?: string;
  tab?: "plate" | "layout";
}

function toB64url(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(t));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(s: Shared) {
  const json = new TextEncoder().encode(JSON.stringify(s));
  return toB64url(await pipe(json, new CompressionStream("deflate-raw")));
}

export async function decodeShare(code: string): Promise<Shared> {
  const json = await pipe(fromB64url(code), new DecompressionStream("deflate-raw"));
  const d = JSON.parse(new TextDecoder().decode(json)) as Partial<Shared>;
  if (d.v !== 1 || !d.project) throw new Error("not a share link");
  return { v: 1, plate: d.plate ?? {}, project: toProject(d.project), printer: d.printer, tab: d.tab };
}

// the link for what is on screen now
export async function shareUrl(state: { plate: Record<string, ParamValue>; printer: string; tab: "plate" | "layout" }) {
  const code = await encodeShare({ v: 1, plate: state.plate, project: project(), printer: state.printer, tab: state.tab });
  return `${location.origin}${location.pathname}#${SHARE_KEY}=${code}`;
}

// the code in the current URL, if any
export function sharedCode(hash = location.hash) {
  const m = hash.match(new RegExp(`[#&]${SHARE_KEY}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
}
