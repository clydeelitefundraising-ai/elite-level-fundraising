"use client";

import CoachBar from "../_components/CoachBar";
import { FILTER_CHIPS, SectionLabel, UpdateCard } from "./UpdateCard";
import type { UpdatesWorkspaceState } from "./useUpdatesWorkspace";

// D5: desktop-only Updates presentation. Reuses the exact same header
// pieces (CoachBar), category taxonomy (FILTER_CHIPS), and card component
// (UpdateCard/SectionLabel from UpdateCard.tsx) as the mobile presentation
// — nothing about the announcement content itself is redesigned. The two
// differences from mobile are purely layout: (1) the reading column is
// constrained to a comfortable desktop width instead of stretching
// edge-to-edge on a wide monitor, and (2) the filter-chip row wraps
// normally instead of horizontally scrolling, since desktop has the width
// to show every chip at once — the audit found the scroll-strip was an
// explicitly mobile-shaped decision for narrow phones, not a constraint
// that applies here. Same single-column feed as mobile — no list+detail,
// no two-column inbox, per the locked product decision. The standalone
// Files section is intentionally NOT rendered here — see UpdatesView.tsx's
// comment on why it's mounted exactly once, by the shared wrapper.
const FEED_MAX_WIDTH = 760;

export default function DesktopUpdatesView({
  workspace,
}: {
  workspace: UpdatesWorkspaceState;
}) {
  const {
    slug, canEdit, canDelete,
    items, filterCat, setFilterCat,
    filtered, pinned, todayItems, yesterdayItems, earlierItems,
    openAdd, openEdit, handleDelete,
  } = workspace;

  return (
    <div style={{ width: "100%", maxWidth: FEED_MAX_WIDTH, margin: "0 auto", boxSizing: "border-box" }}>
      {/* ── Header — same 760px column as the feed below it, title/count on
          the left and Post Update on the right via justifyContent:
          space-between (not a flex-spacer div), so the button's right edge
          always lands exactly at this column's right edge regardless of
          any parent layout context. ── */}
      <div style={{ marginBottom: ".75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".65rem", marginBottom: ".85rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
              Team Updates
            </h2>
            {items.length > 0 && (
              <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".68rem", fontWeight: 700, padding: ".18rem .55rem" }}>
                {items.length} post{items.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <CoachBar show={canEdit} label="Post Update" onAdd={openAdd} />
        </div>

        {/* ── Category filters — normal wrapping row, no horizontal scroll,
            same 760px column as the header and feed above/below it ── */}
        <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
          {FILTER_CHIPS.map(chip => {
            const active = filterCat === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setFilterCat(chip.id)}
                style={{
                  padding: ".32rem .8rem", borderRadius: 100,
                  border: active ? "none" : "1px solid #e5e7eb",
                  background: active ? "#0b1e3d" : "#fff",
                  color: active ? "#fff" : "#6b7280",
                  fontSize: ".76rem", fontWeight: 600, cursor: "pointer",
                  whiteSpace: "nowrap", lineHeight: 1.4,
                  transition: "background .13s ease, color .13s ease, border-color .13s ease",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Feed ── */}
      {filtered.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>📢</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            {filterCat === "all" ? "No updates yet" : `No ${filterCat} posts yet`}
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {canEdit ? "Post your first update above." : "Check back soon."}
          </div>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <SectionLabel label="📌 Pinned" />
              {pinned.map(a => <UpdateCard key={a.id} a={a} slug={slug} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
          {todayItems.length > 0 && (
            <>
              <SectionLabel label="Today" />
              {todayItems.map(a => <UpdateCard key={a.id} a={a} slug={slug} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
          {yesterdayItems.length > 0 && (
            <>
              <SectionLabel label="Yesterday" />
              {yesterdayItems.map(a => <UpdateCard key={a.id} a={a} slug={slug} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
          {earlierItems.length > 0 && (
            <>
              <SectionLabel label="Earlier" />
              {earlierItems.map(a => <UpdateCard key={a.id} a={a} slug={slug} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
