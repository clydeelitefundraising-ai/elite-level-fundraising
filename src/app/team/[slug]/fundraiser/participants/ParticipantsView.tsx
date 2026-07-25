"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OutreachCurrentRow } from "@/lib/teamData";
import type { AthleteProgress } from "@/lib/teamRanking";
import { AthleteProgressCard, NeedsAttentionCard } from "../../analytics/AnalyticsView";

type Tab = "all" | "attention";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all",       label: "All Participants" },
  { id: "attention", label: "Needs Attention" },
];

export default function ParticipantsView({
  slug,
  primary,
  athleteProgress,
  needsAttention,
  outreachMap,
}: {
  slug:            string;
  primary:         string;
  athleteProgress: AthleteProgress[];
  needsAttention:  AthleteProgress[];
  outreachMap:     Record<string, OutreachCurrentRow>;
}) {
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "attention" ? "attention" : "all";
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".85rem" }}>
        <a
          href={`/team/${slug}/fundraiser`}
          style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", fontSize: ".78rem", fontWeight: 600, color: "#6b7280", textDecoration: "none", marginBottom: ".35rem" }}
        >
          ← Fundraiser
        </a>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Fundraiser Participants
        </h2>
      </div>

      {/* ── Segmented control ── */}
      <div style={{
        display: "flex", gap: ".4rem", marginBottom: "1rem",
        background: "#eef0f4", padding: ".25rem", borderRadius: 12,
      }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const count = t.id === "attention" ? needsAttention.length : athleteProgress.length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
                padding: ".55rem .5rem",
                background: active ? "#fff" : "transparent",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                border: "none", borderRadius: 9,
                fontSize: ".8rem", fontWeight: 700,
                color: active ? "#0b1e3d" : "#6b7280",
                cursor: "pointer",
              }}
            >
              {t.label} <span style={{ opacity: .6, fontWeight: 600 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {tab === "all" ? (
        athleteProgress.length === 0 ? (
          <EmptyState message="No participants yet." />
        ) : (
          <AthleteProgressCard athleteProgress={athleteProgress} primary={primary} />
        )
      ) : needsAttention.length === 0 ? (
        <EmptyState message="Nobody currently needs attention — everyone is on track." />
      ) : (
        <NeedsAttentionCard needsAttention={needsAttention} slug={slug} initialOutreachMap={outreachMap} />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "2rem 1.25rem", textAlign: "center",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", color: "#9ca3af", fontSize: ".85rem",
    }}>
      {message}
    </div>
  );
}
