import { notFound } from "next/navigation";
import { getCampaignSettings, getDonations } from "@/lib/supabase";
import type { CampaignSettings, DonationRow } from "@/lib/supabase";
import { getAthleteById, getTeamAthletes, getOutreachMap } from "@/lib/teamData";
import type { TeamAthleteRow } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import FundraiserView from "./FundraiserView";
import type { LeaderboardEntry, FeedDonation } from "./FundraiserView";
import AnalyticsView from "../analytics/AnalyticsView";
import type { TeamStats, PaceData, AthleteProgress, TopDonor } from "../analytics/AnalyticsView";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

function daysLeft(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarBg(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

// ── Data builders ─────────────────────────────────────────────────────────────

function buildLeaderboard(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
): LeaderboardEntry[] {
  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;

  const totals:      Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const donorCounts: Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));

  for (const d of donations) {
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      totals[d.athlete_id]      += d.amount_cents;
      donorCounts[d.athlete_id] += 1;
    } else if (!d.athlete_id && d.athlete_name) {
      const aid = nameToId[d.athlete_name];
      if (aid) {
        totals[aid]      = (totals[aid]      ?? 0) + d.amount_cents;
        donorCounts[aid] = (donorCounts[aid] ?? 0) + 1;
      }
    }
  }

  return athletes
    .map(a => ({
      id:            a.id,
      name:          a.name,
      profile_photo: a.profile_photo,
      event:         a.event,
      raisedCents:   totals[a.id]      ?? 0,
      goalCents:     a.goal_cents      ?? null,
      donorCount:    donorCounts[a.id] ?? 0,
      rank:          0,
    }))
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

function buildTeamFeed(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
  limit = 15,
): FeedDonation[] {
  const idToName: Record<string, string> = {};
  for (const a of athletes) idToName[a.id] = a.name;

  return donations.slice(0, limit).map(d => ({
    donor_name:       d.donor_name,
    amount_cents:     d.amount_cents,
    athlete_label:    (d.athlete_id && idToName[d.athlete_id])
                        ? idToName[d.athlete_id]
                        : (d.athlete_name ?? null),
    donation_message: d.donation_message,
    created_at:       d.created_at,
  }));
}

// ── Coach view ────────────────────────────────────────────────────────────────

function TeamCampaignView({
  settings,
  raisedCents,
  donorCount,
  leaderboard,
  teamFeed,
}: {
  settings:    CampaignSettings;
  raisedCents: number;
  donorCount:  number;
  leaderboard: LeaderboardEntry[];
  teamFeed:    FeedDonation[];
}) {
  const pct        = settings.goal_cents > 0
    ? Math.min(100, Math.round((raisedCents / settings.goal_cents) * 100))
    : 0;
  const remaining  = settings.deadline ? daysLeft(settings.deadline) : null;
  const avgDonation = donorCount > 0 ? Math.round(raisedCents / donorCount) : null;

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

      {/* ── Progress card ── */}
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".875rem" }}>
        <div style={{ background: settings.primary_color, padding: "1.25rem 1.25rem .875rem", color: "#fff" }}>
          {settings.season && (
            <div style={{ fontSize: ".65rem", opacity: .75, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".25rem" }}>
              {settings.season}
            </div>
          )}
          <div style={{ fontWeight: 800, fontSize: "1.1rem", lineHeight: 1.2 }}>{settings.school_name}</div>
          {[settings.mascot, settings.sport_name].filter(Boolean).length > 0 && (
            <div style={{ fontSize: ".82rem", opacity: .85, marginTop: ".2rem" }}>
              {[settings.mascot, settings.sport_name].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ background: settings.secondary_color || "rgba(255,255,255,.25)", height: 3, borderRadius: 2, marginTop: ".875rem", marginLeft: "-1.25rem", marginRight: "-1.25rem", marginBottom: "-.875rem" }} />
        </div>

        <div style={{ padding: "1.25rem" }}>
          <div style={{ marginBottom: ".875rem" }}>
            <span style={{ fontSize: "2rem", fontWeight: 800, color: "#111827" }}>
              {fmt(raisedCents)}
            </span>
            {settings.goal_cents > 0 && (
              <span style={{ fontSize: ".9rem", color: "#6b7280", marginLeft: ".35rem" }}>
                of {fmt(settings.goal_cents)} goal
              </span>
            )}
          </div>

          {settings.goal_cents > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ height: 12, background: "#f3f4f6", borderRadius: 100, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${settings.primary_color}, ${settings.primary_color}cc)`, borderRadius: 100, transition: "width .4s ease" }} />
              </div>
              <div style={{ marginTop: ".4rem", fontSize: ".75rem", fontWeight: 700, color: settings.primary_color }}>
                {pct}% funded
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", paddingTop: ".875rem", borderTop: "1px solid #f3f4f6" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>{donorCount}</div>
              <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>donor{donorCount !== 1 ? "s" : ""}</div>
            </div>
            {avgDonation !== null && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>{fmt(avgDonation)}</div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>avg donation</div>
              </div>
            )}
            {settings.goal_cents > 0 && avgDonation === null && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827" }}>{fmt(Math.max(0, settings.goal_cents - raisedCents))}</div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>still needed</div>
              </div>
            )}
            {remaining !== null && (
              <div style={{ flex: 1, textAlign: "center", borderLeft: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: remaining <= 7 ? "#dc2626" : "#111827" }}>{remaining}</div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>day{remaining !== 1 ? "s" : ""} left</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Share link ── */}
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".875rem" }}>
        <div style={{ padding: "1rem 1.1rem .875rem" }}>
          <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".5rem" }}>
            Share Campaign
          </div>
          <a
            href={`/campaign/${settings.campaign_slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".75rem .9rem", background: "#f8f9fb", borderRadius: 10, border: "1px solid #e5e7eb", textDecoration: "none" }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d", marginBottom: ".1rem" }}>Donation Page</div>
              <div style={{ fontSize: ".68rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                /campaign/{settings.campaign_slug}
              </div>
            </div>
            <span style={{ fontSize: ".75rem", color: "#9ca3af", flexShrink: 0 }}>↗</span>
          </a>
        </div>
      </div>

      {/* ── Team leaderboard ── */}
      {leaderboard.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".875rem" }}>
          <div style={{ padding: ".875rem 1rem .5rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: ".5rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Team Leaderboard
            </div>
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem" }}>
              {leaderboard.length}
            </span>
          </div>
          <div style={{ padding: ".25rem 0" }}>
            {leaderboard.map((entry, i) => {
              const pctEntry = entry.goalCents && entry.goalCents > 0
                ? Math.min(100, Math.round((entry.raisedCents / entry.goalCents) * 100))
                : null;
              const bg = avatarBg(entry.name);
              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: ".65rem",
                    padding: ".6rem 1rem",
                    borderBottom: i < leaderboard.length - 1 ? "1px solid #f9fafb" : "none",
                  }}
                >
                  <div style={{ width: 22, fontWeight: 800, fontSize: ".72rem", color: entry.rank <= 3 ? "#0b1e3d" : "#9ca3af", flexShrink: 0, paddingTop: ".2rem", textAlign: "center" }}>
                    #{entry.rank}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {entry.profile_photo ? (
                      <img src={entry.profile_photo} alt={entry.name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".65rem", color: "#fff" }}>
                        {initials(entry.name)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".15rem" }}>
                      <span style={{ fontWeight: 700, fontSize: ".83rem", color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>
                        {entry.name}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#0b1e3d", flexShrink: 0 }}>
                        {fmt(entry.raisedCents)}
                      </span>
                    </div>
                    {entry.event && (
                      <div style={{ fontSize: ".68rem", color: "#9ca3af", marginBottom: ".25rem" }}>
                        {entry.event}{entry.donorCount > 0 ? ` · ${entry.donorCount} donor${entry.donorCount !== 1 ? "s" : ""}` : ""}
                      </div>
                    )}
                    {pctEntry !== null && (
                      <div>
                        <div style={{ height: 5, background: "#f3f4f6", borderRadius: 100, overflow: "hidden", marginBottom: ".18rem" }}>
                          <div style={{ height: "100%", width: `${pctEntry}%`, background: settings.primary_color, borderRadius: 100 }} />
                        </div>
                        <div style={{ fontSize: ".63rem", color: settings.primary_color, fontWeight: 700 }}>
                          {pctEntry}% of goal
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Team donation feed ── */}
      {teamFeed.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".875rem" }}>
          <div style={{ padding: ".875rem 1rem .5rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: ".5rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Recent Donations
            </div>
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem" }}>
              {donorCount}
            </span>
          </div>
          <div style={{ padding: ".25rem 0" }}>
            {teamFeed.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: ".65rem",
                  padding: ".6rem 1rem",
                  borderBottom: i < teamFeed.length - 1 ? "1px solid #f9fafb" : "none",
                  alignItems: "flex-start",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: settings.secondary_color || "#1d4ed8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: ".62rem", color: "#fff", flexShrink: 0,
                }}>
                  {d.donor_name ? initials(d.donor_name) : "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".15rem" }}>
                    <span style={{ fontWeight: 800, fontSize: "1rem", color: "#059669" }}>
                      {fmt(d.amount_cents)}
                    </span>
                    <span style={{ fontSize: ".62rem", color: "#9ca3af", flexShrink: 0 }}>
                      {timeAgo(d.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: ".75rem", color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {d.donor_name ?? "Anonymous"}
                    {d.athlete_label && (
                      <span style={{ color: "#9ca3af" }}> → {d.athlete_label}</span>
                    )}
                  </div>
                  {d.donation_message && (
                    <div style={{ fontSize: ".7rem", color: "#9ca3af", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: ".12rem" }}>
                      &ldquo;{d.donation_message}&rdquo;
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_ATHLETE_GOAL_CENTS = 50_000;

export default async function FundraiserPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);

  if (!settings) notFound();

  // ── Public visitor — read-only campaign view (no analytics, no donate modal) ──
  if (actor.kind === "public") {
    const [athletes, donations] = await Promise.all([
      getTeamAthletes(slug),
      getDonations(slug),
    ]);
    const raisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
    const leaderboard = buildLeaderboard(athletes, donations);
    const teamFeed    = buildTeamFeed(athletes, donations);
    return (
      <TeamCampaignView
        settings={settings}
        raisedCents={raisedCents}
        donorCount={donations.length}
        leaderboard={leaderboard}
        teamFeed={teamFeed}
      />
    );
  }

  // ── Coach / staff ──
  if (actor.kind === "coach") {
    const [athletes, donations, outreachMap] = await Promise.all([
      getTeamAthletes(slug),
      getDonations(slug),
      getOutreachMap(slug),
    ]);

    const raisedCents = donations.reduce((s, d) => s + d.amount_cents, 0);
    const leaderboard = buildLeaderboard(athletes, donations);
    const teamFeed    = buildTeamFeed(athletes, donations);

    // ── Analytics data ────────────────────────────────────────────────────────
    const teamGoalCents = settings.goal_cents ?? 0;
    const donorCount    = donations.length;
    const pct           = teamGoalCents > 0
      ? Math.min(100, Math.round((raisedCents / teamGoalCents) * 100))
      : 0;
    const daysRemaining = settings.deadline
      ? Math.max(0, Math.ceil((new Date(settings.deadline).getTime() - Date.now()) / 86_400_000))
      : null;

    const teamStats: TeamStats = {
      raisedCents, teamGoalCents, donorCount,
      avgDonation:  donorCount > 0 ? Math.round(raisedCents / donorCount) : 0,
      pct, daysRemaining,
    };

    let pace: PaceData = null;
    if (settings.deadline && donations.length > 0 && daysRemaining !== null) {
      const oldest         = donations[donations.length - 1];
      const daysSinceFirst = Math.max(1, Math.ceil(
        (Date.now() - new Date(oldest.created_at).getTime()) / 86_400_000,
      ));
      const currentPerDay = raisedCents / daysSinceFirst;
      const safeRemaining = Math.max(1, daysRemaining);
      const neededPerDay  = teamGoalCents > 0
        ? Math.max(0, (teamGoalCents - raisedCents) / safeRemaining)
        : 0;
      pace = {
        daysRemaining:   safeRemaining,
        neededPerDay:    Math.round(neededPerDay),
        currentPerDay:   Math.round(currentPerDay),
        projectedFinish: Math.round(raisedCents + currentPerDay * safeRemaining),
        onTrack:         teamGoalCents > 0 ? currentPerDay >= neededPerDay : true,
      };
    }

    const nameToId: Record<string, string> = {};
    const idToName: Record<string, string> = {};
    for (const a of athletes) { nameToId[a.name] = a.id; idToName[a.id] = a.name; }

    const totals:      Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
    const donorCounts: Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
    const lastDon:     Record<string, string | null> = Object.fromEntries(athletes.map(a => [a.id, null]));

    for (const d of donations) {
      let aid: string | undefined;
      if (d.athlete_id && totals[d.athlete_id] !== undefined)       aid = d.athlete_id;
      else if (!d.athlete_id && d.athlete_name)                     aid = nameToId[d.athlete_name];
      if (aid) {
        totals[aid]      = (totals[aid]      ?? 0) + d.amount_cents;
        donorCounts[aid] = (donorCounts[aid] ?? 0) + 1;
        if (!lastDon[aid]) lastDon[aid] = d.created_at;
      }
    }

    const athleteProgress: AthleteProgress[] = athletes
      .map(a => {
        const raised = totals[a.id] ?? 0;
        const goal   = a.goal_cents ?? null;
        return {
          id:             a.id,
          name:           a.name,
          event:          a.event,
          profile_photo:  a.profile_photo ?? null,
          raisedCents:    raised,
          goalCents:      goal,
          pct:            goal && goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : null,
          donorCount:     donorCounts[a.id] ?? 0,
          lastDonationAt: lastDon[a.id],
          rank:           0,
          contact_phone:  a.contact_phone ?? null,
          contact_email:  a.contact_email ?? null,
        };
      })
      .sort((a, b) => b.raisedCents - a.raisedCents)
      .map((a, i) => ({ ...a, rank: i + 1 }));

    const needsAttention = athleteProgress.filter(a =>
      a.raisedCents === 0 || a.donorCount <= 1 || (a.pct !== null && a.pct < 10),
    );

    const donorMap = new Map<string, { totalCents: number; count: number; athletes: Set<string> }>();
    for (const d of donations) {
      const key = d.donor_name ?? "Anonymous";
      if (!donorMap.has(key)) donorMap.set(key, { totalCents: 0, count: 0, athletes: new Set() });
      const entry = donorMap.get(key)!;
      entry.totalCents += d.amount_cents;
      entry.count++;
      const ath = d.athlete_id ? idToName[d.athlete_id] : (d.athlete_name ?? undefined);
      if (ath) entry.athletes.add(ath);
    }
    const topDonors: TopDonor[] = Array.from(donorMap.entries())
      .map(([name, data]) => ({
        name,
        totalCents:    data.totalCents,
        donationCount: data.count,
        athletes:      Array.from(data.athletes),
      }))
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 10);

    return (
      <>
        <TeamCampaignView
          settings={settings}
          raisedCents={raisedCents}
          donorCount={donorCount}
          leaderboard={leaderboard}
          teamFeed={teamFeed}
        />
        <AnalyticsView
          slug={slug}
          settings={settings}
          teamStats={teamStats}
          pace={pace}
          athleteProgress={athleteProgress}
          needsAttention={needsAttention}
          topDonors={topDonors}
          outreachMap={outreachMap}
        />
      </>
    );
  }

  // ── Member ──
  const { athlete_id: athleteId } = actor.session;

  if (!athleteId) {
    const roster = await getTeamAthletes(slug);
    return <FundraiserView mode="claim" slug={slug} roster={roster} settings={settings} />;
  }

  const [athlete, athletes, donations] = await Promise.all([
    getAthleteById(athleteId),
    getTeamAthletes(slug),
    getDonations(slug),
  ]);

  if (!athlete) {
    const roster = await getTeamAthletes(slug);
    return <FundraiserView mode="claim" slug={slug} roster={roster} settings={settings} />;
  }

  // Per-athlete totals (id-first, name fallback for legacy donations)
  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;
  const totals: Record<string, number> = Object.fromEntries(athletes.map(a => [a.id, 0]));

  for (const d of donations) {
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      totals[d.athlete_id] += d.amount_cents;
    } else if (!d.athlete_id && d.athlete_name) {
      const aid = nameToId[d.athlete_name];
      if (aid) totals[aid] = (totals[aid] ?? 0) + d.amount_cents;
    }
  }

  const athleteRaisedCents = totals[athleteId] ?? 0;

  const donorCount = donations.filter(d =>
    d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name),
  ).length;

  const ranked  = Object.entries(totals).sort(([, a], [, b]) => b - a);
  const rankIdx = ranked.findIndex(([id]) => id === athleteId);
  const rank    = rankIdx >= 0 ? rankIdx + 1 : athletes.length;

  const goalCents = athlete.goal_cents ?? settings.default_athlete_goal_cents ?? DEFAULT_ATHLETE_GOAL_CENTS;

  const recentDonations = donations
    .filter(d => d.athlete_id === athleteId || (!d.athlete_id && d.athlete_name === athlete.name))
    .slice(0, 5)
    .map(d => ({
      donor_name:       d.donor_name,
      amount_cents:     d.amount_cents,
      donation_message: d.donation_message,
      created_at:       d.created_at,
    }));

  const leaderboard = buildLeaderboard(athletes, donations);
  const teamFeed    = buildTeamFeed(athletes, donations);

  return (
    <FundraiserView
      mode="athlete"
      slug={slug}
      athlete={athlete}
      settings={settings}
      athleteRaisedCents={athleteRaisedCents}
      goalCents={goalCents}
      rank={rank}
      totalAthletes={athletes.length}
      donorCount={donorCount}
      recentDonations={recentDonations}
      leaderboard={leaderboard}
      teamFeed={teamFeed}
    />
  );
}
