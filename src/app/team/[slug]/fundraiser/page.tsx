import { getCampaignSettings } from "@/lib/supabase";
import { getDonationStats } from "@/lib/teamData";
import { notFound } from "next/navigation";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency:              "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function daysLeft(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

export default async function FundraiserPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [settings, stats] = await Promise.all([
    getCampaignSettings(slug),
    getDonationStats(slug),
  ]);

  if (!settings) notFound();

  const pct = settings.goal_cents > 0
    ? Math.min(100, Math.round((stats.raised_cents / settings.goal_cents) * 100))
    : 0;
  const remaining = settings.deadline ? daysLeft(settings.deadline) : null;
  const avgDonation = stats.donor_count > 0
    ? Math.round(stats.raised_cents / stats.donor_count)
    : null;

  return (
    <div>
      {/* ── Section header ── */}
      <div style={{ marginBottom: ".625rem" }}>
        <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".12rem" }}>
          Fundraiser
        </span>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Campaign Progress
        </h2>
      </div>

      {/* ── Main card ── */}
      <div style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".875rem",
      }}>
        {/* Colored header strip */}
        <div style={{
          background: settings.primary_color,
          padding: "1.25rem 1.25rem .875rem",
          color: "#fff",
        }}>
          {settings.season && (
            <div style={{ fontSize: ".65rem", opacity: .75, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".25rem" }}>
              {settings.season}
            </div>
          )}
          <div style={{ fontWeight: 800, fontSize: "1.1rem", lineHeight: 1.2 }}>
            {settings.school_name}
          </div>
          {[settings.mascot, settings.sport_name].filter(Boolean).length > 0 && (
            <div style={{ fontSize: ".82rem", opacity: .85, marginTop: ".2rem" }}>
              {[settings.mascot, settings.sport_name].filter(Boolean).join(" · ")}
            </div>
          )}
          {/* Secondary accent strip */}
          <div style={{ background: settings.secondary_color || "rgba(255,255,255,.25)", height: 3, borderRadius: 2, marginTop: ".875rem", marginLeft: "-1.25rem", marginRight: "-1.25rem", marginBottom: "-.875rem" }} />
        </div>

        {/* Progress section */}
        <div style={{ padding: "1.25rem" }}>
          {/* Amount raised */}
          <div style={{ marginBottom: ".875rem" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "#111827" }}>
              {fmt(stats.raised_cents)}
            </span>
            {settings.goal_cents > 0 && (
              <span style={{ fontSize: ".9rem", color: "#6b7280", marginLeft: ".35rem" }}>
                of {fmt(settings.goal_cents)} goal
              </span>
            )}
          </div>

          {/* Progress bar — 12px gradient */}
          {settings.goal_cents > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ height: 12, background: "#f3f4f6", borderRadius: 100, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${settings.primary_color}, ${settings.primary_color}cc)`,
                  borderRadius: 100,
                  transition: "width .4s ease",
                }} />
              </div>
              <div style={{ marginTop: ".4rem", fontSize: ".75rem", fontWeight: 700, color: settings.primary_color }}>
                {pct}% funded
              </div>
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: "flex", gap: "1rem", paddingTop: ".875rem", borderTop: "1px solid #f3f4f6" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>
                {stats.donor_count}
              </div>
              <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>
                donor{stats.donor_count !== 1 ? "s" : ""}
              </div>
            </div>
            {avgDonation !== null && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>
                  {fmt(avgDonation)}
                </div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>
                  avg donation
                </div>
              </div>
            )}
            {settings.goal_cents > 0 && avgDonation === null && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>
                  {fmt(Math.max(0, settings.goal_cents - stats.raised_cents))}
                </div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>
                  still needed
                </div>
              </div>
            )}
            {remaining !== null && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: remaining <= 7 ? "#dc2626" : "#111827" }}>
                  {remaining}
                </div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>
                  day{remaining !== 1 ? "s" : ""} left
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Share section ── */}
      <div style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".875rem",
      }}>
        <div style={{ padding: "1rem 1.1rem .875rem" }}>
          <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".5rem" }}>
            Share Campaign
          </div>
          <a
            href={`/campaign/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: ".6rem",
              padding: ".75rem .9rem",
              background: "#f8f9fb",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d", marginBottom: ".1rem" }}>
                Donation Page
              </div>
              <div style={{ fontSize: ".68rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                /campaign/{slug}
              </div>
            </div>
            <span style={{ fontSize: ".75rem", color: "#9ca3af", flexShrink: 0 }}>↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}
