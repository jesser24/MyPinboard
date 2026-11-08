/** Presentation helpers for item content. Pure and offline: nothing here ever touches the network. */

const withProtocol = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** `https://www.react.dev/learn?x=1` → domain `react.dev`, path `/learn?x=1`. Falls back to the raw text when it is not a URL. */
export function splitUrl(raw: string): { domain: string; path: string } {
  const t = raw.trim();
  try { const u = new URL(withProtocol(t)); const path = (u.pathname === "/" ? "" : u.pathname) + u.search; return { domain: u.hostname.replace(/^www\./, ""), path }; }
  catch { return { domain: t.slice(0, 60), path: "" }; }
}

/** Heuristic only: used to pick a monospace face for text that looks like code or a shell command. */
export function looksLikeCode(text: string): boolean {
  const t = text.trim(); if (t.length < 3) return false;
  if (/^(\$|>|PS [A-Z]:\\.*>)\s?\S/.test(t)) return true;
  if (/^(npm|npx|pnpm|yarn|git|cargo|pip|python|node|docker|cd|ls|curl|ssh|sudo|winget|choco)\s/.test(t)) return true;
  const signals = [/[{};]\s*$/m, /=>|->|::|===|!==/, /^\s*(const|let|var|function|class|import|export|def|fn|public|private|return|SELECT|INSERT|UPDATE)\b/m, /<\/?[a-z][\w-]*[^>]*>/i, /\b\w+\(.*\)\s*[;{]?$/m];
  const wrapped = (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]") && t.includes(":")) || /^<[a-z!?][\s\S]*>$/i.test(t);
  return wrapped || signals.filter((r) => r.test(t)).length >= 2;
}

export interface FileInfo { name: string; ext: string; dir: string }
/** Windows or POSIX path → name, upper-case extension (max 5 chars, "" when there is none) and parent directory. */
export function fileInfo(path: string): FileInfo {
  const p = path.trim().replace(/[\\/]+$/, ""); const cut = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  const name = cut >= 0 ? p.slice(cut + 1) : p; const dir = cut >= 0 ? p.slice(0, cut) : "";
  const dot = name.lastIndexOf("."); const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1, dot + 6).toUpperCase() : "";
  return { name, ext, dir };
}

/** Shorten a long path from the left so the meaningful end stays visible: `C:\Users\…\Reports\Q3`. */
export function shortenPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  const sep = path.includes("\\") ? "\\" : "/"; const parts = path.split(sep); let tail = "";
  for (let i = parts.length - 1; i > 0; i--) { const next = parts[i] + (tail ? sep + tail : ""); if (next.length + 3 > max) break; tail = next; }
  return tail ? `${parts[0]}${sep}…${sep}${tail}` : `…${path.slice(-(max - 1))}`;
}

/** One-line preview of a text body: collapse whitespace, cut at a word boundary. Returns "" when the preview would only repeat the title. */
export function previewLine(content: string, title: string, max = 140): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!flat || flat === title.trim()) return "";
  const rest = flat.startsWith(title.trim()) ? flat.slice(title.trim().length).trim() : flat;
  if (!rest) return "";
  if (rest.length <= max) return rest;
  const cut = rest.slice(0, max); const sp = cut.lastIndexOf(" ");
  return `${cut.slice(0, sp > max * 0.6 ? sp : max)}…`;
}
