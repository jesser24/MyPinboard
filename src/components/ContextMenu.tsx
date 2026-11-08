import type { Collection, PinItem } from "../lib/types";
import type { MenuEntry } from "./Menu";

export interface ItemActions {
  copy(): void; open(): void; view(): void; edit(): void; rename(): void; tag(): void; pin(): void; fav(): void; move(collectionId: string): void; reveal(): void; remove(): void;
}

/** The one coherent action set for an item, in the same order everywhere (context menu, "more" button, keyboard). */
export function itemMenu(item: PinItem, collections: Collection[], a: ItemActions): MenuEntry[] {
  const pathKind = item.kind === "file" || item.kind === "folder" || item.kind === "group";
  const openLabel = item.kind === "url" ? "Open link" : item.kind === "image" ? "Preview" : item.kind === "text" ? "Edit text" : item.kind === "folder" ? "Open folder" : item.kind === "group" ? "Review files" : "Open file";
  return [
    { label: "Copy", icon: "copy", shortcut: "Enter", run: a.copy },
    { label: openLabel, icon: item.kind === "url" ? "open" : "eye", run: a.open },
    ...(item.kind !== "image" ? [{ label: "View full content", icon: "text" as const, shortcut: "Space", run: a.view }] : []),
    ...(item.kind === "text" ? [{ label: "Edit…", icon: "edit" as const, run: a.edit }] : []),
    ...(pathKind ? [{ label: "Show in folder", icon: "folder" as const, run: a.reveal }] : []),
    "sep",
    { label: item.pinned ? "Unpin" : "Pin", icon: item.pinned ? "unpin" : "pin", shortcut: "P", run: a.pin },
    { label: item.favorite ? "Remove favourite" : "Favourite", icon: "star", shortcut: "F", run: a.fav },
    { label: "Rename label…", icon: "edit", run: a.rename },
    { label: "Add tag…", icon: "tag", run: a.tag },
    { label: "Move to collection", icon: "move", submenu: collections.map((c) => ({ label: c.name, dot: c.color, disabled: c.id === item.collectionId, run: () => a.move(c.id) })) },
    "sep",
    { label: "Remove from board", icon: "trash", shortcut: "Del", danger: true, run: a.remove },
  ];
}
