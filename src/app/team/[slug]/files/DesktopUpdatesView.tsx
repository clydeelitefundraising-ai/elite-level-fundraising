"use client";

import { Megaphone, Pin } from "lucide-react";
import CoachBar from "../_components/CoachBar";
import { FILTER_CHIPS, SectionLabel, UpdateCard } from "./UpdateCard";
import type { UpdatesWorkspaceState } from "./useUpdatesWorkspace";

// D5 (Phase 6 revision): coach desktop Updates workspace. Reuses the exact
// same content pieces as mobile — CoachBar, FILTER_CHIPS taxonomy,
// UpdateCard/SectionLabel — nothing about announcement content itself is
// redesigned, only composition. Previously this was a single centered
// column (a wide-screen crop of the mobile feed with nothing using the
// freed-up width); Phase 6 restructures it into a genuine two-column
// workspace: a main feed column and a narrower, sticky secondary column
// holding Post Update + category filtering, since both of those already
// exist in useUpdatesWorkspace's data/handlers and are a natural fit for a
// persistent side rail rather than inline chips a coach has to re-scan
// past the header every time. No new features invented to fill space —
// still the same single feed, same data, same filter set. The standalone
// Files section is intentionally NOT rendered here — see UpdatesView.tsx's
// comment on why it's mounted exactly once, by the shared wrapper.
const WORKSPACE_MAX_WIDTH = 1040;
const RAIL_WIDTH = 220;

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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `1fr ${RAIL_WIDTH}px`,
        gap: "2.5rem",
        width: "100%",
        maxWidth: WORKSPACE_MAX_WIDTH,
        margin: "0 auto",
        alignItems: "start",
        boxSizing: "border-box",
      }}
    >
      {/* ── Main feed column ── */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em" }}>
            Team Updates
          </h2>
          {items.length > 0 && (
            <span style={{ background: "var(--surface-light-elevated)", color: "var(--text-muted-app)", borderRadius: "var(--radius-full)", fontSize: ".68rem", fontWeight: 700, padding: ".18rem .55rem" }}>
              {items.length} post{items.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{
            background: "var(--surface-light)", borderRadius: "var(--radius-md)", padding: "2.75rem 1.5rem",
            textAlign: "center", border: "1px solid var(--border-app)",
          }}>
            <Megaphone size={26} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".65rem" }} />
            <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
              {filterCat === "all" ? "No updates yet" : `No ${filterCat} posts yet`}
            </div>
            <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
              {canEdit ? "Post an update using the panel on the right." : "Check back soon."}
            </div>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <SectionLabel label="Pinned" icon={Pin} />
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

      {/* ── Secondary column — Post Update + category filters. Sticky so it
          stays reachable while scrolling a long feed, same way a coach's
          composer/controls should stay in reach on a real workspace. ── */}
      <aside style={{ position: "sticky", top: "1.25rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <CoachBar show={canEdit} label="Post Update" onAdd={openAdd} />

        <div>
          <span style={{ fontSize: ".6rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".09em", display: "block", marginBottom: ".55rem" }}>
            Filter
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: ".2rem" }}>
            {FILTER_CHIPS.map(chip => {
              const active = filterCat === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setFilterCat(chip.id)}
                  className="elf-focus-ring"
                  style={{
                    textAlign: "left", padding: ".4rem .55rem", borderRadius: "var(--radius-sm)",
                    border: "none",
                    background: active ? "var(--surface-light-elevated)" : "transparent",
                    color: active ? "var(--text-primary-app)" : "var(--text-muted-app)",
                    fontSize: ".78rem", fontWeight: active ? 700 : 500, cursor: "pointer",
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
