"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamAthleteRow } from "@/lib/teamData";
import CoachBar from "../_components/CoachBar";
import type { AthleteRosterState } from "./useAthleteRoster";

// D3: this is TeamView.tsx's original body, unchanged in rendering/
// behavior — only its state/handlers moved from local useState calls
// (still verbatim, see useAthleteRoster.ts) into props, so the new
// desktop roster table can share the exact same athlete-management
// workflow instead of a second, independent copy. This component is
// mounted ONLY inside the mobile-visible half of TeamView.tsx's
// mobileOnly/desktopOnly split — the production mobile experience this
// file produces is otherwise identical to before D3. The Add/Edit modal
// itself is no longer rendered here — see AthleteFormModal.tsx and its
// comment on why it must be mounted exactly once, by the shared wrapper.

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

// ── Athlete card ──────────────────────────────────────────────────────────────

function AthleteCard({
  a,
  slug,
  staffMode,
  canDelete,
  onEdit,
  onDelete,
}: {
  a: TeamAthleteRow;
  slug: string;
  staffMode: boolean;
  canDelete: boolean;
  onEdit: (a: TeamAthleteRow) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const router  = useRouter();
  const bg      = avatarColor(a.name);

  return (
    <div
      onClick={staffMode ? () => router.push(`/team/${slug}/team/${a.id}`) : undefined}
      onMouseEnter={staffMode ? () => setHovered(true) : undefined}
      onMouseLeave={staffMode ? () => setHovered(false) : undefined}
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: ".9rem .8rem .75rem",
        boxShadow: (staffMode && hovered)
          ? "0 6px 20px rgba(0,0,0,.10), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: "3px solid #0b1e3d",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        position: "relative",
        transform: (staffMode && hovered) ? "translateY(-2px)" : "none",
        transition: "transform .15s ease, box-shadow .15s ease",
        cursor: staffMode ? "pointer" : "default",
      }}
    >
      {a.jersey_number != null && (
        <span style={{
          position: "absolute", top: ".55rem", right: ".6rem",
          background: "#0b1e3d", color: "#fff", borderRadius: 6,
          fontSize: ".55rem", fontWeight: 800, padding: ".1rem .34rem",
          lineHeight: 1.4, letterSpacing: ".03em",
        }}>
          #{a.jersey_number}
        </span>
      )}

      <div style={{ marginBottom: ".5rem" }}>
        {a.profile_photo ? (
          <img
            src={a.profile_photo}
            alt={a.name}
            style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", display: "block", boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}
          />
        ) : (
          <div style={{
            width: 54, height: 54, borderRadius: "50%", background: bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "1rem", color: "#fff", letterSpacing: ".02em",
            boxShadow: "0 2px 8px rgba(0,0,0,.15)",
          }}>
            {initials(a.name)}
          </div>
        )}
      </div>

      <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d", lineHeight: 1.2, marginBottom: ".28rem" }}>
        {a.name}
      </div>

      {/* Class is the primary attribute shown; Event/Position is secondary */}
      {(a.class_year || a.event) && (
        <span style={{
          display: "inline-block", padding: ".07rem .42rem", borderRadius: 100,
          fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: ".04em", background: "#f0f4ff", color: "#1d4ed8",
          marginBottom: ".2rem",
        }}>
          {a.class_year || a.event}
        </span>
      )}
      {a.class_year && a.event && (
        <div style={{ fontSize: ".6rem", color: "#9ca3af" }}>{a.event}</div>
      )}

      {a.grad_year != null && (
        <div style={{ fontSize: ".63rem", color: "#9ca3af" }}>
          Class of &apos;{String(a.grad_year).slice(-2)}
        </div>
      )}

      {staffMode && (
        <div style={{ display: "flex", gap: ".1rem", justifyContent: "center", marginTop: ".45rem" }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit(a); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
          >
            Edit
          </button>
          {canDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(a.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AthleteRosterGrid({
  slug,
  roster,
  pendingRequestCount = 0,
}: {
  slug: string;
  roster: AthleteRosterState;
  // Phase 3B-1: the Requests Center (/team/[slug]/requests) is now the
  // canonical place to review/approve pending athlete requests — this is
  // only a small contextual pointer, not the approval workflow itself
  // (moved there in full, not duplicated).
  pendingRequestCount?: number;
}) {
  const { staffMode, canDelete, athletes, openAdd, openEdit, handleDelete } = roster;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {canDelete && pendingRequestCount > 0 && (
        <a
          href={`/team/${slug}/requests`}
          style={{
            display: "flex", alignItems: "center", gap: ".5rem",
            background: "#fff", borderRadius: 12, padding: ".7rem .9rem",
            marginBottom: "1rem", textDecoration: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
            borderLeft: "3px solid #dc2626",
          }}
        >
          <span style={{
            background: "#fee2e2", color: "#b91c1c", borderRadius: 100,
            fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", flexShrink: 0,
          }}>
            {pendingRequestCount}
          </span>
          <span style={{ flex: 1, fontSize: ".82rem", fontWeight: 700, color: "#0b1e3d" }}>
            Pending athlete request{pendingRequestCount !== 1 ? "s" : ""} — review in Requests
          </span>
          <span style={{ fontSize: ".85rem", color: "#c1c7d0" }}>→</span>
        </a>
      )}

      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Hub
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team
          </h2>
          {athletes.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {athletes.length} athlete{athletes.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={staffMode} label="Add Athlete" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Grid ── */}
      {athletes.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>👥</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            Team is empty
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {staffMode ? "Add your first athlete above." : "Team roster coming soon."}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: ".65rem" }}>
          {athletes.map(a => (
            <AthleteCard
              key={a.id}
              a={a}
              slug={slug}
              staffMode={staffMode}
              canDelete={canDelete}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
