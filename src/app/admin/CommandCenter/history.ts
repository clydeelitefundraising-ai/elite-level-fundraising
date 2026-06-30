import type { StoredItem, ResultKind } from "./types";

const HISTORY_KEY   = "elf_cmd_history";
const FAVORITES_KEY = "elf_cmd_favorites";
const MAX_HISTORY   = 8;
const MAX_FAVORITES = 20;

function read(key: string): StoredItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredItem[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, items: StoredItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function getHistory(): StoredItem[] {
  return read(HISTORY_KEY);
}

export function addToHistory(item: Omit<StoredItem, "ts">): void {
  const next = [
    { ...item, ts: Date.now() },
    ...read(HISTORY_KEY).filter(h => h.id !== item.id),
  ].slice(0, MAX_HISTORY);
  write(HISTORY_KEY, next);
}

export function getFavorites(): StoredItem[] {
  return read(FAVORITES_KEY);
}

export function isFavorite(id: string): boolean {
  return read(FAVORITES_KEY).some(f => f.id === id);
}

// Returns the updated favorites list after toggling.
export function toggleFavorite(item: Omit<StoredItem, "ts">): StoredItem[] {
  const existing = read(FAVORITES_KEY);
  const idx      = existing.findIndex(f => f.id === item.id);
  const next     = idx === -1
    ? [{ ...item, ts: Date.now() }, ...existing].slice(0, MAX_FAVORITES)
    : existing.filter(f => f.id !== item.id);
  write(FAVORITES_KEY, next);
  return next;
}

// Converts a StoredItem back to a partial CmdItem (without action fn)
export function storedToCmdItem(s: StoredItem): {
  id: string; kind: ResultKind; label: string; sublabel?: string;
  icon: string; href?: string; group: string;
} {
  return { id: s.id, kind: s.kind, label: s.label, sublabel: s.sublabel, icon: s.icon, href: s.href, group: s.group };
}
