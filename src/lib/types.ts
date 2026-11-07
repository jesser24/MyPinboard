export type ItemKind = "text" | "url" | "image" | "file" | "folder" | "group";
export interface PinItem {
  id: string;
  kind: ItemKind;
  title: string;
  /** text body, URL, or file path(s) joined by \n */
  content: string;
  collectionId: string;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  capturedAt: number; // epoch ms
  sizeBytes?: number;
  sourceApp?: string;
  hash: string;
}
export interface Collection { id: string; name: string; color: string }
export type SortKey = "recent" | "name" | "size" | "type";
export interface Query { text: string; kinds: ItemKind[]; collectionId?: string; tag?: string; favoritesOnly: boolean; sort: SortKey }
export type Edge = "top" | "bottom" | "left" | "right";
