"use client";

import { useState } from "react";
import type { TeamAthleteRow } from "@/lib/teamData";
import AthleteRequestsPanel from "./AthleteRequestsPanel";

// ── Section wrapper (Phase 3B-1) ────────────────────────────────────────────
//
// Deliberately a plain presentational wrapper, not a request-type registry
// or workflow engine — Phase 3B-2 (Comment Approvals) adds itself by
// rendering a second <RequestSection> here, the same way this one was
// added. Nothing about this shape assumes "athlete requests" specifically.
function RequestSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".6rem" }}>
        <h3 style={{ margin: 0, fontSize: ".78rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" }}>
          {title}
        </h3>
        {count > 0 && (
          <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 100, fontSize: ".6rem", fontWeight: 700, padding: ".1rem .42rem" }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "1rem .85rem",
      textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      fontSize: ".82rem", color: "#9ca3af",
    }}>
      {message}
    </div>
  );
}

export default function RequestsView({
  slug,
  rosterAthletes,
}: {
  slug: string;
  rosterAthletes: TeamAthleteRow[];
}) {
  const [athleteRequestCount, setAthleteRequestCount] = useState(0);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: "1rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Head Coach
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Requests
        </h2>
        <p style={{ margin: ".25rem 0 0", fontSize: ".82rem", color: "#6b7280" }}>
          Review items that need your approval.
        </p>
      </div>

      <RequestSection title="Athlete Requests" count={athleteRequestCount}>
        <AthleteRequestsPanel
          slug={slug}
          rosterAthletes={rosterAthletes}
          onCountChange={setAthleteRequestCount}
          emptyState={<EmptyRow message="No pending athlete requests." />}
          hideHeader
        />
      </RequestSection>

      {/* Phase 3B-2 will add a second <RequestSection title="Comment
          Approvals" count={...}> here — no placeholder rendered now, per
          instruction not to show fake "coming soon" content. */}
    </div>
  );
}
