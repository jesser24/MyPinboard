/** Pure view logic: which section is open, how it maps to a Query, and how results are grouped. No React, no DOM. */
import type { Collection, DateRange, ItemKind, PinItem, Query, SortKey } from "./types";

/** `all`, `favorites`, `pinned`, a type, or `c:<collectionId>`. */
export type SectionId = "all" | "favorites" | "pinned" | "text" | "links" | "images" | "files" | "folders" | `c:${string}`;

export const TYPE_SECTIONS = ["text", "links", "images", "files", "folders"] as const;
export const KIND_GROUPS: Record<(typeof TYPE_SECTIONS)[number], ItemKind[]> = {
  text: ["text"], links: ["url"], images: ["image"], files: ["file", "group"], folders: ["folder"],
};
export const SECTION_LABEL: Record<Exclude<SectionId, `c:${string}`>, string> = {
  all: "All items", favorites: "Favourites", pinned: "Pinned", text: "Text", links: "Links", images: "Images", files: "Files", folders: "Folders",
};
export const DATE_LABEL: Record<DateRange, string> = { any: "Any time", today: "Today", week: "Past 7 days", month: "Past 30 days" };
export const SORT_LABEL: Record<SortKey, string> = { recent: "Most recent", name: "Name", size: "Size", type: "Type" };

export const collectionSection = (id: string): SectionId => `c:${id}`;
export const collectionOf = (s: SectionId): string | undefined => (s.startsWith("c:") ? s.slice(2) : undefined);

export function sectionTitle(s: SectionId, collections: Collection[]): string {
  const c = collectionOf(s);
  if (c !== undefined) return collections.find((x) => x.id === c)?.name ?? "Collection";
  return SECTION_LABEL[s as keyof typeof SECTION_LABEL];
}

/** Start of the local day / N days back, in epoch ms. */
export function sinceFor(range: DateRange, now = Date.now()): number | undefined {
  if (range === "any") return undefined;
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (range === "today") return d.getTime();
  return d.getTime() - (range === "week" ? 6 : 29) * 86_400_000;
}

export interface ViewInput { section: SectionId; text: string; date: DateRange; sort: SortKey; tag?: string }
export function queryFor(v: ViewInput, now = Date.now()): Query {
  const c = collectionOf(v.section);
  const group = (TYPE_SECTIONS as readonly string[]).includes(v.section) ? KIND_GROUPS[v.section as keyof typeof KIND_GROUPS] : [];
  return { text: v.text, kinds: group, collectionId: c, tag: v.tag, favoritesOnly: v.section === "favorites", pinnedOnly: v.section === "pinned",
    since: sinceFor(v.date, now), sort: v.sort };
}

/** How many items each section holds (ignoring text/date filters, so the sidebar numbers stay stable while typing). */
export function sectionCounts(items: PinItem[], collections: Collection[]): Record<string, number> {
  const out: Record<string, number> = { all: items.length, favorites: 0, pinned: 0, text: 0, links: 0, images: 0, files: 0, folders: 0 };
  for (const c of collections) out[`c:${c.id}`] = 0;
  for (const i of items) {
    if (i.favorite) out.favorites++;
    if (i.pinned) out.pinned++;
    for (const t of TYPE_SECTIONS) if (KIND_GROUPS[t].includes(i.kind)) out[t]++;
    const key = `c:${i.collectionId}`; if (key in out) out[key]++;
  }
  return out;
}

export interface Group { key: string; label: string; items: PinItem[] }
/**
 * Group an already sorted result list for display. Pinned items form their own group; with the default "recent" sort the rest is grouped by day.
 * Other sorts are shown as one flat group, because a date heading over a list sorted by size would be misleading.
 */
export function groupItems(items: PinItem[], sort: SortKey, now = Date.now()): Group[] {
  const pinned = items.filter((i) => i.pinned); const rest = items.filter((i) => !i.pinned);
  const groups: Group[] = [];
  if (pinned.length) groups.push({ key: "pinned", label: "Pinned", items: pinned });
  if (sort !== "recent") { if (rest.length) groups.push({ key: "rest", label: pinned.length ? "Everything else" : "", items: rest }); return groups; }
  const today = new Date(now); today.setHours(0, 0, 0, 0); const t0 = today.getTime();
  const bucket = (ts: number): [string, string] => ts >= t0 ? ["today", "Today"] : ts >= t0 - 86_400_000 ? ["yesterday", "Yesterday"] : ts >= t0 - 6 * 86_400_000 ? ["week", "This week"] : ["earlier", "Earlier"];
  for (const i of rest) {
    const [key, label] = bucket(i.capturedAt); const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(i); else groups.push({ key, label, items: [i] });
  }
  return groups;
}
