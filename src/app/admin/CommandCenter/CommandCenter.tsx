"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CmdItem, CmdGroup, StoredItem, SearchResponse } from "./types";
import { PAGE_ITEMS, ACTION_ITEM_DEFS, ASYNC_ACTION_IDS } from "./items";
import {
  getHistory, addToHistory, getFavorites,
  toggleFavorite, storedToCmdItem,
} from "./history";

// ─── Text highlight ───────────────────────────────────────────────────────────

function HL({ text, q }: { text: string; q: string }) {
  if (!q || q.length < 2) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "#fef08a", borderRadius: 2, padding: 0 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, flatIdx, selectedIdx, query, isFav,
  onSelect, onMouseEnter, onToggleFav,
}: {
  item:        CmdItem;
  flatIdx:     number;
  selectedIdx: number;
  query:       string;
  isFav:       boolean;
  onSelect:    () => void;
  onMouseEnter: () => void;
  onToggleFav: (e: React.MouseEvent) => void;
}) {
  const selected = flatIdx === selectedIdx;
  const [hovFav, setHovFav] = useState(false);
  const [rowHov, setRowHov] = useState(false);

  return (
    <div
      id={`cc-item-${flatIdx}`}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={() => { setRowHov(true); onMouseEnter(); }}
      onMouseLeave={() => setRowHov(false)}
      style={{
        display:     "flex",
        alignItems:  "center",
        gap:         ".625rem",
        padding:     ".5rem 1.25rem",
        cursor:      "pointer",
        background:  selected ? "#eff6ff" : rowHov ? "#f8fafc" : "transparent",
        borderLeft:  selected ? "2px solid #2563eb" : "2px solid transparent",
        transition:  "background .08s",
        userSelect:  "none",
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: ".875rem", width: 18, textAlign: "center", flexShrink: 0, color: "#64748b" }}>
        {item.icon}
      </span>

      {/* Label + sublabel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: ".875rem", fontWeight: 500, color: "#0b1e3d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <HL text={item.label} q={query} />
        </div>
        {item.sublabel && (
          <div style={{ fontSize: ".72rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: ".05rem" }}>
            <HL text={item.sublabel} q={query} />
          </div>
        )}
      </div>

      {/* Favorite toggle (visible on hover or when favorited) */}
      {(rowHov || selected || isFav) && (
        <button
          aria-label={isFav ? "Unpin from favorites" : "Pin to favorites"}
          onClick={onToggleFav}
          onMouseEnter={() => setHovFav(true)}
          onMouseLeave={() => setHovFav(false)}
          style={{
            background:  "none",
            border:      "none",
            cursor:      "pointer",
            fontSize:    ".8rem",
            color:       isFav ? "#f59e0b" : hovFav ? "#f59e0b" : "#cbd5e1",
            padding:     ".15rem .35rem",
            borderRadius: 4,
            flexShrink:  0,
            lineHeight:  1,
          }}
        >
          {isFav ? "★" : "☆"}
        </button>
      )}

      {/* Kind hint */}
      {!rowHov && !selected && !isFav && (
        <span style={{ fontSize: ".68rem", color: "#cbd5e1", flexShrink: 0 }}>
          {item.href ? "→" : "⚡"}
        </span>
      )}
    </div>
  );
}

// ─── Group header ─────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding:       ".625rem 1.25rem .2rem",
      fontSize:      ".62rem",
      fontWeight:    700,
      color:         "#94a3b8",
      letterSpacing: ".1em",
      textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}

// ─── Converter helpers ────────────────────────────────────────────────────────

function toCampaignItem(c: SearchResponse["campaigns"][0]): CmdItem {
  return {
    id:       `campaign-${c.campaign_slug}`,
    kind:     "campaign",
    label:    `${c.school_name} ${c.sport_name}`,
    sublabel: c.campaign_slug,
    icon:     "◫",
    href:     `/admin/campaigns/${c.campaign_slug}`,
    group:    "CAMPAIGNS",
  };
}

function toAthleteItem(a: SearchResponse["athletes"][0]): CmdItem {
  return {
    id:       `athlete-${a.id}`,
    kind:     "athlete",
    label:    a.name,
    sublabel: [a.school_name, a.event].filter(Boolean).join(" · "),
    icon:     "🏃",
    href:     `/admin/campaigns/${a.campaign_slug}`,
    group:    "ATHLETES",
  };
}

function toCoachItem(c: SearchResponse["coaches"][0]): CmdItem {
  return {
    id:       `coach-${c.id}`,
    kind:     "coach",
    label:    c.name,
    sublabel: c.school_name ?? c.campaign_slug,
    icon:     "👔",
    href:     `/admin/campaigns/${c.campaign_slug}`,
    group:    "COACHES",
  };
}

function toSponsorItem(s: SearchResponse["sponsors"][0]): CmdItem {
  return {
    id:       `sponsor-${s.id}`,
    kind:     "sponsor",
    label:    s.name,
    sublabel: [s.school_name ?? s.campaign_slug, s.tier].filter(Boolean).join(" · "),
    icon:     "💼",
    href:     `/admin/campaigns/${s.campaign_slug}`,
    group:    "SPONSORS",
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommandCenter({ onClose }: { onClose: () => void }) {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  const [query,         setQuery]         = useState("");
  const [debouncedQ,    setDebouncedQ]    = useState("");
  const [groups,        setGroups]        = useState<CmdGroup[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [selectedIdx,   setSelectedIdx]   = useState(0);
  const [favorites,     setFavorites]     = useState<StoredItem[]>([]);
  const [history,       setHistory]       = useState<StoredItem[]>([]);
  const [seedingAction, setSeedingAction] = useState("");

  // Load localStorage data on mount
  useEffect(() => {
    setFavorites(getFavorites());
    setHistory(getHistory());
    inputRef.current?.focus();
  }, []);

  // Debounce query → debouncedQ
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Hydrate action items with runtime callbacks
  const hydrateActions = useCallback((): CmdItem[] => {
    return ACTION_ITEM_DEFS.map(def => {
      if (!ASYNC_ACTION_IDS.has(def.id)) return def as CmdItem;
      return {
        ...def,
        action: async () => {
          setSeedingAction(def.id);
          try { await fetch("/api/admin/demo/seed", { method: "POST" }); }
          finally { setSeedingAction(""); }
        },
      };
    });
  }, []);

  // Build empty state (no query)
  const buildEmptyState = useCallback(() => {
    const result: CmdGroup[] = [];
    if (favorites.length > 0) {
      result.push({ label: "⭐  FAVORITES", items: favorites.map(f => storedToCmdItem(f) as CmdItem) });
    }
    if (history.length > 0) {
      result.push({ label: "RECENT", items: history.map(h => storedToCmdItem(h) as CmdItem) });
    }
    result.push({ label: "PAGES",   items: PAGE_ITEMS });
    result.push({ label: "ACTIONS", items: hydrateActions() });
    setGroups(result);
  }, [favorites, history, hydrateActions]);

  // Run search
  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
      const data: SearchResponse = res.ok ? await res.json() : { campaigns: [], athletes: [], coaches: [], sponsors: [] };

      const lcQ = q.toLowerCase();
      const matchStatic = <T extends CmdItem>(items: T[]) =>
        items.filter(i => i.label.toLowerCase().includes(lcQ) || (i.sublabel ?? "").toLowerCase().includes(lcQ));

      const result: CmdGroup[] = [];
      const favMatches = favorites
        .map(f => storedToCmdItem(f) as CmdItem)
        .filter(i => i.label.toLowerCase().includes(lcQ) || (i.sublabel ?? "").toLowerCase().includes(lcQ));

      if (favMatches.length)             result.push({ label: "⭐  FAVORITES", items: favMatches });
      if (data.campaigns.length)         result.push({ label: "CAMPAIGNS",  items: data.campaigns.map(toCampaignItem) });
      if (data.athletes.length)          result.push({ label: "ATHLETES",   items: data.athletes.map(toAthleteItem) });
      if (data.coaches.length)           result.push({ label: "COACHES",    items: data.coaches.map(toCoachItem) });
      if (data.sponsors.length)          result.push({ label: "SPONSORS",   items: data.sponsors.map(toSponsorItem) });

      const pageHits   = matchStatic(PAGE_ITEMS);
      const actionHits = matchStatic(hydrateActions());
      if (pageHits.length)   result.push({ label: "PAGES",   items: pageHits });
      if (actionHits.length) result.push({ label: "ACTIONS", items: actionHits });

      setGroups(result);
    } finally {
      setLoading(false);
    }
  }, [favorites, hydrateActions]);

  // React to debounced query
  useEffect(() => {
    if (debouncedQ.length < 2) {
      buildEmptyState();
    } else {
      void doSearch(debouncedQ);
    }
  }, [debouncedQ, buildEmptyState, doSearch]);

  // Reset selection when groups change
  useEffect(() => { setSelectedIdx(0); }, [groups]);

  // Scroll selected item into view
  useEffect(() => {
    document.getElementById(`cc-item-${selectedIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // Flat item list for keyboard nav
  const flatItems = groups.flatMap(g => g.items);

  // Execute a result item
  const execute = useCallback((item: CmdItem) => {
    const stored: Omit<StoredItem, "ts"> = {
      id: item.id, kind: item.kind, label: item.label,
      sublabel: item.sublabel, icon: item.icon, href: item.href, group: item.group,
    };
    addToHistory(stored);

    if (item.action) {
      void item.action();
    } else if (item.href) {
      router.push(item.href);
    }
    onClose();
  }, [router, onClose]);

  // Keyboard navigation in the input
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[selectedIdx];
      if (item) execute(item);
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [flatItems, selectedIdx, execute, onClose]);

  // Toggle favorite
  const handleToggleFav = useCallback((e: React.MouseEvent, item: CmdItem) => {
    e.stopPropagation();
    const stored: Omit<StoredItem, "ts"> = {
      id: item.id, kind: item.kind, label: item.label,
      sublabel: item.sublabel, icon: item.icon, href: item.href, group: item.group,
    };
    const next = toggleFavorite(stored);
    setFavorites(next);
  }, []);

  // Render items with a running flat index
  let flatIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position:       "fixed",
          inset:          0,
          background:     "rgba(0,0,0,.45)",
          zIndex:         9998,
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Center"
        style={{
          position:      "fixed",
          top:           "14vh",
          left:          "50%",
          transform:     "translateX(-50%)",
          width:         "min(620px, 94vw)",
          maxHeight:     "72vh",
          background:    "#fff",
          borderRadius:  14,
          boxShadow:     "0 30px 70px rgba(0,0,0,.22), 0 8px 24px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06)",
          zIndex:        9999,
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
          fontFamily:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Input row ── */}
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".875rem 1.25rem", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <span style={{ fontSize: "1rem", color: loading ? "#2563eb" : "#94a3b8", flexShrink: 0, transition: "color .15s" }}>
            {loading ? "⟳" : "🔍"}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls="cc-listbox"
            placeholder="Search campaigns, athletes, pages, actions…"
            style={{
              flex:        1,
              border:      "none",
              outline:     "none",
              fontSize:    ".95rem",
              color:       "#0b1e3d",
              background:  "transparent",
              fontFamily:  "inherit",
              minWidth:    0,
            }}
          />
          {seedingAction && (
            <span style={{ fontSize: ".72rem", color: "#f59e0b", flexShrink: 0, fontWeight: 600 }}>Working…</span>
          )}
          <kbd
            onClick={onClose}
            style={{
              padding: ".2rem .5rem", background: "#f1f5f9",
              border: "1px solid #e2e8f0", borderRadius: 5,
              fontSize: ".68rem", color: "#64748b",
              cursor: "pointer", flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            Esc
          </kbd>
        </div>

        {/* ── Results ── */}
        <div
          id="cc-listbox"
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          style={{ overflowY: "auto", flex: 1 }}
        >
          {groups.length === 0 && !loading && (
            <div style={{ padding: "2.5rem 1.25rem", textAlign: "center", color: "#94a3b8", fontSize: ".85rem" }}>
              {query.length >= 2 ? "No results found." : "Type to search, or browse below."}
            </div>
          )}

          {groups.map(group => (
            <div key={group.label}>
              <GroupHeader label={group.label} />
              {group.items.map(item => {
                const myIdx = flatIdx++;
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    flatIdx={myIdx}
                    selectedIdx={selectedIdx}
                    query={debouncedQ}
                    isFav={favorites.some(f => f.id === item.id)}
                    onSelect={() => execute(item)}
                    onMouseEnter={() => setSelectedIdx(myIdx)}
                    onToggleFav={e => handleToggleFav(e, item)}
                  />
                );
              })}
            </div>
          ))}

          {/* Spacer so last item isn't flush with footer */}
          <div style={{ height: ".5rem" }} />
        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop:  "1px solid #f1f5f9",
          padding:    ".5rem 1.25rem",
          display:    "flex",
          alignItems: "center",
          gap:        "1.25rem",
          background: "#f8fafc",
          flexShrink: 0,
        }}>
          {(
            [
              ["↑  ↓", "navigate"],
              ["↵", "select"],
              ["☆", "pin"],
              ["Esc", "close"],
            ] as [string, string][]
          ).map(([key, label]) => (
            <span key={label} style={{ fontSize: ".68rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: ".35rem" }}>
              <kbd style={{ padding: ".15rem .4rem", background: "#e2e8f0", border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "inherit", fontSize: ".65rem", color: "#475569" }}>
                {key}
              </kbd>
              {label}
            </span>
          ))}
          <span style={{ marginLeft: "auto", fontSize: ".68rem", color: "#cbd5e1" }}>
            ELF Command Center
          </span>
        </div>
      </div>
    </>
  );
}
