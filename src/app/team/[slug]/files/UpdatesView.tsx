"use client";

import CoachBar from "../_components/CoachBar";
import { FILTER_CHIPS, SectionLabel, UpdateCard } from "./UpdateCard";
import type { UpdatesWorkspaceState } from "./useUpdatesWorkspace";

// D5: mobile-only Updates presentation — extracted verbatim (identical
// styling/behavior) from this file's pre-D5 body. Announcement/form/
// filter/upload state now lives in useUpdatesWorkspace.ts, shared with the
// new desktop workspace; UpdatesWorkspaceView.tsx renders this inside
// Communications.module.css's .mobileOnly wrapper and owns the Add/Edit
// modal itself (AnnouncementFormModal.tsx) so it is never duplicated here.
// The standalone Files section (FilesView.tsx) is no longer rendered by
// this component — it's mounted exactly once by UpdatesWorkspaceView.tsx,
// below both the mobile and desktop presentations, since both presentation
// trees are always mounted simultaneously for a desktop-eligible actor
// (only CSS visibility toggles) — rendering FilesView here AND in
// DesktopUpdatesView.tsx would create two independent, divergent FilesView
// instances instead of one.
export default function UpdatesView({
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
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Section header ── */}
      <div style={{ marginBottom: ".5rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Updates
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Updates
          </h2>
          {items.length > 0 && (
            <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {items.length} post{items.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={canEdit} label="Post Update" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Filter chips ──
          Horizontally scrollable by design once chips overtake the
          viewport width (narrow phones can't fit all 6+ without either
          shrinking text illegibly or wrapping to a second row) — the
          right-edge fade signals "more chips this way, scroll/swipe" so it
          reads as an intentional scroll strip instead of a clipped list. */}
      <div style={{
        display: "flex", gap: ".35rem", overflowX: "auto",
        marginBottom: ".65rem", paddingBottom: ".2rem", scrollbarWidth: "none",
        WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent 100%)",
        maskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent 100%)",
      } as React.CSSProperties}>
        {FILTER_CHIPS.map(chip => {
          const active = filterCat === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setFilterCat(chip.id)}
              style={{
                flexShrink: 0, padding: ".3rem .75rem", borderRadius: 100,
                border: active ? "none" : "1px solid #e5e7eb",
                background: active ? "#0b1e3d" : "#fff",
                color: active ? "#fff" : "#6b7280",
                fontSize: ".7rem", fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap", lineHeight: 1.4,
                transition: "background .13s ease, color .13s ease, border-color .13s ease",
              }}
            >
              {chip.label}
            </button>
          );
        })}
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
