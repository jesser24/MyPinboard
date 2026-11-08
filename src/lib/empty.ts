import type { Collection, DateRange } from "./types";
import { collectionOf, SECTION_LABEL, type SectionId } from "./view";

export type EmptyAction = "clear-search" | "clear-date" | "resume";
export interface EmptyCopy { icon: "all" | "search" | "star" | "pin" | "text" | "link" | "image" | "file" | "folder" | "clock" | "pause" | "move"; title: string; body: string; action?: { id: EmptyAction; label: string } }

/** What to say when nothing is listed. Every case says what happened and what to do next, never just "nothing here". */
export function emptyFor(o: { section: SectionId; collections: Collection[]; hasItems: boolean; text: string; date: DateRange; paused: boolean }): EmptyCopy {
  const q = o.text.trim();
  if (q) return { icon: "search", title: `No matches for “${q.length > 28 ? q.slice(0, 27) + "…" : q}”`, body: "Check the spelling, or search in all items.", action: { id: "clear-search", label: "Clear search" } };
  if (o.date !== "any" && o.hasItems) return { icon: "clock", title: "Nothing in this time range", body: "Items from other days are still saved.", action: { id: "clear-date", label: "Show any time" } };
  const col = collectionOf(o.section);
  if (col !== undefined) return { icon: "move", title: `${o.collections.find((c) => c.id === col)?.name ?? "This collection"} is empty`, body: "Drag items onto it in the sidebar, or choose Move to collection from an item’s menu." };
  switch (o.section) {
    case "favorites": return { icon: "star", title: "No favourites yet", body: "Star an item to keep it here. Favourites are never removed by the history limit." };
    case "pinned": return { icon: "pin", title: "Nothing pinned", body: "Pin an item to keep it at the top of every list." };
    case "text": case "links": case "images": case "files": case "folders":
      return { icon: o.section === "links" ? "link" : o.section === "images" ? "image" : o.section === "text" ? "text" : o.section === "files" ? "file" : "folder", title: `No ${SECTION_LABEL[o.section].toLowerCase()} yet`, body: "They appear here as soon as you copy one." };
    default:
      if (o.paused) return { icon: "pause", title: "Capture is paused", body: "Nothing you copy is being saved right now.", action: { id: "resume", label: "Resume capture" } };
      return { icon: "all", title: "Nothing copied yet", body: "Copy something, paste it here with Ctrl+V, or drop files onto the board." };
  }
}
