export interface Binding { action: string; keys: string }
/** Normalise "win+alt+s" style strings: lowercase, sorted modifiers first. */
export function normaliseKeys(keys: string): string {
  const order = ["ctrl", "alt", "shift", "win"];
  const parts = keys.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
  const mods = order.filter((m) => parts.includes(m));
  const rest = parts.filter((p) => !order.includes(p));
  return [...mods, ...rest].join("+");
}
/** Returns groups of actions that share the same combination. */
export function findConflicts(bindings: Binding[]): Binding[][] {
  const map = new Map<string, Binding[]>();
  for (const b of bindings) {
    const k = normaliseKeys(b.keys);
    map.set(k, [...(map.get(k) ?? []), b]);
  }
  return [...map.values()].filter((g) => g.length > 1);
}
