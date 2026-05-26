import Link from "next/link";
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
  const remaining = daysLeft(settings.deadline);

  return (
    <div>
      <h2 style={{ margin: "0 0 .875rem", fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
        Fundraiser
      </h2>

      {/* Main card */}
      <div style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,.07)",
        border: "1px solid #f0f0f0",
        marginBottom: ".875rem",
      }}>
        {/* Colored header strip */}
        <div style={{
          background: settings.primary_color,
          padding: "1.25rem 1.25rem .875rem",
          color: "#fff",
        }}>
          <div style={{ fontSize: ".65rem", opacity: .75, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".25rem" }}>
            {settings.season}
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.1rem", lineHeight: 1.2 }}>
            {settings.school_name}
          </div>
          <div style={{ fontSize: ".82rem", opacity: .85, marginTop: ".2rem" }}>
            {[settings.mascot, settings.sport_name].filter(Boolean).join(" · ")}
          </div>
        </div>

        {/* Progress section */}
        <div style={{ padding: "1.25rem" }}>
          {/* Amount raised */}
          <div style={{ marginBottom: "1rem" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "#111827" }}>
              {fmt(stats.raised_cents)}
            </span>
            {settings.goal_cents > 0 && (
              <span style={{ fontSize: ".9rem", color: "#6b7280", marginLeft: ".35rem" }}>
                of {fmt(settings.goal_cents)} goal
              </span>
            )}
          </div>

          {/* Progress bar */}
          {settings.goal_cents > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{
                height: 10,
                background: "#f3f4f6",
                borderRadius: 100,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: settings.primary_color,
                  borderRadius: 100,
                  transition: "width .4s ease",
                }} />
              </div>
              <div style={{
                marginTop: ".4rem",
                fontSize: ".75rem",
                fontWeight: 700,
                color: settings.primary_color,
              }}>
                {pct}% funded
              </div>
            </div>
          )}

          {/* Stats row */}
          <div style={{
            display: "flex",
            gap: "1rem",
            paddingTop: ".875rem",
            borderTop: "1px solid #f3f4f6",
          }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>
                {stats.donor_count}
              </div>
              <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>
                donor{stats.donor_count !== 1 ? "s" : ""}
              </div>
            </div>
            {settings.goal_cents > 0 && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>
                  {fmt(Math.max(0, settings.goal_cents - stats.raised_cents))}
                </div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>
                  still needed
                </div>
              </div>
            )}
            {settings.deadline && (
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

      {/* Donate CTA */}
      <Link
        href={`/campaign/${slug}`}
        style={{
          display: "block",
          textAlign: "center",
          background: settings.primary_color,
          color: "#fff",
          borderRadius: 12,
          padding: ".9rem 1.5rem",
          fontWeight: 700,
          fontSize: "1rem",
          textDecoration: "none",
          letterSpacing: ".01em",
        }}
      >
        Donate Now →
      </Link>

      <p style={{ textAlign: "center", fontSize: ".75rem", color: "#9ca3af", marginTop: ".875rem" }}>
        Donations are processed securely on the campaign page.
      </p>
    </div>
  );
}
